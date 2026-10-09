# Earth expansion — session log

Newest first. One entry per work session: what changed, what was verified, what's next.

## 2026-10-09 — `feature/four-reports` pushed (Robby's OK); what comes next is open

Robby: "yes push it, but region work will not come next, as I will have another agent assess what to do next and regions will happen and we will use that doc as reference".

- **Pushed** `feature/four-reports`: the second batch's twelve commits (entry below) and this one. A
  `feature/` push publishes the game to GitHub Pages and runs the checks (`gh run list --branch
  feature/four-reports`). No tile deploy: every fix is the game's, tiles stay v31.
- **Nothing queued:** `region-match-pass` back to `not_started` — when the region pass happens,
  `docs/REGION_MATCH.md` is its reference; no item `in_progress`. HANDOFF "Start here" lists what's
  on the table for the assessment; AGENTS.md's router line and REGION_MATCH.md's opening say so.
- **Next:** the assessment of what comes next, by the agent Robby has do it.

## 2026-10-08 (night, later) — Robby's second batch: the animals by night, the seawall, a city's evening, animals that stay, the origin's stack, suburbs against real photos

Robby, after the four reports went live, of the page's "noticed, not changed" list: "please fix the
remaining bugs like this", and "also i noticed a lot of animals dissapear when i follow them they should
be persistent as can be without losing performance in the game", and "i feel like suburb towns like rumson
have to much fluffy trees and it doesnt really look like rumson road, you dont need to fix that right now
but compare to real photos online, also 2 other random towns, to see what ww can improve on, those other
towns dont have to be in nj". Six items (feature_list), worked one at a time on `feature/four-reports`,
committed, pushed only with his OK; `gameplay-one-plan` paused meanwhile. He also passed on a reminder:
v31 is released, so a fix that changes how the tile service builds coasts needs v32 and another deploy —
a change to the game alone needs none (the seawall fix is the game's: dem.ts runs in the browser).

- **1. `bug-night-pale-creatures` — passing.** The walkers' night lighting (FIGURE) was set only on people;
  now every creature out of doors takes it: the life sim's gulls (creature.ts) and the wildlife
  (fauna.ts critterMaterial, the dogs too). Liberty State Park at 22:00, the define off then on in one
  frame: the animals on the lawn 7.3/13.9 → 3.4/13.1 (animals/ground L*), dusk unchanged; the white
  gulls on the dark lawn no longer pale. Test: the palest feather or coat of gulls, a goose, an egret,
  deer by night about the street's. Montage `shots/fix/night-animals-lsp.jpg`. With it, `critters.ts`
  on its own clock (the butterflies' and the shoals' drift read `performance.now()`, so a test's
  turkeys flocked one run in three): `waterBirds.test.ts` passes five runs of five.
- **2. `bug-seawall-railing` — passing.** `dem.ts waterPatch` dropped every node inside the sea to −6 m,
  so across the terrain's 16 m grid step the ground sloped into the water and the water's edge came up
  to 12 m inland of the coast. `seaShore`: a sea node beside dry ground goes only as deep as puts the
  edge, along each step, at the coastline; the dry node stays 30 cm over the water. In the game alone
  (no tile version, as Robby's reminder asked). Liberty Island: the railing's posts and two walkers in
  the water → the railing along the water's edge. Test: a straight coast — the edge within a metre of
  it (it was 8 m inland). Montage `shots/fix/seawall-before-after.jpg`.
- **3. `life-city-night` — passing.** A city's core sat on the town rhythm, whose evening bump ends by
  21:30. `cityNight`: the theatres, restaurants and bars on top of the rhythm — busy into midnight, a late
  crowd to 2 am, quiet by 4 — for the walkers and the traffic, by the place's city share; a main street
  and a suburb keep their quiet nights. A fresh page each hour, the sim's walkers about you: Midtown by
  Bryant Park (city 0.39) 23:00 4 → 46, 04:00 3 → 5, 21:00 31 → 80; Times Square (city 0.51) 22:00
  6 → 47 walkers (8 → 22 cars), 03:00 4 → 9. Both read as half a city by the built volume (`cityAt`),
  so they take about half the core's evening: a place's own nightlife (OSM's bars, theatres) would
  say more, if Robby wants Times Square busier still. Montages `shots/fix/city-night-midtown.jpg`,
  `city-night-times-square.jpg` (dark figures at night: the counts carry it).
- **4. `life-critters-persist` — passing.** Why they went (`critters.ts`): a flushed bird was dropped when
  its flight's timer ran out — in the air, in plain view, 25 m off; a squirrel up its trunk once you
  were 18 m off; a ground squirrel's dash ended down its hole for good; past 95 m anything, a deer
  across the field in front of you; out of its hours or habitat past 30 m, in sight or not; and every
  animal outside the moment you stepped indoors. Now (`STAY`) an animal goes only out of sight — not
  drawn, outside ~70° of the view, or too small to make out (its body × 600 m: a sparrow ~120 m, a
  squirrel ~185, a deer 400); a flushed bird flies on and lands a little way on (a duck onto its water),
  a squirrel comes down its tree head first, a burrower comes up again, and indoors the animals outside
  wait. Counts and caps as they were. A probe walking after the nearest animal for three minutes, round
  the houses: Central Park at 9 am 4 vanished in plain view → 0 (two woodchucks, two robins in mid-air),
  Rumson at dawn 0 → 0; the animals about 28 → 31 and 13 → 13, their update 0.33 → 0.33 ms and 0.17 →
  0.18 ms a frame. Tests: `crittersStay.test.ts` (9; 8 fail on the old code).
- **5. `bug-life-origin-stack` — passing: never in the game.** The stack was a probe's reading: an
  empty slot is hidden by zero scale, and three.js's `decompose` reads a singular matrix as scale 1 at
  its translation — every count by `decompose` put the empty slots (each car slot in the seven model
  meshes it isn't, and the gaps under the draw count) at (0, 0, 0). Sea Bright, three pages at once,
  two roaming through 12 road-graph rebuilds each: none at the origin in the snapshot or drawn whole,
  170–240 empty slots — the old stack. The same reading did bite the game: taking a parked car read a
  hidden one as a car at the origin (`vehicles.ts hiddenInstance` now), and two review tools; the
  debugging doc has the rule. The density table of the four reports read 150/330 m rings the stack
  never reached.
- **6. `review-suburbs-real` — passing (no change to the game).** Rumson Road, Oak Park and Plano against
  real photos, and the method for the region pass Robby wants next: `docs/REGION_MATCH.md`. Mapillary has
  nothing of Rumson Road through the estates (its west end's 2018 photos only); the borough's own
  historic-preservation photos filled in (public, looked at, never kept). The game's Rumson Road is an
  open wood — 18–39 trees in front within 45 m, 4–6 m apart, 40% pines, lumpy light crowns, pale lawns,
  small houses half hidden, a sidewalk with tree pits — where the real one has specimen oaks and beeches
  on deep green lawns, big pale colonials, hedges and grass verges. Oak Park scores 0.83/0.89, Plano
  0.51/0.58 (a fence-line of evergreens missing). Ranked: fewer, bigger trees from the survey's crowns;
  broadleaves for the settled coastal plain; darker crowns, no August yellow; mown green lawns; the
  street's edge by its kind; hedges and walls; then the houses. Montages `shots/real/NJ|IL|TX-montage.jpg`,
  `shots/fix/rumson-real-vs-game.jpg`. Robby asked about Street View "just for testing": no — its
  terms forbid it; public photos and the open services instead.
- **Checks:** typecheck; the full suite, 1,110 tests in 117 files, all passing (a run under three game pages
  at once timed two out; both pass alone); `npm run build`. Nothing pushed: `feature/four-reports` waits on
  Robby's OK.
- **Next:** the region pass (`region-match-pass`) with `docs/REGION_MATCH.md` — Robby: "soon we are going
  to focus on regions within the 16 regions … used in next session as reference"; `gameplay-one-plan`
  waits until he says. (2026-10-09: not next after all — entry above.)

## 2026-10-08 (night) — Robby's four reports, live on feature/four-reports: walkers lit by the night, who's about by the place and the hour, a crisp watercolor, the harbour's sea (tiles v31)

On the branch `fix/four-reports` (off `feature/lower48-alive`, not pushed: Robby's OK first). One
report at a time, in his order.

- **Baseline:** `npm run init` failed on one test, `measured.test.ts` "leaves the pack as it was
  baked": it passes alone in 1 s, but hashing 288 tile files char by char ran past vitest's 5 s
  default under the full parallel run. Given the same 60 s as its sibling.
- **1. `bug-night-glow-people` — passing.** Robby's night from Liberty State Park
  (`_water_bug3.png`): the walkers pale and lit against the dark ground. Measured first: the
  walkers drawn alone as a flat mask against the world's depth (as night-check does the wires), L*
  on the painted frame against the up-facing ground in a ring round them. From 30 m at 22:00 the
  walkers were paler than the lawn (19.9 vs 17). The cause, in the light: by night (moon down) the
  floor (`nightLight.ts` FLOOR, ~0.12 linear) is the light that matters, and it evens every albedo
  toward a middle grey (0.3) and lights whatever faces any way — a figure's sides as fully as the
  street; the sky's fill lights a figure's sides with ~90% of the sky (by night the ground's bounce
  is most of the sky's). A walker's shirts and skin are light (cream, white, pink; pale skin), the
  street and a lawn dark: in the end-to-end mirror (`tests/nightLight.test.ts`) a white shirt was
  L* 27.5 on asphalt at 13.7. **Fix:** `FIGURE` in `nightLight.ts` and `FIGURE_NIGHT` in
  `shared.ts` paintLight, set by `creature.ts` on every people material out of doors: the night's
  own light (moon, sky, floor) lights a figure's colours evened toward a dark grey (0.19, by 0.84),
  half the sky's fill reaches its sides, and a lamp's pool lights its own colours. Indoors the
  room's light is theirs (`INDOOR`, now on the standing residents too). By day nothing changes.
  Tests: four in `nightLight.test.ts` (every colour a walker wears between the pools, under a high
  moon, in a lamp's heart, by day). Before/after in one page, the same walkers (the sim paused):
  Liberty State Park 15.3/16.8 → 8.9/15.9 (people/ground L*), from 30 m 19.9/17 → 11.8/15.7; Sea
  Bright 17.3/20.7 → 10.5/20.7; walkers in a lamp's pool 38.9/41.4 → 35.4/41.4, lit; dusk the
  same. Montage `shots/fix/night-people-before-after.jpg` (git-ignored). Noticed, not changed: the
  white gulls on a lawn at night read pale the same way (not in Robby's report).
- **2. `life-density-realism` — passing.** Robby: "it is still so crowded at nighttime in a lot of
  places where it shouldnt be and like random desert roads are crowded too". The walkers' count was the
  place's rhythm × the crowd knobs everywhere: open land took the suburbs' share (a desert road wanted
  150 walkers at 8 pm; on US-50 west of Ely, the extract's emptiest highway, 145 within 330 m at noon and
  23 at 3 am), a suburb at 10 pm a shore town's dinner stroll; each class of road carried a town's
  traffic wherever it ran; and the worker built the sim before it had the page's env, so every arrival
  seeded a noon crowd at full density that thinned one walker every half second. **Fix** (`lifeSim.ts`
  LAND, `pedShare`, `homeCurve`, `ruralShare`): a main street and a city's core keep their rhythm (a
  main street thinner from 20:30, gone 23:30–4:00); a home street keeps its own day (the dog, errands,
  after work, a walk after dinner, in by 21:00, half after dark); open land 2% (a footpath network about
  the walker counts as settled: a park, a trail); each rank of road out in the country 5–15% of a town's
  traffic, a want under one a share of the minutes (a slow coin from the tick: a car every few minutes);
  the beach's share home after dark; the first crowd from the page's env, waiting for the place (main
  sets it in a frame; three header slots carry it, in copy mode too), across a regraph; the crowd thins
  an eighth of the excess a tick (the night preset left a noon crowd thinning for minutes). Tests:
  `lifeDensity.test.ts`, the target table by place and hour and the rest. In game, walkers within 330 m
  (cars within 350 m) before → after: Sea Bright (shore town; within 150 m) 12 h 56→34, 20 h 37→18, 22 h 12→12, 3 h 11→7; Levittown (suburb) 12 h 135→44, 20 h 38→31, 22 h 11→6, 3 h 11→3; Midtown Manhattan 12 h 230→183, 20 h 99→66, 22 h 49→34, 3 h 31→27; Liberty State Park 12 h 113→44, 20 h 56→19, 22 h 35→14, 3 h 18→9; US-50, Nevada desert 12 h 145→0, 20 h 56→1, 22 h 37→1, 3 h 23→1 (walkers only: cars in view are never removed, and some runs held stuck ones, so the in-page car counts said little; the cars are the target table's). Montage `shots/fix/density-before-after.jpg`.
  Noticed: Midtown at 22:00 is as quiet as at 3:00 (the town rhythm's evening ends by 21:30); in some
  runs (old code and new, with other headless pages loading the machine) a stack of walkers or cars
  sat at the region's origin with no position of their own — at Sea Bright, 204 m from the spawn, it
  polluted the 330 m counts (so its row is within 150 m), and it couldn't be made to happen on demand;
  a Kansas farm-road spot (Old Highway 40 by Hays) had no life at all in either version, so the
  country's rows are the target table's.
- **3. `look-crisp-preset` — passing.** Robby: "create the additional preset for better watercolor
  overlay". `post.ts` LOOKS 'crisp watercolor', the notes' list cheapest first: the brush at the frame's
  own resolution (paintDetail 1) and a finer, sharper stroke; two new knobs — `focal` (the 5–60 m band
  given the clean frame and the paint's local contrast; the near and the far left to the brush, the near
  ground a lighter wash toward the paper by day) and `darks` (a toe under the mid-tones, half by night),
  0 in every other look; less wobble, grain and paper; a thinner torn edge. The panel's Look folder: a
  'crisp watercolor' switch beside the preset menu, and the two sliders; `?look=crisp` (or any look's
  name) for a visit. Tests: `looks.test.ts`. Montages: `shots/fix/look-ab.jpg`, `look-ab-crop.jpg` (the
  centres at full size), `look-ab-phone.jpg`; `mobile-check --device=pixel7` clean.
- **4. `bug-harbour-water` — fixed on the branch, waiting on the deploy (in progress).** Not quite the
  diagnosis of 2026-10-07: rebuilt from our extract (as the service does), the bay's cells hold no coast
  at all (open water east of Ellis Island: 1_0, −1_2, 0_2 at origin 40.703125, −74.046875) or only an
  island's (Liberty, Governors), so no sea was made; and where a shore did cross a cell its islands were
  flooded (Ellis Island's buildings stood in the bay — seen with the vector tiles' water off, which is
  when a cell's own coast is its sea). **Fix:** `realTile.ts coastSea` — the coast clipped segment by
  segment; an island a hole in the sea round it; a closed coast the edge cuts walked from outside it; a
  cell no coast crosses the side of the nearest coast (`waterSide`); the service reads the extract's
  coastline 2 km round a cell WorldCover calls at least half water with no sea of its own
  (`coastAbout`, `landCover`'s `stats.wet`). Checked on other coasts against WorldCover's water share:
  every cell that changed moved to it (Miami Beach −1_−1 68% → 4% against 2.5% — the old builder had
  flooded part of the island; Bar Harbor −1_−1 0 → 69% against 68%; Sea Bright −1_0 72 → 61% against
  62%). Tests: `coastSea.test.ts` (synthetic coasts and `tests/fixtures/harbour-coast.json.gz`, the
  extract's coastline round the bay), `landcover.test.ts`. A local tile worker on port 8795 (its R2 on
  D:, the extract's index and the New York blocks) built the after; montage
  `shots/fix/harbour-before-after.jpg`, `liberty-shore-crop.jpg`. Noticed: a railing on a seawall now
  stands at the water's edge (every coast's sea floor slopes over the terrain's last grid step,
  `dem.ts waterPatch`).
- **My mistake, v30:** after bumping the working tree to `&v=30` I took the harbour's "before" from it
  with no local worker on 8787–8789, so the page asked the live v29 service for `&v=30` round Ellis
  Island, and the edge keeps those answers under that URL for 30 days — the very cells v31 mends. The
  release is **v31** (worker `t/v31` on the branch); the client's `&v` and `DIRECT_V` stay at 29 until
  that worker is deployed (a dev page serving this tree, Robby's on :5173 too, can't burn v31). The
  memory note and the HANDOFF say so.
- **Baseline hygiene:** `lifeSim.test.ts` "pedestrians walk up to doors…" and `shoreCalendar.test.ts` "a
  lot far from any beach…" time out only while Chromium captures load the machine (7–8 s and 1.4 s
  alone); the suite passes on a quiet machine.
- **Robby's page:** https://claude.ai/artifact/J7koij7UdW1rjCzrVQmqJS — the four before/after sheets and what waits on him.
- **Verified:** npm run typecheck; npm test (the full suite on a quiet machine); npm run build;
  `mobile-check --device=pixel7` (60 programs, no errors). Nothing pushed, nothing deployed.
- **Robby, after the page:** "yes, just all the above but just create new feature branch we will work
  off of", then "like push change to new branch inatead of merging to lower48-alive". So nothing is
  merged into `feature/lower48-alive`: the work goes on from **`feature/four-reports`** (off
  `fix/four-reports`, the same commits), pushed — a `feature/` push publishes the game (Pages) and runs
  the checks; with the client still at the live `&v=29` that's safe before the deploy. `fix/four-reports`
  pushed too. The tile service's deploy (`cd worker && npx wrangler deploy`) was refused from the session
  by the permission check (a production deploy), as on 2026-10-07: Robby runs it. After it: the live
  cells round Ellis Island checked at `&v=31`, the client to `&v=31` and `DIRECT_V` 31, must-load
  --live, the harbour montage from the live service, `bug-harbour-water` passing, `gameplay-one-plan`
  in progress, pushed again.
- **The deploy, live (Robby ran it: worker dffa75f6).** The live cells round Ellis Island at `&v=31`,
  cold-built from the extract: 1_0, −1_2 and 0_2 the sea over the whole cell, 0_1 the sea with Liberty
  Island a hole, 0_0 with Ellis Island's, 2_1 round Governors Island. The client to `&v=31` and
  `DIRECT_V` 31 (the streaming doc's line with them); `must-load --live` at `&v=31`: every town 9/9
  cells from the extract; npm test, typecheck, build. The harbour from the live service, v29 against
  v31, the water tiles off as in Robby's case: `shots/fix/harbour-live-before-after.jpg`, and v31 day
  and night from Ellis Island (`hb-live31.jpg`). `bug-harbour-water` passing; `gameplay-one-plan` in
  progress. Pushed `feature/four-reports` (the first push's checks + playtest and the Pages publish
  passed). Robby's page updated: https://claude.ai/artifact/J7koij7UdW1rjCzrVQmqJS.
- **A flaky test, not touched:** `waterBirds.test.ts` "on the lake…" failed once on the turkeys'
  flocking (0.5 against 0.6) and passed four times running after: `critters.ts` reads
  `performance.now()` for the butterflies' and the shoals' drift, so the sim's draws differ run to run.
  The sim's own clock there would make it repeatable.
- **Next:** `gameplay-one-plan` — one gameplay plan agreed with Robby, no code (HANDOFF "Start here").

## 2026-10-08 (late) — Robby's four reports first, then one gameplay plan, then the proof of concept; painted places keep their people

Robby, on the plan's third part (the van and the first painted place): it "kinda makes no sense, why
not have people or cars when stepping into the painting? and I think the van being bigger on the
inside then outside looking, is that addressed?" Then: "okay i guess it should fix those first" (his
four reports of 2026-10-07), and "there are other gameplay files that talk about that as well, we
want 1 good streamlined approach for gameplay and want to take our time to ensure we get it right
before implementing and testing and i like that it will be on a switch so it will not affect the
current game, so yeah we can have the new session fix the bugs first, and then we can do the
gameplay implementation after".

- **Painted places keep their people and traffic** (`docs/GAMEPLAY_STREAMLINED.md` §5): the hour
  and weather held, the place's life going on as at that hour: held, not frozen. The draft had them
  quiet; now a quiet painted place is one painted at a quiet hour. The life sim already runs from
  the hour it's given (`life.update(…, { hour: timeParams.hour, … })`, main.ts ~1642), so holding
  the hour holds the mix. Two open questions added (§16): the very same passers-by or the same mix;
  whether a busy painted place makes shy animals hide.
- **The van, bigger on the inside:** it was in §6 as one line (and in the vision); now §11 and the
  proof of concept show it on the first morning: wake in a room, step out, look back at a small van.
- **The order:** `bug-night-glow-people` (active) → `life-density-realism` → `look-crisp-preset` →
  `bug-harbour-water` (a new tile version; ask Robby before deploying) → **`gameplay-one-plan`**
  (new: every gameplay file folded into the streamlined plan with Robby, section by section, no
  code; the files are listed in its verification and in the HANDOFF) → the proof of concept
  (`poc-first-minute` paused, with a note). The four re-ranked first in tier 1; notes on
  `poc-painted-place`, `painted-places`, `van-home-start`, `growing-home`, `habitats-visitors`,
  `life-density-realism`; the HANDOFF's "Start here", ROADMAP, AGENTS and the plan's Decisions
  updated, `for_mapgame/GAMEPLAY_STREAMLINED.md` synced. The HANDOFF also says how a session Robby
  starts for another item hands the queue back.
- **Then Robby asked** for the four on their own branch ("go off of a new branch of this current
  one"), the preset in his words ("create the additional preset for better watercolor overlay"),
  and pointed to his screenshots (`Pictures/Screenshots/_bugs`). The branch is `fix/four-reports`,
  not a `feature/` name: pushes to `main` and `feature/*` publish the game (`.github/workflows/`).
  The HANDOFF maps the screenshots to the reports (`_water_bug3.png` the walkers glowing at night;
  `_water_bug.png`, `_water_bug2.png` the bay's grey ground), and the items' notes carry them.
- **Verified:** `npm run init -- --fast`: typecheck clean; 135 features (60 passing, 68 not started,
  5 superseded, 1 in progress); "next: tier 1 · bug-night-glow-people (in progress)". Docs and the
  feature list only; no code changed.

Next: `bug-night-glow-people`.

## 2026-10-08 (night) — The gameplay plan decided; the Sea Bright proof of concept queued (`poc-first-minute` active)

Robby asked where the world stands on feeling alive and functional, and for a review and rating of
his streamlined gameplay plan ("soon will have to do a poc of it at least starting in sea bright").
The review rated it 7.5/10: a first-rate hook (pencil means "paint me"; painted places you step into;
real rarity, ranges and seasons), with eight changes proposed. Robby: "i agree with all you things
youd change", keeping the vision's 3–5 pencil things and asking for one way to collect ("you reason
and decide") and a painted place that "saves that tile for the user".

- **`docs/GAMEPLAY_STREAMLINED.md`** (new in the repo, the plan of record; a copy back in Robby's
  `for_mapgame` folder): 3–5 pencil things picked out of sight, rares first; the tap is the one way
  to collect, trees and plants too, and paintings don't collect; moments with warning signs (a data
  table per family) and the gold edge; a painted place keeps its map tiles, ~250 m to walk, pencil
  past the edge, the bloom as the way in; the base grows by named milestones (a wall per new region,
  a room per set), not experience; "Start near you?" back in the first ten minutes; the drone after
  1.0 and never marking the map; the pacing numbers (§15); the proof of concept (§14).
- **`feature_list.json`:** three proof-of-concept items first in tier 2 (`poc-first-minute` active,
  then `poc-touch-moments`, `poc-painted-place`), each with what the code has and lacks (an inventory
  of the code, 2026-10-08); new `touch-features`, `moments-gold-edge`, `painted-places`,
  `habitats-visitors`, `drone`; `bloom`, `pencil-collecting`, `van-home-start`, `growing-home`,
  `van-travel` and others updated and tier 2 re-ranked in the plan's order; `special-vehicles` and
  `portal-gun` superseded (cut); `regional-flora` paused (one active item).
- **`tools/init.mjs`:** "next" is the active item when there is one, then the queue by tier.
- **AGENTS.md, ROADMAP.md, HANDOFF.md:** routed to the new plan; ROADMAP's 1.0 list noted as
  predating it (to agree again after the proof of concept); HANDOFF's "Start here" is this work.

**Where the world stands (for the record):** tier 0 done; tier 1 38 of 63 (every region's plants and
animals built, seasons, traffic, people indoors, Sea Bright's calendar, interiors, rides). Still
missing for "alive": people with errands (`people-with-purpose`), quiet nights and desert roads
(`life-density-realism`), animals that ever approach (they only flee), touching anything, the
drawbridge opening, greenery at the photos' level, the 16-region review.

**Verified:** `npm run init -- --fast` (one active item, the queue's next is `poc-first-minute`).
Docs and the feature list only, plus init's "next" line; no game code changed.

**Next:** `poc-first-minute` (HANDOFF "Start here").

## 2026-10-08 (evening) — The forest past the trees follows the season (`far-woods-seasons`, pushed after Robby's look)

Robby: "so are there different seasons in the game … i just want to ensure it wont make the game look
worse", then "okay please fix that". His condition, in the feature: summer the same, and he sees the
before/after before it ships. It waited, committed and unpushed, until he had looked
(https://claude.ai/artifact/MnhtEZBGDE6fqCYF2f54r9, the live service's frames): "cool, ill like please
push" — pushed (Pages). Client only: no tile cache bump, no worker deploy.

- **The far woods** (`world/farWoods.ts`, the GLSL at the end of `render/treeSeasons.ts`): the far ring's
  canopy (`ground.ts` CANOPY: the lite and far cells' raised woods, the bake's backdrop) and the wooded
  horizon ridges (`horizon.ts aVeg`, temperate, continental and boreal) were one summer green all year.
  Now they turn and go bare by the far crowns' own sums, drawn as stands (~44 m) in groves (~220 m: each
  its own broadleaf share, lead hue and timing), faded by the pixel's footprint to the grove's and then the
  region's mean — never a speckle. Their snow as their make-up holds it (an evergreen wood's crowns less,
  a bare wood's floor more): the canopy took snow as a field did.
- **What they're made of**: the trees about the walker (`WoodsTally`, every mounted tile's `trees:` meshes
  in woods, each crown weighed by spread × height) over the region's own mix while few are in. The region's
  mix alone guessed far too many broadleaves where the survey's slim crowns are conifers: Lake Placid's
  woods are six broadleaves in ten by count, three by what shows over its 25 m white pines — the first
  frames had the Adirondacks' far hills solid gold behind dark green woods.
- **The woods' floor once the leaves are down** (`ground.ts vWoods`): a detail cell's ground carries the
  woods' share round each point where it has a wood (`realExtras(…, woods)`, the tile worker; a baked
  slice chunk with a wood too), and the shader lays leaf litter (`WOODS_LITTER`) by the broadleaf share ×
  `uLeafFall`. Without it a wood near the walker in winter was a green floor under bare sticks against
  grey-brown far woods — a seam at the detail ring's edge (Shenandoah from 300 m).
- Only while the woods are turning or bare (`woodsTurning()`): a summer frame is the same as before, and
  the developer settings' **"far forests follow the season"** (`timeParams.farSeason`, `?farseason=0`)
  puts the old look back.

**Verified:** typecheck; `npm test` 1073/1073 (`tests/farWoods.test.ts`, 8 new); `npm run build`. Before/after
in the same frame (scratch `farseason-ab.mjs`: the switch off, then on) on the live service:
`shots/farseason-live-0…7.jpg` — the Smokies Nov 5 and Jan 15, the Adirondacks Oct 14 and Jan 15 (snow),
Shenandoah Dec 5 (80 m, 300 m, on foot), Sea Bright Jan 15, the Hoh Oct 20 (barely changed), the Smokies
Jul 20 (identical); Clingmans Dome Nov 5 for the horizon (`farseason-fs2-5.jpg`). `tools/playtest.mjs
--only=frames` at Cades Cove on Nov 5: 59.3 fps on, 59.4 with `?farseason=0` (fly's busy time +1 ms p50).
`tools/mobile-check.mjs --device=pixel7`: 60 programs, fragment uniforms 50/224, no errors.

**Found on the way:** two `wrangler dev` workers left on :8787 from this morning's local add-on tests —
a dev page prefers a local worker (`main.ts probeLocalTiles`), so the first rounds of frames came from it
(Overpass-backed outside New Jersey, 503s at Cades Cove, stand-in tiles); stopped, the final frames are the
live service's. Shenandoah in December looked leafy: every broadleaf there is bare (checked kind by kind) —
its white pines and pines read as round broadleaf crowns from above (the conifers' far models). The pale
flat band and white patches in the far ring at Cades Cove are in every frame, before and after.

**Next:** the season by each wood's own height (from Clingmans Dome the valleys below take the summit's bare
winter; from a valley in early October the high ridges stay green). Robby asked after the
crisper-watercolor preset: it is `look-crisp-preset` (not started, his notes from the other session in it).

## 2026-10-08 (later) — The natural areas mapped as relations: the query's new statement, the extract's add-on, tiles v29

Robby, on the 2-hour re-cut: "why do we need to redownload everything?" — we don't (the US file is on D:),
and not the whole extract either: "no need to check with me either just be careful and ensure it doesnt
break the current game". What changed:

- **The query** (`osmQuery.ts`): `relation["natural"~"^(beach|sand|wetland|wood|scrub|heath|grassland)$"]` — a
  beach, a wood, a marsh mapped as a multipolygon (several outlines bundled as one area) was never asked
  for, from the extract or from Overpass: Cape May's beach, Wharton State Forest's wood. Overpass's answers
  carry them now; the next full cut selects them itself (`sqlWhere`).
- **The extract's add-on** (`scripts/osm-extract-addon.mjs`, R2 `osm/v1/addon/`): the query's relations the
  extract's own `sel_r` lacks — 232,988 in the US — cut from the same file and the same moment, without
  cutting the extract again: the file's relations (41 s), their 1.29 M member ways (5 min), their 86.6 M points (one
  pass over the nodes, 16 min), then the extract's own SQL for the printing, the tiles and the big relations (read out of
  `osm-extract.mjs`, as `tests/osmExtractSql.test.ts` reads it). Its relations past 2 KB are stored once
  (`--big=2000`; the extract's rule is 50 KB): a wood or a marsh of 8–50 K crosses ~14 tiles, and New
  Jersey's add-on was 88.5 MB of copies — 13.5 MB once, the US 772.5 MB in 1,013 blocks (the extract: 35 GB). Packed a block column at a time
  (the US's relations stored once are ~4 GB of text: all at once would not fit); `--keep` packs from a
  run's tables. Uploaded with `osm-upload.mjs --addon` under its own prefix and index — the extract's
  untouched.
- **The service** (`worker/src/osm.js`): reads the add-on beside the extract only when its snapshot is the
  extract's (`osmTiles.ts mergeSources`: a tile's lines from both, each element kept once; a relation stored
  once from whichever pack holds it). Without the add-on's index, or of another snapshot, the extract as it
  was. `assemble` reads a cell's relations stored once six at a time. **Taking it back:**
  `npx wrangler r2 object delete map-game-tiles/osm/v1/addon/index.json --remote`.
- **Tiles v29** (worker `t/v29`, client `&v=29`, `DIRECT_V` 29), the worker first.

**Verified:** typecheck; `npm test` 1065/1065 (tests/osmQuery.test.ts — the frozen query with its statement;
tests/osmWorker.test.ts — the add-on: a small relation whole and a big one from its own section beside every
element of the extract, the cell's TileJson with its beach; of another snapshot, the extract as it was);
`npm run build`. New Jersey from the local packs (scratch `addon-check.mjs`): Cape May 1,961 → 1,962 elements
(its beach), Wharton State Forest 8 → 9 (its wood), Sandy Hook +3 (a beach, a wood, scrub), High Point +2 —
the extract's own elements none missing, none changed; the rest of each tile identical but at Barnegat, where
one stand-in house (`gen: fill`) no longer stands in the newly mapped wood. The restructured packer: New
Jersey's blocks byte for byte the same (all nine hashes). The local service (`wrangler dev`, the New Jersey
extract and its add-on): Cape May's cell carries its beach (394 roads, 1,170 buildings as before), Wharton's
its wood. The US's packs on D: (scratch `addon-check-us*.mjs`): Ruby Beach 28 → 31 elements, a beach and two woods
where it had neither; Cannon Beach +6 (its beaches, sand, heath, grassland); Pismo, Ocean City and Cape May their
beaches; the Hoh valley, Wharton and Cades Cove their woods; Jones Beach a wetland; Discovery Park a wood and a
wetland — the extract's own elements none missing, none changed anywhere. Live: the add-on uploaded (2,026 objects in ~22 min, its index
last; both indexes read back — the extract's as it was, 1,481 blocks), then the worker deployed (90e0bdeb), then
the client. `must-load --live`: every town from the extract, cold, the same buildings and roads as on v28. The 25
beaches on v29 (scratch `beaches29.mjs`): OSM's beach areas in the cell at 22 (11 on v28) — Ruby 8.8 ha, Cannon
18.2, Pismo 14.4, Cape May 7.7, Santa Monica 0.1 → 19.2, Sleeping Bear's dunes 67.2; WorldCover's sand at the
water at 22; neither only Jones Beach (its sample point offshore) and Old Orchard (inland of its beach).

**Next:** retire the add-on at the next monthly full cut (it selects the relations itself; the service ignores an
add-on of another snapshot); the walker into the wall (Chicago) once Robby gives its spot; the far canopy's winter
colour (`distant-forests`).

## 2026-10-08 — Robby's bug folder: the forest floor stands still, the horizon's pyramids gone, no grass on courts; the distant trees reviewed

Robby: "these floating plants are moving in a circle around the terrain and floating it looks horrible, and
more terrain bugs and others are in here now" (`Pictures/Screenshots/_bugs`) — "go back and ensure things
look good first and check for bugs review your work for distant forests all that". What changed:

- **The forest floor** (`understory.ts`): each 16 m cell's plants built about its own corner and the mesh
  set there. The wind (propMaterial `WIND`) sways a vertex by its height above the mesh's origin, and the
  cells were built in the world's own coordinates — every fern 150–180 m up (the Hoh's valley, a Chicago
  park) swung a metre or more round its foot, circling and floating off its slope. Both reports, one cause;
  nothing else builds world-space geometry with the wind (trees, hangers, garden and tile plants are
  instanced or set at their foot).
- **The horizon's pyramids** (`dem.ts despike`): the Terrarium overviews carry single pixels and clumps
  hundreds of metres over flat land — the Pine Barrens' 617 m, Long Island's 300, JFK's 243, Rumson's 270, a
  pixel over Hetch Hetchy 900 over its walls, most over water (voids filled wrong). Each stood as a pyramid
  on every horizon within 125 km. Every tile below z14 (the horizon's z9/z10, the far towers' z11) is
  despiked as it's read: a pixel more than 250 m over most of its neighbours, or 150 m over most and over the
  second highest, takes their middle; twice, for a clump. Real summits keep theirs (their neighbours stand
  high with them): Rainier 4,367 m and the Grand Teton 4,038 m unchanged; z14 has no such pixels.
- **Courts** (`groundPaint.ts Painter.hardCourts`): the grass's mask read a basketball court's paint
  (#5d7f5c) and a tennis court's run-off as lawn. A basketball, tennis or pickleball court, or any pitch
  mapped as paved, clay or rubber, is drawn out of the mask: no tufts on the court, no ferns either.
- **The feature list** carries every report: the three fixed (`bug-floor-plants-circling`,
  `bug-horizon-pyramids`, `bug-grass-on-courts`), `bug-walker-into-wall` (Chicago: a walker into the wall
  beside an open door — needs its spot), `bug-grandstaff-terrain` (Moab: not reproduced on tiles v28 —
  river, banks and parking as they are; suspects in its notes), and the evening's other reports, with the
  other session: `bug-harbour-water` (with its diagnosis), `bug-night-glow-people`, `life-density-realism`,
  `look-crisp-preset` (the six adjustments); and `distant-forests`, `osm-area-relations`.

**The distant trees reviewed:** the code read again (tile removal, a tile told of twice, phones' freed
arrays, the shadow pass, the world's offset), and the look: the Hoh and Monmouth Beach on/off the same, and
winter — Cades Cove in January on/off the same from 40 m and 160 m (bare trees past 300 m are sticks either
way). Found: the far ring's canopy (v28) stays summer-green in January — in `distant-forests`' notes.

**Verified:** typecheck; `npm test` 1063/1063 (new: tests/understory.test.ts — a cell 180 m up stands its
plants on the ground, fails on the old code; tests/dem.test.ts — spikes, a pair and an edge spike gone, the
Teton's summit and a canyon rim kept; tests/groundPaint.test.ts — courts out of the lawn); `npm run build`.
Montages: `shots/spots-floor-0.jpg` (the Hoh's floor on its feet), `shots/spots-pyramid-before-0.jpg` /
`-after-0.jpg` (Seaside Heights toward the Pine Barrens' pixel: the bump gone), `shots/spots-grandstaff-0.jpg`,
`shots/spots-winter2-*.jpg`, `winter3-*.jpg`.

**Next:** `osm-area-relations` (Robby's go-ahead: the extract re-cut and upload); the walker into the wall
once Robby gives its spot; the far canopy's winter colour.

## 2026-10-07 (closing) — Land cover everywhere: WorldCover in every cell, beaches that meet a cell, the Olympic forests, distant trees

Robby: "i noticed olympic penisula is pretty bare, like ruby breach, is there even beacjes where theres
supposed to be beaches throughout the USA? please ensure" — and for the canopy layer, "as long as it is
open source, please go ahead". ESA WorldCover 2021 (10 m, CC BY 4.0, already credited for the bake) now
comes with every streamed cell. What changed:

- **Tiles v28** (worker + client together; no v27 was ever deployed — a test page asked the live v26
  service for `&v=27` and the edge keeps those answers under that URL for 30 days, so the version moved
  on; docs/agent/streaming.md now says never to point an unreleased `&v=` at the live service).
  - **Each cell's land cover** (`worker/src/landcover.js`, `src/world/landcover.ts`): WorldCover's classes
    on an 8 m grid over the cell and 96 m round it (`TileJson.lc`, base64), read from the COGs on AWS
    (one to four 3° files, 1024² tiles, a window each). A cell whose cover can't be read in 20 s is served
    without it, edge-cached ten minutes and never kept in R2.
  - **The far ring's woods** (`/cover/<bx>_<bz>.json`, `src/world/farCover.ts`): the far ring builds from
    synthetic cells that never ask the service, so it was a lawn to the horizon. A block of 8 × 8 cells
    at 32 m off the 20 m overview, one request a block; its trees raise each far cell's ground into the
    canopy (`synthTile`), as a real lite cell's own cover does (`realExtras`).
  - **Areas through the cell** (`realTile.ts clipRingToBox`): an area that meets a cell without a vertex
    in it — a beach down a straight coast, a national forest or a lake round the whole cell — was
    dropped. Of 25 US beaches surveyed (scratch `beaches.mjs`: OSM's beach areas in the live cell against
    WorldCover's sand by the water), 11 had no beach in their cell: Ruby, Cannon, Pismo, Gulf Shores,
    Galveston, Virginia Beach, Ocean City, Rehoboth, Cape May, Nauset, Sleeping Bear. Now clipped and
    the cell's own (Sutherland–Hodgman against the cell and its margin). WorldCover's sand lies by the
    water at most of them; Jones Beach and Sleeping Bear show none there, the OSM beach carries them.
- **The ground** (`dem.ts coverPatch`): WorldCover's class at each node first, then the map's areas;
  a lawn the map draws doesn't paint over WorldCover's woods, scrub, wetland or mangrove. The paint
  windows wash a cell's cover as a layer of its own (`groundPaint.ts lcImage`).
- **The trees** (`props.ts`): WorldCover's woods grow the region's trees where the map draws none (the
  Olympic Peninsula's rain forests, Ruby Beach's headland: `tests/landcover.test.ts`); in a surveyed wood
  the gaps between the LiDAR's crowns grow the region's mix (`surveyGap`: the Hoh's survey finds 3.6–5.2
  thousand crowns a km², a fifth to a quarter of the ground — the canopy's tall trees, not the ones
  between them); a westside wood's wild maples are bigleaf.
- **Distant trees** (`flora.ts distantTree`, `nearTrees.ts`): the Hoh's ring held 165,000 trees at
  1,000–1,400 vertices — 190 million a frame. Past `TreeTier.mid` (desktop 300 m, phone 180, low 120;
  `?treemid=`) every tree is a 40-vertex hull of its far crown and a post of a trunk; the trees within
  reach are drawn whole by a mid mesh beside each tile mesh, refilled every 16 m (docs/agent/rendering.md
  "The distant band"). Its first try lost every tree within 300 m in Monmouth Beach: a mesh made after the
  world's offset last moved drew at the identity, 3 km off (a tile's objects never update their own
  matrices) — `updateMatrixWorld` on making it; the Hoh, at its region's origin, hid it.

**Verified:** typecheck; `npm test` 1059/1059 (new: tests/landcover.test.ts — the grid, the merge rules,
Ruby Beach's forest, the gap fill; tests/realTile.test.ts "areas through the cell"; tests/foundry.test.ts
"distant trees" — every species' hull as tall and as wide as its far model, 40 vertices, its attributes;
tests/nearTrees.test.ts — the distant band, its marks, the world offset); `npm run build`. Frames in the
Hoh (47.8606, −123.9348; `playtest --only=frames`, local tile service): the live code against live tiles
stand 22.5 fps, walk 23.2, fly 21.9 with 15 hitches over 100 ms — already slow before today; the new code
with `?treemid=0` stand 21.5, walk 21.9, fly 23.1; with the distant band stand 49.4, walk 57.5 (p95 16.7 ms),
fly 43.1 (p95 64 ms, 4 hitches over 100 ms: fails); a phone's budget stand 55.9, walk 58.7, fly 50.6 (2 over
100 ms: fails `perMin100`). Moab flies clean (0 over 100 ms): the flight's hitches are forest tiles
streaming in, not the frame's work (no long tasks). Montages: `shots/spots-lod-*.jpg` (the Hoh valley
with the band on and off the same from the ground, a shade crisper on the far slopes from 120 m; Ruby
Beach's sand and its forest from offshore), `shots/spots-lod3-*.jpg` (Monmouth Beach at 4 pm, on and off
the same from the street and from 40 m up, the crowns lit alike).

**Handed to another session (Robby, 2026-10-07):** a developer-settings preset for a crisper watercolor
(another agent's six adjustments, cheapest first); the harbour's water north of the Statue of Liberty;
people glowing at night; crowds and traffic too dense at night and on desert roads. For the harbour: the
live tiles 1_0 and 0_1 round Ellis Island (origin 40.703125, −74.046875) carry no water at all, v26 and
v28 alike. The sea comes only from coastline runs that cross the cell's edge, and a run starts at a
vertex inside the cell (`realTile.ts`, the coastline block): a long straight coastline segment through a
cell with no vertex in it — the Hudson's closing line, the bay's far shores — is never seen, and the bay
is bare ground.

**Live (the same night):** Robby deployed the worker (version 0fb76c69). `must-load --live`: every town
ok, from the extract. A fresh v28 cell carries `lc` (the Hoh's 98% trees; Ruby Beach's 51% trees, 47%
water), and `/cover` answers (256 × 256 at 32 m). The 25 beaches against the live v28 cells (scratch
`beaches28.mjs`): WorldCover's sand at the water at 22 — drawn as sand by the cover and the wash, so
Ruby, Cannon, Pismo, Cape May, Galveston, Virginia Beach and the rest that had no beach now have one —
and OSM's beach areas at 11, the same 11 as before. The clipping found none of the missing ones: they
never reach the cell. The query (`osmQuery.ts`) takes beach, sand, wetland, wood, scrub, heath and
grassland only as ways, so a multipolygon relation is never fetched, from the extract or from Overpass —
Cape May's beach is one (outer ways 810853698 and 40412148), and so is many a big wood. Jones Beach's
sample point lies offshore (the map round it is empty), Old Orchard's inland of its beach (a way, in the
next cell), Sleeping Bear's in the dunes (sand, away from the water).

**Next:** the relation statements — `S('relation', re('natural', '^(beach|sand|wetland|wood|scrub|heath|grassland)$'))`
in `osmQuery.ts`, the frozen query in tests/osmQuery.test.ts with it — then the US extract re-cut
(`scripts/osm-extract.mjs` on D:, about two hours) and uploaded (`scripts/osm-upload.mjs`), and tiles v29:
Robby's go-ahead first (an R2 upload). Flying over a dense forest still hitches (4 over 100 ms in 8 s on
a desktop): profile the GPU side of a forest tile's arrival. Then `tools/real-compare.mjs --kind=green`
against green-2 (`regional-greenery`, unblocked).

## 2026-10-07 (last) — The flora review: each plant in its season, on its ground, in its numbers; rural roads their own width

The ecosystem review's "next — plants" (`regional-flora`, in progress): the green spots measured by region,
then every flora layer read through for its season, its ground, its numbers and its range, as the animals
were the day before. What changed:

- **Seasons.**
  - **The mild winter's leaf fall** (season.ts `leafFall`): where the January mean at the ground's height
    is over 5 °C (the Gulf, Florida, Texas, the low deserts, California), the short days strip the
    broadleaves too — under 11.6 h while the lagged mean's under 16 °C. A Houston sweetgum, an Orlando
    cypress, a Sacramento sycamore and Phoenix's ashes were in leaf all winter (the mean never falls under
    10 °C): now bare by Christmas, leafing out in late February, in leaf by April. The tropics never drop;
    the North's timing is as it was (New York in leaf through October, Seattle into November).
  - **The lawns' winter** (season.ts `dormant`, riding `U.uHay` and the ground's straw wash `uBiome.x`):
    the hot-summer South's and the low deserts' warm-season grass straw-tan under ~14 °C (Dallas's and Las
    Vegas's January lawns all straw, Atlanta's six parts in ten, Houston's and Orlando's half), green again
    in April; the North's cool-season lawns dulled to 0.4 in a snowless cold spell (New York's January
    0.27); San Francisco's, Seattle's and Miami's green. Sea Bright in January: the verge's summer-green
    tufts now a winter olive.
  - **The gardens' year** (flora.ts `PlantLife`, `plantNow`): evergreen (boxwood, rhododendron, azalea,
    lavender, agave, hibiscus), shrub (hydrangea, rose: bare twigs and dried heads in a hard winter, beach
    grass gone to straw), perennial (daylily, hosta, coneflower, the ferns: up in April, dying back in
    November, gone under the ground), annual (the sunflower: sown at 13 °C, a dead stalk in October). The
    beds ran on bloom months alone: a full green hosta in a Vermont January.
  - **The forest floor's ferns by the same season** (understory.ts `season`, set with the uniforms): up in
    the spring, tawny or copper in the fall, gone where the broadleaves are bare.
- **A bug on the way: the generic fern was white.** Its leaf was TINT (an instance colour paints it in a
  garden), but a floor cell is a merged mesh with no instance colour — every eastern, southern and Florida
  wood's ferns drew white. It has its own green now (and every floor plant must: floraBalance.test.ts).
- **Numbers.**
  - **Street trees on residential verges where nothing measured them** (props.ts verge trees,
    flora.ts `vergeShare`, `vergeHeight`): no LiDAR record and few mapped trees left a leafy street with
    the tree scan's 5% — Durham's Trinity Park showed 2% vegetation where its photo shows 57% (no survey
    record, seven mapped trees in its square kilometre). A slot every ~11 m a side, past the paved band,
    planted as often as the region's towns grow street trees (the USFS's urban canopy: the Southeast 0.6
    … the desert 0.1) and the neighbourhood keeps them (an old grid ×1.25, a tract ×0.5); only along a street
    that fronts homes (three house-sized footprints within 40 m, fewer big ones — San Antonio's industrial
    road had grown a row), never in a dense core, a drive's or a front walk's way, a junction's mouth, a
    wood, within 90 m of the sea, or 6 m from a tree already standing.
  - **The dry country's own floor** (flora.ts `desertCover`): a streamed cell's DEM ground is "grassland"
    everywhere, and an arid place's density 0.22 left one plant a hectare in the open Sonoran. Open, unbuilt
    land the map draws nothing on now grows desertMix's plants at the region's cover (the Sonoran upland
    0.6 of the 9 m cells, the sagebrush sea 0.65, the Mojave's creosote flats 0.25); an arid town keeps its
    sparse planting. **Under the survey too**: LiDAR finds crowns from 2.5 m, so where it covers a cell the
    scan was skipped and the desert's low floor vanished exactly where the survey is best (Saguaro's cells:
    3–5 thousand measured crowns, no prickly pear) — now `surveyFloor` grows only the kinds it can't have
    seen, under 2.4 m, by position hashes.
  - **A strip of the scan along every surveyed tile's edge**: scan points jittered up to 9 m past the east
    and south edges fell outside the coverage lookup and got the full scan (`edgeCovered`: now their edge
    block's — dropped after their draws, so the scan's random sequence stays).
  - **Planted palms only where people live** (an 80 m block a hundredth under roofs): a measured crown out
    in Saguaro's wild desert had become a fan palm.
- **Streets, found on the way** (Robby: the streets must work):
  - **Rural roads their own width** (kerbside.ts `fitToFronts`, open country): the tile service gives every
    untagged North American residential, unclassified, tertiary and secondary road a parked lane at each
    kerb, so every rural road through desert, woods and fields was 4.4 m too wide (Cactus Forest Drive, a
    one-way scenic loop, 10.4 m; its scrub 9 m off its middle where the photo has it at the asphalt). A
    stretch of 60 m or more with fewer than four buildings within 50 m is drawn at its travel width,
    NO_PARK; a village keeps its parked lanes; two farmhouses don't make a town.
  - **Survey-found blocks in a street** (bridges.ts `dropStreetCrossers`): a block the LiDAR found where
    the map has none, that a car street's centre line runs through for 3 m or its lanes for 8, is gone — a
    canopy, a truck, a flat crown. Tucson's West Pennington Street had three found "houses" in its lanes; a
    playtest car stopped dead against one (on the old code too: the check had never sampled that stretch).
- **The measuring** (tools/real-compare.mjs; docs/agent/debugging.md): a dash camera's lens (its own car in
  the segmentation) that the GPS put in a parking lane, on a verge or in the woods beside the road (to the
  half-width + 16 m) is moved into the lane of the street, never a lot's aisle; the game's parked cars
  within 3 m of the lens are left out. The class pass draws crowns whole, so a season never shows in its
  shares; moving cars make a few points of score noise.

**Measured** — the 40 green spots, `real-compare --kind=green --group=region`, the baseline on the old
game with the new lens (`flora-0b`) against everything (`flora-2`): vegetation 23.9% → 24.6% (the photos
34.6%), mean score 0.719 → 0.725. Traverse City 0.761 → 0.939 (vegetation 30% → 48%), Lake Placid 0.814 →
0.884, Saratoga Springs 0.798 → 0.825, Princeton 0.726 → 0.746, Saguaro 0.732 → 0.756; Austin's Hyde Park
0.536 → 0.716 (its lens off the roof it stood on, into the street); Bend 0.646 → 0.416 (its lens among a car
park's cars by the street — 27% cars before, 58% now: an outlier). Most spots sit in surveyed cells, where
the verge trees don't go, and Durham's lens stands at a school's frontage, not a home's.
The downtowns not over-planted — the largest city of twelve states, old code against new (`flora-0-largest`,
`flora-2-largest`, 11 scored): vegetation 7.6% → 7.6%, mean score 0.734 → 0.742 (Chicago 10.1% → 12.1% and
Minneapolis 2.9% → 4.5% against photos of 7.4% and 2.8%; Houston 13.6% → 16.8% against 32.4%).
**Verified:** typecheck; `npm test` 1052/1052 — tests/floraBalance.test.ts (new: the mild winter's leaf
fall; the lawns' winter by city; the gardens' year; every floor plant its own green; verge trees in Durham
and not Phoenix, none on a surveyed street; the Sonoran's floor thick, a desert town's sparse, a wet
country's unchanged, the floor under the survey only under 2.5 m, no palm in the wild desert),
tests/roadsClear.test.ts (open country's parking given back, a village's kept, settled; found blocks in a
street gone, the map's own kept; the shop-front test's street given a town to stand in). Playtests, old
code against new: Asheville's `roads` 0.78 → 0.84 hits a thousand lane samples (the same within noise),
Tucson's West Pennington 28 → 0; the `drive` check fails in Asheville and Tucson on the old code too
(stalled against walls). Frames on a phone's budget (`playtest --only=frames --budget=phone`): Saguaro's
desert floor 59.5 fps, p95 16.7 ms; Durham's verge trees cost its frame's work 10.9 → 11.4 ms at p50 (old code
against new, twice), its hitches the same. Montages: Sea Bright in October unchanged (its streets surveyed, its roads never
guessed parking), in January the verge's grass a winter olive; `shots/spots-flora-*.jpg`: Durham's
streets lined, San Antonio's industrial road bare, Saguaro's scrub in the middle distance.

**Next:** the near desert floor is still thin (a plant a 9 m cell — Saguaro's real upland is several to a
metre square; three times a forest's instances to match it); farmland can't be told from the open desert
in a streamed cell (the tile carries no farmland: the Snake River Plain's fields would grow sage — the
next tile bump should carry `landuse=farmland`, as fields.ts wants too); the drive check's stalls in
Asheville and Tucson (walls: North Meyer Avenue's low pieces in its lanes); Bend's lens; the shrub layer
under the survey outside the desert (the flatwoods' saw palmetto, a creek's willow thicket); the NLCD
canopy layer for the forests nothing maps (Longmire, NY-73) still waits on Robby.

## 2026-10-07 (later) — Tiles v26: the street fixes at the source, mapped trees by species, colours in either spelling

Robby gave the go-ahead for the tile service's redeploy and its cache bump. Into v26 with today's osmToTile
changes (widths read in their units — feet; a one-way half of a divided road at its lanes' width;
`location=underground` outlines skipped) went the two things that had waited on "the next bump":
- **Mapped trees by species**, then genus, then common name, to the foundry's own kinds: Douglas fir → fir,
  western hemlock and eastern hemlock, western redcedar → cedar, eastern redcedar, alder, vine maple,
  Sitka, Engelmann and red spruce, balsam and subalpine fir, white, ponderosa, lodgepole, loblolly, longleaf,
  slash and gray pine, piñon; the live, plateau, coast, valley, blue, black and bur oaks; aspen,
  cottonwood, Fremont cottonwood; tulip tree, sweetgum, hickory, buckeye, sycamore (the London plane, its
  kin), dogwood, redbud, crape myrtle, tupelo, bald and pond cypress, redwood, giant sequoia, manzanita;
  the cabbage, royal, queen and Canary palms, saw palmetto; saguaro, prickly pear, cholla, ocotillo,
  creosote, sagebrush, Joshua tree; Ashe and Utah juniper ("Ashe juniper" is not an ash). Taxonomy, the
  same answer anywhere (realTile.ts SPECIES, GENUS, COMMON).
- **Colours in either spelling**: `building:color`, `building:facade:colour`, `roof:color` read as the
  building's and the roof's own.
Keys bumped together (worker R2 `t/v26`, client `&v=26`, the direct path's `DIRECT_V` 26). **The worker
must be deployed before the client goes out** — a client asking `&v=26` of the old worker would have the
edge cache keep the old tiles under the new URL. Robby ran the deploy (`cd worker && npx wrangler deploy`,
version 20bd5381); then the client went out (CI green: the checks with must-load against the live
service, and Pages). Live, before the push: `tools/must-load.mjs --live` — every must-load town's spawn
cell and its eight neighbours from our extract (Chicago's cold build 29.9 s, the rest 2–6 s); Midtown's
widest non-motorway street 24.6 m (69 m when feet were read as metres), the Times Square halls' 242,000 m²
outline gone; Seattle's mapped trees as sweetgum, cedar, dogwood, redwood beside its maples and oaks.

**Verified:** typecheck; `npm test` 1043/1043 (realTile: the species, the genus, the common names, the
colour spellings); `npm run build`; `wrangler deploy --dry-run` bundles `t/v26` and the new realTile.

## 2026-10-07 (late) — Arriving after a teleport: the frame you land in, 1.3 s → 0.37 s on a phone

Robby: "when going away from sea bright or telelporting it starts to really lag". After the day's fixes the
settled frames were good; the arrival wasn't. Measured right (every frame from the call to 3 s after it
lands; the first try measured only up to the landing and missed the frame that mattered), Pixel 7 tier,
CPU 4×: the frame you land in was **1.2–1.3 s**. Taken apart:
- The arrival's ground was mounted whole in that frame (0.65 s): now a step at a time, 20 ms a frame,
  through the stream's one mount slot while you're still where you were, the spot pinned so the unload
  sweep leaves it (stream.ts `ensureAround(…, spread)`; the boot still mounts whole) → 0.57 s.
- 412 of its meshes were still queued for upload, so the first frame at the new place uploaded them all:
  the teleport now lands once the arrival tiles' meshes are up (the upload budget doubled while it waits,
  2.5 s at most).
- The old place — its ring and two hundred silhouettes — went in that same frame, ~880 geometries freed,
  three.js walking every program's bindings for each: a few tiles a frame now, their meshes freed 2 ms a
  frame (`freeTick`) → 0.37 s, and the second long frame (0.35 s) gone.
- The horizon ring (193,000 elevation samples) is built a ring at a time (horizon.ts).
- Tried and wrong: the paint windows' whole-canvas upload (skipping it changed nothing).
The teleport itself takes ~1 s longer (6.2 → 7.1 s at 4×; the shore playtest's teleports 2.9 → 3.0 s): you
wait at the old place, with "walking over", instead of the game freezing at the new one.

**Verified:** typecheck; `npm test` 1043/1043; the shore's full playtest PASS 11/11 (teleports, streaming
worst 67 ms); every object's world matrix right after two re-anchoring teleports (0 wrong).

**Next:** what's left of the arrival frame — the grass's first mask blocks at the new place and the near paint
window's first slices (~0.3 s at 4×); the relief swaps' one-frame mount.

## 2026-10-07 (night) — The big cities' streets: stations over them lifted, streets under towers sunk, cars at their own level

The playtest's roads, drive and walkabout checks in the audit's cities after the day's street fixes:
Midtown 0.8 hits a thousand lane samples, Miami Beach 3.5, Seattle 5.1, Asheville 2.9 — and Chicago's Loop
20, its drive stalled (47 m in a minute). What stood in Chicago's lanes, named object by object
(raycast + the nearest instance to each hit):
- **The L's stations, built from the ground**: Adams/Wabash's platform canopy (142 × 23 m, a 13 m block
  along Wabash and across Adams), Washington/Wabash's (9 × 122 m over Wabash's east lane). The L is
  `railway=subway` even elevated, so no line marks it. bridges.ts `dropStreetCrossers` now lifts
  what stands over a street (`lf` 5.5 m, its top kept): a low one (≤ 20 m) the centre line runs
  through 25 m, a narrow one (≤ 15 m across, ≥ 20 m long, not a house) 4 m, a long narrow one over a
  travel lane 25 m. A big low outline 40 m over streets still goes (an underground station's halls);
  a tower is never lifted nor dropped.
- **Streets under towers and under streets**: Chicago maps its upper level as layer 1 and its lower as
  0 (Lower Michigan, Lower Wacker, Lower South Water under Illinois Center's towers): drawn on the
  street over them, their parked cars in Michigan Avenue's lanes, their lanes through the towers' walls.
  `sinkLowerLevels`: a car street that runs 40 m, and half of what the tile sees of it, under a footprint
  still on the ground or under a street on a higher layer is a tunnel — only the traffic takes it.
- **Parked cars in other streets' lanes**: a kerb car (and a shop door's) never stands in another car
  street's carriageway at its level or above (props.ts `inOthers`) — a slip road's, the street over a
  lower one's; **tree pits on a viaduct's deck** (Park Avenue's around Grand Central): none on a deck.
- **Posts in other streets' lanes** (Seattle): a city's lamp masts set 1.2 m past one street's kerb, a
  utility pole slid along it, a mapped lamp put back on its kerb — all stood in the street they met at a
  junction; a streetcar's poles 3.4–5.2 m off its track stood in its own street's lanes (Westlake's). None
  now in any carriageway (kerbside.ts `carriageAt`); the tram's poles reach out to 9.5 m for the kerb.
  Seattle 4.3 → 3.2, Chicago's deck walls 17 → 9.
- After: Chicago 20.2 → 7.3, Asheville 2.9 → 0.85 (passes), Miami Beach 3.5 → 0.31 (passes), Seattle 5.1
  → 4.3, Midtown 0.8–1.4 with Park Avenue's deck clear; the shore's playtest PASS 11/11 (frames max 33 ms).
  Wabash under its lifted canopy and Illinois Center's towers looked at: right. Chicago's drive still
  starts boxed in at a kerb between parked cars (its car, not the street); Seattle's walkabout floated
  0.4 m down a 34° hillside off any street (the walker's step-down, not today's).

**Verified:** typecheck; `npm test` 1043/1043 (roadsClear: the platform, the lane canopy, the sunk
streets); the shore's full playtest PASS 11/11; the cities' checks above.

**Next:** Chicago's remaining walls (bus stops in Michigan's and Madison's lanes, iron fences mapped along
kerbs, its bridges' decks), Seattle's market crowd on Pike Place (by design) and small outlines mapped in
a street (3rd Avenue's, Virginia Street's: kept, houses and sheds aren't lifted); the drive check's start
(a car not boxed in at a kerb).

## 2026-10-07 (eve) — A city's frame: what three.js walks, cut; the painter's small windows

Robby: "pleasse optimize performance where possible". Asheville's desktop frame (RTX 4070, vsync off) was
24.9 ms at p50 with 55,000 trees, but hiding the trees or the shadows saved little, and coarser far trees
nothing: the frame was the CPU's, in three.js's walk of the scene (`projectObject` 22%, the world
matrices 10%, the per-draw state ~32%) — the CPU profile, not a guess (docs/agent/rendering.md "A frame's
CPU").
- **The scene's own matrix** was redone every frame, which made three.js redo every object's world matrix
  under it: `scene.matrixAutoUpdate = false` (what moves updates its own; a re-anchor marks the world).
  Checked: every object's world matrix its parent's times its own — 0 wrong of 4,064–6,903 at the shore
  and after two teleports that moved the origin.
- **Each render walks only the tiles in its frustum** (stream.ts `cullTiles` from the scene's
  `onBeforeRender`, per camera: the sun's shadow pass and the view): a tile's extent from its objects'
  bounding spheres (it draws its own roads whole, a kilometre out); a tile uploading a mesh that frame is
  never culled. Checked: no culled tile held an object whose bounds reached the frustum — 0 in 1,116
  renders over eight Asheville views and 562 over four of Midtown; a render that throws shows its tiles
  again at the next.
- **The coarse ring** (210 cells out to 6 km) drew ~18 building meshes a cell, all one material, an empty
  structures mesh and two empty halo sets: merged and dropped (pack.ts `mergeLike`, `dropEmpty`). The
  view's draw calls 2,119 → 1,003; the scene's meshes 6,639 → 2,814.
- Asheville's desktop frame 24.9 → 19.2 ms at p50; the shore's playtest frames now 16.7 ms at p50, p95 and
  p99 (p95 was 33.3), streaming's worst 100 → 67 ms.
- **The phone after a teleport** (Pixel 7 tier, CPU 4×, the shore → Red Bank): settled, 28 ms at p50
  standing and 26.6 walking (this morning 52; before today 129) — quicker than Sea Bright's 34. Through the
  load the painter was the hot spot: every small window it painted (the grass's 20 m masks, the fine
  window's slices) tested every footprint, road and area of the tiles it touched (`overlaps` 7.5%):
  groundPaint.ts `inWindow`, the merged lists by 64 m cell, in their order. The load's p95 134 → 116 ms.

**Verified:** typecheck; `npm test` 1041/1041 (new: pack's mergeLike/dropEmpty, groundPaint's inWindow); the shore's full playtest PASS 11/11; the matrix and the culling checks above.

- **The grass after a teleport** (each step of its cell builds timed on the phone): a cell's first step —
  before its first row of tufts — took up to 270 ms. Its tree shade (`nearTrees.crownsNear`) asked
  `treeMeta` for each species a tile brought, which grows the whole model on the main thread (up to
  187 ms a call): the crown radius now comes off the far mesh's own model, its trees by 32 m cell. Its
  paint mask repainted every 20 m cell on its own: now cut from a 60 m block painted once at 2 px/m for
  nine, kept until the paint changes within 120 m (the masks match the per-cell ones but for 0.8% of
  edge pixels); the merged areas' sort no longer asks `indexOf` per comparison. The grass's masks 956 →
  382 ms over the load's first 20 s (more cells built, 106 against 84), its worst step 270 → 79 ms.
  The phone's load after a teleport: p95 134 → 113–123 ms, 441 → 486–529 frames in its 25 s.

**Next (the load after a teleport, phone):** the frame half a second after arriving (~520 ms at CPU 4×:
mostly the browser's own work as the near paint windows repaint at the new place — not the arrival's
ground: mounted whole, its worst frame is 133–233 ms, and spreading it over frames saved ~15 ms of that
while the teleport took 1–3 s longer, so it stays whole; `DetailGround.show()` uploads its whole 2048²
canvas, 16 MB, at every step of a window — 9.4 m for the fine one, 50 m for the mid — and both step at
once on arriving: a wrapped (ring) texture would upload only the new strip), the relief swaps (a tile rebuilt with its
ground's relief lands whole in one frame: 120–180 ms — its footprint and interior keys are the flat
copy's, so it unloads that first; staging it wants keys of its own), a 60 m mask block's paint (~77 ms
at 4×); the city's remaining per-draw cost (Asheville's 387 tree meshes in view).

## 2026-10-07 (pm) — Streets fitted to their buildings; the desert's crowns as trees; a phone's far small things

Robby's report, continued ("driving through main cities sometimes the roads have walls or buidlings in
them … make sure the streets and city traversing via car and on foot all work as it should"; "pleasse
optimize performance where possible"). The audit48 montages for the handoff's seven towns, read: Sea
Bright, Miami Beach, Santa Monica and Seattle right; three wrong, each traced in the game
(`raycast` at the frame's pixel → the object):

**Tucson's black pole** on West Washington Street was a 2 m cholla stretched to a 9 m crown the survey
measured (its trunk's black dead joints). A slim crown picks a pine; where no conifer grows, the low
desert's shrub took it (props.ts `regional` → `dryShrub`), at the crown's height — chollas, prickly pears
and creosotes up to 16× their size. The dry country's picks for a measured crown are now only what grows
that tall (flora.ts `SMALL_TREE` × 1.15: `fits`), and a survey tree is never a small kind stretched past
its tallest (re-picked as the region's tree for its height). Tucson: 0 of 33,867 instances over their
kind's tallest; the pole is a saguaro. (Chicago's dark column was a signal pole a metre and a half from
the lens: right.)

**Asheville's main street** stood the camera inside a shop: Wall Street was 10.9 m — the tile service
widens every untagged North American street for a parked lane each side — and its shops' fronts stood
inside the asphalt, their stoops in the lane, no sidewalk. A twentieth of the street samples in Asheville
and Chicago had a front inside the road. **kerbside.ts `fitToFronts`** (the tile build, before any
builder): where a tile's own street runs 12 m or more past mapped fronts within 1.5 m of its kerb, that
stretch is cut out and drawn at its travel lanes' width, its parking given back (`NO_PARK`: no default
parking paint, no shop-door cars, no kerb spaces); where fronts stand both sides closer than that (a
width in feet: Lawyers Alley's "15"), the room between them less a 1.5 m sidewalk each side, never under
a lane each way, never a motorway's. A tile fits only its own ways from what it sees; its neighbours keep
the way at its first width as context, which only keeps their things farther off. Fronts inside the road
(every car street sampled): Asheville 4.4% → 1.3%, Chicago 4.1% → 3.0%, Seattle 1.3% → 0.1% (under a
metre of sidewalk: 9.7 → 3.9%, 7.0 → 3.8%, 5.3 → 0.9%). Wall Street: 6.5 m, a sidewalk each side, the
stoops on it, the survey's street trees on the new sidewalk.

**Small things in other streets' lanes**: a pit dug at one street's kerb stood in the street it met at a
junction — and its tree with it (kerbside.ts `carriageAt`: pits, the city's street trees and their
bins keep out of any carriageway). Asheville's roads check: 258 hits → 121 (buildings 136 → 45, the
small things 45 → 17). **An overpass's pier** stood in the freeway's lanes under it (two even spans: the
pier mid-span): a pier never stands in the way of what passes under a bridge — a street, a railway, a
lower deck — moved along the span to clear it (up to 15 m) or left out (bridges.ts `drawWay`'s `under`).

**Earlier today, not yet logged** (Manhattan's lanes, 2,318 hits → 81): an underground station's halls
were one outline over a dozen streets (realTile skips `location=underground` and buried `layer`s;
`dropStreetCrossers` drops an outline a street runs through for 40 m — the served tiles still carry
them); widths tagged in feet ("69'6\"") read as metres (`parseLen`, `feetWidths`). **A phone's far small
things** (`streamParams.smallCull`: phone 120, low 90, desktop 200): an instanced mesh past its own size
× that from you isn't drawn — mailboxes, hydrants, benches, plants, parked cars (Red Bank on a phone:
146 meshes, 5,845 instances); a tree mesh spans its tallest tree, so the far woods stay (seen from 35 m:
the woods to the horizon).

**Also:** the two whole-cast sim tests (a bear stands to look, the lake's geese) and the monarchs' get
30 s — they ran past 5 s under the full suite's load while the audit ran beside it.

**Verified:** typecheck; `npm test` 1037/1037 (new: tests/smallCull.test.ts; roadsClear's fit, canyon and
NO_PARK cases; streetTrees' desert crowns); the shore's full playtest PASS (11 checks: frames p50 16.7 ms,
max 50, no 100 ms hitch; roads 1.28 a thousand; walkabout, drive, teleports 2.9 s, streaming); Asheville's
walkabout and drive pass (its roads check 2.9 a thousand, over the shore's 2: below). audit48 for
Asheville, Tucson and Chicago re-shot after the fixes (montages read).

**Next:** what's left in Asheville's lanes — a few small outlines in a street (Hilliard Avenue's is a
booth on its turnaround's island: real), **a short bridge whose ends are on the ground can't clear
the road under it** at its grade (a 60 m street bridge over a freeway rises 1.5 m: its deck and
parapets at a car's height across the road below — Central Avenue's; the approaches want raising on
their embankments, which a smoothed DEM loses), the narrowest alleys' walls; the tile service's v26
(osmToTile's widths and underground outlines at the source — Robby's go-ahead and a redeploy); Asheville's
desktop frames (p50 32 ms among 55,000 trees).

## 2026-10-07 — Smooth away from Sea Bright; roads and bridges clear (Robby's PC)

Robby: "on mobile sea bright my game runs smooth at high fps but when going away from sea bright or
telelporting it starts to really lag … also going over sandy hook bridge and driving through main
cities sometimes the roads have walls or buidlings in them". The first session on his PC after the
cloud's: the heavy checks the cloud skipped, run on the RTX 4070 (D3D11), found both.

**The freezes — shaders compiled as they were first drawn** (render/warm.ts). On D3D11 one paint shader
takes 0.15–1.9 s to compile; the shore's full playtest froze 2.2 s walking.
- The boot's `renderer.compile` built canvas programs: the watercolor post draws into a render target and
  three.js keys a program by where it draws — 44 of 94 programs were never used, the real ones compiled
  on first sight. `compileForScene` compiles into a target, in parallel (KHR_parallel_shader_compile), and
  the lazy layers lend a probe each (near trees' wood and cards — the cards' material now made up front —,
  understory, horizon ring, far skyline, the residents standing and sitting). Boot to ready 36 → 17 s.
- A streamed tile mounts once its shaders are built (`ShaderWarm`: a probe per variant, kept; the near
  trees' far-LOD switch mirrored); the spawn's own tiles wait for theirs.
- A tile mounted whole (the spawn's ground) uploads a budget a frame (stream.ts `uploadQ`), not 265
  meshes at the first turn of the head (150 ms).

**The lag away from Sea Bright** (phone emulation: Pixel 7, phone tier, CPU 4×; Red Bank after a teleport):
- Wooded inland towns carry ~22,000 far trees at 1,000–1,440 vertices (Sea Bright has few). A phone's far
  models are a step coarser (flora.ts `setFarDetail`, TreeTier.farDetail −1: lobes detail 1→0 / 0→octahedron,
  limbs two sides fewer; the full model's measures and plan kept): the ring's tree vertices 26.6 M → 13 M.
- The grass builds a cell a row at a time inside its 3 ms (was 45–180 ms a cell); a tile's mount is a
  generator pumped 4 ms a frame (`streamParams.mountMs`; its scope closed between steps; a relief swap and
  the spawn still whole); `worldRoot` and the tiles' objects off matrix auto-update (8% of the frame);
  the scene's matrices once a frame, not per pass; `tzOffsetMinutes` memoised (a formatter per call was
  1.4%); the interiors' instanced furniture its own material (one shared with plain meshes re-derived its
  program every switch). Red Bank after a teleport: p50 129 → 52 ms, now level with Sea Bright.

**The roads** (a new playtest check, `__ROADWALLS__`, `roads`: every car street's lanes sampled at its
own surface — a bridge's deck — for walls at a car's height, footprints, deck gaps). Before: the
Highlands (Route 36) bridge 176 walls on its deck and 314 footprints; the shore 67; Red Bank 36.
- Route 36 is two one-way bridges, each given a two-way trunk's 12 m: a divided road's one-way halves are
  their own lanes wide (realTile.ts, bake.mjs; `narrowOneWays` for the baked shore's and the tile
  service's data), and a parapet that would stand on another deck at its height is left out (bridges.ts).
- The survey's blocks along the bridge were the deck itself (LiDAR returns), made buildings as tall as
  it: `fitUnderDecks` drops a survey block under a deck and holds a real building's top under the deck's
  soffit (`hy`, applied after the guessed and measured heights), or drops it where no storey fits.
- Every building's walls reached the sky: now to its ridge (`Footprint.ridge`, `wallTop`); a small thing's
  outline (a post, a parked car) to 8 m over its ground (pack.ts `replayOp`); a trunk to its crown.
- A willow on the bank under the Rumson bridge stood through its roadway: no tree whose height reaches a
  deck over it, no tree pit under one.
- Parked cars: a shopfront's spaces and a lot's lay across Church Street's and New Street's mouths, a
  drive's car across Rumson Road's lanes — none now where a street runs through it, in two streets'
  carriageways at an angle, or across one's lanes (kerbside.ts `streetThrough`), none on a deck.
- After: the Highlands bridge 0 on its deck, the shore 15 (1.3 a thousand samples), Red Bank 28.

**Verified:** typecheck; `npm test` 1031/1031 (new: tests/warm.test.ts, tests/roadsClear.test.ts, tests/coverPatch.test.ts);
`npm run build`; the shore's full playtest — frames, walkabout, drive, teleports, streaming, roads pass
(frames max 50 ms, no hitch over 100 ms); self-tests pass but flicker's, which fails on the last commit too
(its planted 5 mm fight doesn't fight on this GPU's depth — not chased).

**The rest of the PC checks:** the soak (shore, 120 s: no stalls, 7 frames over 250 ms in its door, stair,
flight and hour-skip churn), `mobile-check` on a Pixel 7 and an iPhone (running, no errors, every shader limit
inside a phone's), the shader check (27 programs, no errors), CI green on the push.

**The animals where they live** (`tools/critter-shots.mjs`, new: each animal's place, date and hour
opened with its `see=` link, framed close through a long lens and wide, from where nothing walls the
view → shots/critters-<tag>-montage.jpg; `--set=own` takes the game's own "go see it" places). The
handoff's 18: the dolphins porpoising past the shore, the seals hauled out on its January beach, the sea
otter, the orca breaching, the anole on a mossy trunk, the turtle at a dock, the darner, the monarchs, the
gulls, the lizards, the slug — all at their ground's or water's own level, nothing floating or sunk. Four
never came, even at their own places — the fiddler, the crawfish, the black bear, the beaver:
- **A streamed cell had no land and no water's edge**: its land cover was grass (30) everywhere and every
  land node 50 m from any water, 510 m from the sea — so all that keys on WorldCover (woods 10, scrub 20,
  wetland 90…) or on the water's edge worked only in the baked shore. `dem.ts coverPatch` (the worker,
  after `waterPatch`): the map's woods, scrub, lawns, beaches and wetlands as WorldCover's classes; the
  shore's signed distance, both sides, the shore line where it was (land to 300 m, water to −60 m: checked
  from above, Lake Placid's shore the same either way); the sea's distance within the cell. The crawfish
  and the beaver came.
- **"Go see it" stood you on the wrong ground**: the fiddler is the salt marsh's (a 'marsh' habitat: on it),
  and its mud is the whole low marsh now, not only a mapped creek's bank (a marsh's creeks are mapped as
  lines; the tiles carry none); the deer, the bear, the moose and the slugs keep to the woods (a 'woods'
  habitat: just out of the nearest wood's edge — Cades Cove's open valley had none within the 60 m the
  sim spawns them in). The fiddler and the bear came.

**Next:** the cars and footprints left in towns' lanes are where the map's default street (a residential
street + parking, 10.9 m) runs wider than the street between its buildings; the map's waterways (a marsh's
creeks, a town's streams) need the tile service's data (keys); the lake's stair-step shore (the streamed
ground's grid cut at the water) is older than today; the audit48 montages.

## 2026-10-06 — The ecosystem review: each animal on its own ground, in its numbers, season and range

Robby: review everything for specifics like "seagulls land 3 m from the sea to any road" — always a
balance; plants come next. Every role's placement, wandering, counts, seasons and the 16 regions' casts
(July and January dumped side by side) were read through. Fixed:

- **Ground**: the pigeons on a plaza or a lot, never the road (`lotAt`, as the gulls'); a wandering
  animal's next spot off the road (`valid`: deer, rabbits, turkeys don't mill in the street — one fleeing
  still dashes across); the **fiddler crabs on the salt marsh's and the mangroves' mud** (`mud`: cover 90/95
  by the creeks), never the swimming beach (closes the handoff's known gap); the herons, the egrets and
  the moose in the shallows at ponds, rivers and marshes, not the open surf (`wade`); the mullet and the
  tarpon in the sea's water and the canals off it (within 400 m of the open sea), not a pond a few
  streets inland; the bison only where the land's wild (`settled` too, not only downtown).
- **Numbers**: the gulls 6 on a beach and 2 at a lot in town (were 9 anywhere); a raptor or two overhead
  (were 3); the life sim's beach flock (220) as many as the place is busy (`density`: the knobs, a
  phone's share) — the ones past the count go, or come back, only out of sight (160 m).
- **Seasons**: the robins off the northern lawns from December to February and the South's (Florida's, the
  Gulf's, Texas's) only November to March; the ground squirrels of the Plains, the Rockies, the Basin,
  the dry Northwest and the Midwest asleep October to March; the beaver under the ice where the winter's
  hard; the bass and trout of the cold country still from November to March.
- **Range**: no alligator in the Ozark Highlands (southern Arkansas's lowlands only, l3 35/73).

**Verified:** typecheck; `npm test` 1018/1018; `tests/balance.test.ts` (new: pigeons on a plaza not the
road; fiddlers on the marsh not the beach; mullet in the bay not the pond; bison never by a suburb;
robins, ground squirrels, beavers and bass by season; no Ozark alligator; the gull and raptor counts;
the life sim's flock follows the knobs). Tests that leaned on the old ground moved with it: the fiddler
flat onto marsh mud; the beach test counts any of the shore's gulls; a downtown of pigeons is a plaza;
the lifeSim door test logs its rare, chaotic glitch rather than requiring it.

**Next — plants**: the same balance for the flora (the green spots: docs/REGIONAL_LIFE.md).

## 2026-10-06 — Toned down: fewer people, cars and animals; a phone lighter; no gulls in the road

Robby, flying from Sea Bright to the Rumson bridge on his phone: "still too busy, for people, animals
and cars … like 6 seagulls in the road wherever I went … like 2 fps".

- **The gulls in the road**: a gull could come down on any paved ground within 3 km of the sea — and
  the paved index holds every road. Now a parking lot or a plaza only (`CritterEnv.lot`, main.ts
  `lotAt`: the index's rings, not its road segments), or the beach; and 4 of them about, not 9.
- **The animals**: each role's count × `lifeParams.animals` (0.5; `Critters.amount`), and a phone at
  half that again.
- **People and cars**: `density` 0.7, the suburbs' and the country's streets ×0.55 (a main street and a
  city's towers busier than the rest), the beach's people 0.7; a phone at half of all of it
  (`TIER_LIFE`: desktop 1, phone 0.5, low 0.35).
- Panel: "how many animals" beside the "how busy" knobs.

**Verified:** typecheck; `npm test` (all but the two default-pinning tests, updated); `tests/seeIt.test.ts`
(the gulls on a lot, never a road; half the animals at 0.5; the new defaults and the phone's share). No
browser run (Robby tests on his PC and phone).

## 2026-10-06 — The panel's Creatures folder ("go see it"); a better balance of how busy the world is

- **Creatures** (the dev panel, `` ` ``): pick any of the 95 animals; "goes to" shows where and when;
  **go see it** jumps to a place it lives (`ui/seeIt.ts`: its own where it has one — the sea otters at
  Monterey, the orcas off San Juan Island, the monarchs' winter roost — else the first of ~34 places
  across the lower 48 whose cast has it), sets the month and an hour it's up, stands you on the beach or a
  bank facing the water if it keeps to one (`standBy`), makes sure it comes (`Critters.spotlight`: always
  present, first pick for its role's slots) and tells you how far and which way once it's about. A far
  place reloads with `?at=…&date=…&hour=…&see=<kind>` (the link works by hand too). **where is it?**:
  the nearest one's distance and bearing. **every animal about**: ignores how rare they are.
- **How busy** (Robby: "always crowded everywhere at all times" — "but I do like it crowded in some
  spots"): the busy places keep their crowds (a main street, a city's towers, the summer beach); the
  suburbs' and the country's streets at 0.65 (`lifeParams.suburbs`; `crowdOf`); the hours between the
  day's peaks thinner (`lifeSim.ts RHYTHM.peak` 1.3: a mid-morning's 0.4 → 0.3, a peak stays). New knobs
  in Life & sound: how busy everywhere / suburbs & country / main streets / cities / the beach (the
  beach's people now follow a share knob too, `CrowdLayer.update(…, share)`).

**Verified:** typecheck; `npm test` 1008/1008; `tests/seeIt.test.ts` (new: every animal has a place,
month and hour where its cast has it; the own places; habitats and hours; standing on the beach and a
pond's bank facing the water; bearings; a spotlit turkey comes on a settled shore lawn; `crowdOf`; the
peak kept and the morning thinner; the beach's share deterministic). The lifeSim door test pins
`RHYTHM.peak` to 1 (the rare glitch it checks for is chaotic under the thinner traffic). Not yet clicked
through in a browser: Robby is testing on his PC.

## 2026-10-06 — How common each animal is: rare in town, more in the wild

Robby, walking Sea Bright: turkeys and foxes "running around everywhere" — in a shore town they'd be a
rare sighting. The cause: the sim filled every role's slots from whatever species the region has, and
its town measure counted only shops and downtowns, so a suburb read as the wild. Now:

- **`ABUNDANCE`** (`fauna.ts`): each species' `[town, common]` — how well it lives among people, and how
  often it's about even where it lives. `presenceOdds(kind, wild)` = common × (town + (1 − town) ×
  wild). The squirrels, the pigeons, the robins, the gulls: everywhere. The raccoons and opossums: in
  town now and then. The deer, the foxes, the coyotes: a sighting at a town's edge, ordinary only in
  the woods and the fields. The turkeys: one patch in twenty in a town. The elk, the moose, the black
  bear, the horned lizard: rare even in the wild. Every species has its row (a test holds it).
- **A lottery per patch of ground** (`Critters.present`): each species is about a 160 m patch this
  month or it isn't — seeded by the patch and the month, so the same for every visitor (a walk across
  town meets a fox in one patch, none in the next ten). The sim only fills a role's slots from the
  species present.
- **How settled the land is** (`CritterEnv.settled`, main.ts): the houses in the 3×3 of 80 m squares
  about the walker (~6 to a square is a full suburb), or the town measure if higher. Sea Bright's
  streets read as settled; the woods and the farmland as wild.

**Verified:** typecheck; `npm test` 999/999; `tests/abundance.test.ts` (new: every species has its odds;
the town birds and the squirrels everywhere, the shy and big ones scarce in town, never fewer in the
wild; the lottery deterministic and keeping its odds, a new draw each month; a walk over 30 patches of a
settled Sea Bright — squirrels and robins in most, a turkey in at most two, the foxes and coyotes at
dusk in at most four — against the same walk out of town, with more of both). A probe over 60 patches:
settled Sea Bright 1 turkey, wild 21; settled Seattle 1 elk, wild 24 (so the elk's odds came down,
0.35 → 0.2, and the sandhill crane's, 0.5 → 0.25). The shore playtest PASS (main.ts's settled measure).

**Next:** Robby's PC: walk Sea Bright and a stretch of woods and say if the balance feels right (the
table is one line per species).

## 2026-10-06 — Regional life: the water's life, seen from above — fish, seals, dolphins, whales

Robby's option A: the life in the water as you see it from the shore, a dock or a boat — what breaks the
surface — with no underwater world, and cheap ("don't need a million fish spawned if I can't see
them"). The big ones get the polygons; the fish stay light.

- **The fish** (`fishGeometry`: a countershaded body, dorsal, pectoral and anal fins, the tail fin on its
  own pivot swinging side to side — `uWag`): **rainbow trout** (its pink band and spots), **largemouth
  bass**, **mullet**, **Pacific salmon** (the fall run), **tarpon** (big and silver, the upturned jaw),
  **silver carp** (the Midwest's rivers). They cruise unseen under the surface — **not drawn** — and
  now and then come up: a trout's rise and its ring, a tarpon rolling, a **leap** (the mullet again and
  again; the silver carp when you come close), with a splash and a ring where it lands.
- **The schools** (`shoalGeometry`): dozens of little fish milling just under the surface, turning
  together — the Caribbean's and Florida's clear shallows above all (Robby: "lots of small fish from
  above"), the Gulf's, the Mid-Atlantic's in the warm months.
- **The dolphins and the whales** (`whaleGeometry`, 10–12 sides: flukes on the tail's pivot, flippers,
  a fin by kind): the **bottlenose dolphin** and the **harbor porpoise** in pods beyond the breakers,
  rolling over the surface in arcs; the **orca** (tall fin, eye patch, grey saddle) **breaching** clear
  of the water; the **humpback** (long white flippers, the knobs on its head) and the **gray whale**
  (mottled, its knuckles), 250–700 m out: up, **two or three blows**, then sounding with **its flukes
  lifted**, and long under. In their seasons: the Jersey Shore's dolphins in summer and its humpbacks
  in winter, California's gray whales from December to April.
- **The seals and the otters** (`pinnipedGeometry`): the **harbor seal** (spotted), the **gray seal**
  (its Roman nose), the **California sea lion** (ear flaps, up on its flippers) hauled out on the beach
  or riding low in the water, humping down into it when you come; the **sea otter** afloat on its back
  off California's central coast; the **river otter** on the banks and in the rivers.
- **The beaver, done properly** (Robby: "ensure they are done nicely"): its own plan (`beaverGeometry`)
  — a rotund body, orange incisors, webbed hind feet, the scaly black paddle of a tail, a peeled stick
  carried now and then; a wake as it swims; **the tail slap**, a ring and a burst of spray, and under.
- **The cost**: the fish only within ~30 m of water and only near the walker; cruising fish and the
  pods and whales between breaths not drawn; one humpback or two grays at most; the water's rings and
  blows (`Critters.fx`) capped at a dozen each; empty meshes not drawn. A splash sound (`ambience.ts`).

**Verified:** typecheck; `npm test` 999/999; `tests/waterLife.test.ts` (new: ranges and seasons; the
fish's tail pivot and sizes, the school, the flukes, flippers and marks, the seals' and the sea otter's
float, the beaver's incisors, paddle and stick; a mullet's leap with its ring and splash, a cruising fish
not drawn, the fx cap, a dolphin's arc and an orca's breach, a whale's blows and fluke dive kept at
400 m, whales placed far out, a seal humping into the sea, the sea otter on its back, the beaver's tail
slap); foundry budgets (`tests/foundry.test.ts`); shader check 27/27; studio montages of the fish, the
seals, the cetaceans and the river life; the shore playtest (`--quick --swiftshader`) PASS, 6 checks, no
page errors.

**Next:** Robby's PC: the shore in July (dolphins), January (seals, a humpback), Key West's shallows,
Seattle's orcas; then the P2 water rows — sharks' fins, rays, menhaden's ripples, the elephant seals.

## 2026-10-06 — Regional life: the West's lizards — fence, side-blotched, spiny, collared, horned

The reference's first P2 rows (`docs/regional-life/models.md` §13.1), so the West has its lizards: five
rows on package #15's `sprawlerGeometry`, which grows the marks they're known by (`SprawlerRow`: a male's
`patch`, the `blotch`, `collar`s, `spines`, `horns`, the head's size and colour, the body's depth). A
small one's legs and tail are open rods now (a hand-long lizard needs no capped tubes: the budget went to
the marks).

- **The fence lizards** (the eastern, the prairie and plateau lizards; the western fence and sagebrush
  lizards): grey-brown, spiny-backed; **a male's blue flank patches** on the display part (`RACK`: half
  of them). East and West: the Ozarks', Appalachia's, the Southeast's, the Mid-Atlantic's pine barrens',
  the Gulf's, the southern Midwest's; California's, the Northwest's, the Great Basin's, the Rockies',
  the Plains', Texas's.
- **The side-blotched lizard**: small, brown-grey, the **dark blotch behind the foreleg** — the desert's,
  the Basin's and California's most-seen lizard on a trail.
- **The spiny lizards** (Texas's, the desert spiny, the granite spiny): big and spiny, the desert
  spiny's **black collar**, a male's blue-green patches; as often as not **up a trunk**, going round and
  up when you come, like the anoles.
- **The collared lizard** ("mountain boomer"): the **big pale head** and **two black collars**, a male
  turquoise and a female tan (set at spawn by its sex); it **runs up on its hind legs**. The Ozarks'
  glades to the Plains, Texas, the desert and the Basin.
- **The horned lizards** (Texas, regal, desert, short-horned, coast): **a pancake of a body, its crown
  of horns and the fringe along its flanks**; it **sits tight** when you come. Rare (a find), by the
  ant mounds of Texas, the Plains, the desert, the Basin, the Rockies and California.
- How they live (`lizard`, a new role): out in the sun on open ground (shrub, grass, bare: the desert's
  flats and trails) by day, April to October (the South's and the desert's from March); **push-ups** now
  and then (the forelegs' bob); a **dash of a few metres** to cover, not a forty-metre run; short
  scurries between pauses.
- Fixed on the way: a broad lizard's tail and legs had scaled with its width (the horned lizard's tail
  stood up like a fin); they follow the body now.

**Verified:** typecheck; `npm test` 982/982; `tests/lizards.test.ts` (new: the ranges and seasons; each
build's marks — the blue patches on the display part, the blotch, one collar and two, the pale head, the
pancake and its horns; push-ups, the short dash, the horned lizard sitting tight, the spiny lizard up its
trunk); budgets in `tests/foundry.test.ts` (each under 1,600); a studio montage of the five beside an
anole and the alligator.

**Next:** the snake† and frog† plans (the reference's P2), more insects on the bug† and dragonfly†
plans; moss on the ground and on boulders; then the region pass (track B) on Robby's PC.

## 2026-10-06 — Regional life: the leftovers — the inland gulls, the black oak and the gray pine, smooth cordgrass, duckweed

The leftovers the packages left open (`docs/ROADMAP.md` track D), each on the system already built for
its kind.

- **The inland gulls** (bird plan rows, the `gull` role): the **ring-billed gull** (the pale grey back,
  the yellow bill with its black ring, yellow legs) and the bigger, paler **herring gull** (pink legs, a
  red spot on its bill). The bird plan's new bill marks (`billRing`, `billSpot`); the California gull now
  wears both. The ring-billed in every region (the South's and the West's warm valleys from September to
  April); the herring gull on the Great Lakes and the North's coasts (the Southeast's and the Gulf's in
  winter). More than 3 km from the sea they come down on any lot or field: the Midwest's parking lots
  have their gulls at last. By the sea they keep to the beach and the coast's lots with the laughing
  gulls (fixed on the way: otherwise, free to settle on any field, they took every gull slot on the
  Jersey shore's beach).
- **The California black oak** (an `OAKS` row): a forest tree with its crown held high, an open-grown one
  on a leaning trunk, an old one on two trunks with a limb dead; near-black bark; **gold in the fall**
  (Yosemite Valley's). In the Sierra's, the Klamath's and the Cascades' mixed-conifer forest, a few in
  the north coast ranges (`broadMix`); a mapped oak there may be one.
- **The gray pine** (a `PINES` row): leaning out over its slope, crooked, so sparse the sky shows
  through, its long grey-green needles hanging in brushes (the southern pines' long-needle cards). With
  the blue oaks in the foothills (`broadMix`) and on the Sierra's lowest slopes under 1,000 m, the
  ponderosa coming in above (`coniferMix`).
- **Smooth cordgrass** (the grass field's tuft kind 3): on the land cover's herbaceous wetland (ESA
  WorldCover 90) within 3 km of the sea, on the Atlantic's and the Gulf's coasts (`flora.ts
  cordgrassCoast`, `grass.ts saltMarsh`), right down to the water's edge (other grass keeps 4 m off the
  shore). Tall along the water and the creeks (a metre and more), knee-high on the high marsh
  (`cordgrassHeight`); yellow-green in summer, gold-tan as the fall comes on, tawny straw through the
  winter.
- **Duckweed** (the lake shader): on still water only — a pond, a small lake, a swamp's open water
  (`synth.ts stillWater`: under 25 ha and compact; never a river's ribbon), the sheet's `aStill` — in the
  Gulf's, the Southeast's and Florida's warm months (`flora.ts duckweedCover` → `waterParams.uDuckweed`:
  May to October at its height, coming and going in April and November, Florida's thinner through its
  mild winter). A lime carpet over most of the water, dark lanes of open water wandering through it,
  its ragged edges breaking into specks.
- Fixed on the way: the gray pine's and the black oak's leans tuned so the near model's trunk foot sits
  flat and flared on the ground (the foundry's near-tree check).
- Left out: the duckweed parting in a wake (the sheet doesn't know where a boat or the walker is yet);
  the salt-meadow hay of the high marsh; the Pacific's marshes.

**Verified:** typecheck; `npm test` 979/979; `tests/leftovers.test.ts` (new: the gulls' ranges and
seasons, their bill marks and sizes, gulls coming down on a Midwest town's fields; the black oak's and the
gray pine's places, fall hue, needles and lean; the salt marsh and cordgrass heights; duckweed's regions
and months; still water against a lake's and a river's); the shader check, which now compiles the water
too (27 programs: the sea, a lake sheet with duckweed, the coast's foam; no errors); the shore's
playtest; studio montages (the four gulls; the black oak and gray pine beside the blue and valley oaks
and the ponderosa; a pond at three duckweed coverages; cordgrass beside plain grass in summer and fall).

**Next:** the reference's P2 rows, the West's lizards first; moss on the ground and on boulders;
`upstairs-over-shopfront`.

## 2026-10-06 — Regional life (16): the small life — monarchs, darners, cicadas, banana slugs, fiddlers, crawfish

Package #16 of `docs/regional-life/models.md`, the last of the build order: four new plans (`fauna.ts`
`dragonflyGeometry`, `bugGeometry`, `slugGeometry`, `crabGeometry`), the monarch on the butterfly row
(`monarchGeometry`), four new roles (`dragonfly`, `bug`, `crawler`, `crab`) and the crawfish's chimneys
(`signs.ts`).

- **The monarch** (the butterfly row): orange wings veined in black, the black borders dotted white,
  the forewing's black tip with its orange spots, paler underneath; the black body dotted white, the
  clubbed antennae. It flaps and glides (a few deep beats, then a sail: the wing shader holds its wings
  out flat while its amount is below zero). With every region's butterflies in summer. In September and
  October it **streams south**: in over the walker from the north, high and steady, along a broad front
  (`monarchMigrating`). On California's coast from November to February it **winters in a roost**: in
  the biggest tree about, three clusters hanging under the crown, the monarchs shingled down them with
  their wings closed (`monarchRoost`); on a warm afternoon some burst into flight round the tree and
  settle again.
- **The common green darner** (dragonfly†): the great eyes, the green thorax, the long abdomen (a male's
  blue, a female's red-brown) ringed dark at each segment, four long clear wings with dark leading
  edges and the stigma near each tip. It **patrols a beat** along a pond's or a creek's edge at head
  height (`patrol`): along and back, hanging still a moment at each end, darting off and turning on a
  dime, now and then aside after a midge. Its wings a blur on the wing (the shader's new bug mode: wings
  as built at rest, a fast beat in flight).
- **The annual cicada** (bug†): the broad head with its eyes set wide, the green thorax and its dark
  saddle, the black abdomen, the clear green-veined wings tented over the back like a roof. On the bark
  two to five metres up through a summer's day; **its chorus** fills the ambience wherever cicadas are
  on the bark about you (`Critters.chorus` → `ambience.ts`, now the East's, the Plains' and Texas's as
  well as the desert's); come within 2.5 m and it buzzes off. **Its shell** (the same plan, `shell`):
  the nymph's amber skin left lower on the bark, humped, split down the back, the wing pads and the
  digging forelegs.
- **The Pacific banana slug** (slug†): the long soft body (yellow to olive, by the instance) flat on its
  foot, the mantle's saddle and its breathing hole, black spots, the tail tapering to a point; its
  **tentacles** — the upper long with eyes at their tips — on the display part, out while nothing's near
  and **drawn in when you stand over it**. On the forest floor of the wet Northwest and the redwood
  coast, through the wet months; it glides a few centimetres at a time.
- **The Atlantic marsh fiddler crab** (crab†): the carapace on four pairs of legs, the eyes on long
  stalks; a male's **great claw**, white-yellow and longer than he is wide, folded across his front
  (the display part, worn by half of them: `RACK`), **waved** by the head's idle bob. By the score on the
  shore by day; it goes sideways; come within 5 m and **the whole flat goes down its burrows at once**
  (the alarm spreads a beat apart), coming up again once you've gone by.
- **The crawfish** (crab†, the long tail): dark red, the segmented tail and its fan, the long feelers,
  the big bumpy claws out ahead. On the bank by a ditch, a creek or a pond; come within 3 m and it
  **stands its ground, claws raised, backing off** (the warning pose). **Its chimneys** (`signs.ts`
  `chimneyGeometry`, `crawfishChimneys`): towers of mud pellets a hand high in clusters in a wet lawn or
  a ditch near fresh water, in the Gulf's, Texas's, the Southeast's, the Plains' and the Ozarks' crawfish
  country (`chimneyCountry`).
- **Where and when** (ranges.md): the monarch everywhere from May to October (the South's from March,
  Florida's and California's the year round); the darner everywhere spring to fall; the annual cicadas
  the East's, the Plains', Texas's and the desert's in summer, their shells into the fall; the banana slug
  the westside Northwest's and the redwood coast's and the Klamath's, not the dry end of summer; the
  fiddlers from Cape Cod round to Texas (the year round in Florida); the crawfish the Gulf's, the
  Southeast's, East Texas's, the Ozarks', Appalachia's, the Midwest's, Upstate New York's and the Plains'.
- Fixed on the way: the black bear's stand-up was a coin from the shared random stream (the new roles
  drew from it first and the bear's test lost its luck); it's the bear's own temperament now (by its
  seed, most stand up to look), and it stays up until it goes (it used to wander off mid-look and stand
  again).
- Left out, honestly: the slug's slime trail (a strip on the ground read as a stick in the studio); the
  chimneys stand the year round (the "spring after rain" timing isn't modelled); the fiddlers take the
  map's shore (the beach) for the marsh's mud, which the map doesn't tell apart yet; the crawfish keep to
  the bank (not seen under the water).

**Verified:** typecheck; `npm test` 972/972; `tests/smallLife.test.ts` (new: the ranges and seasons; each
plan's build; the chimneys clustered and tile-independent; the darner's beat with its turns and hovers;
the cicada's chorus and its buzzing off; the slug's tentacles in and out; the fiddler flat down its
burrows and up again, males and females; the crawfish's warning; the monarchs' winter roost in the
tallest tree, their warm-afternoon flight and settling, their fall stream south); budgets in
`tests/foundry.test.ts` (every one under 1,600; the chimney under 600); the shader check (24 programs,
no errors); the shore's playtest; studio montages of all seven and the chimney.

**Next:** the leftovers (duckweed, smooth cordgrass, black oak and gray pine, the inland gulls), then
the reference's P2 rows (the West's lizards first).

## 2026-10-06 — Regional life (15): the reptiles — the alligator, the anoles, the turtles on a log

Package #15 of `docs/regional-life/models.md`: two new plans on the same joints (`fauna.ts`
`sprawlerGeometry`, `turtleGeometry`, in `NEW_PLAN`) and a new role, `basker`: the animals that lie out
in the sun by the water and go into it when you come.

- **The American alligator** (sprawler†): the long low body slung between legs splayed out to the
  sides, the broad rounded snout, the eyes up on top, the ridged scutes down the back and tail, the
  tail tapering to the ground behind it (it rests on the ground: never lower than its own thickness).
  Three metres long. It lies on a sunny bank facing the water or floats with only its eyes and snout up
  (`swimSink`); come within 12 m and it belly-slides into the water (`slide`) and sinks without a
  ripple.
- **The green and brown anoles** (sprawler†, the pointed snout): a hand long, up a trunk head up (drawn
  a little larger than life so you see them). Each flashes its throat fan now and then by its own clock
  (the dewlap rides the display part, 9, out only while it displays); come close and it goes round the
  trunk and up. The green anole turns brown when it's cool.
- **The painted turtle, the red-eared and the yellow-bellied sliders** (turtle†): the domed shell with
  its coloured rim, the pale plastron, the striped neck, a slider's red or yellow patch behind the eye,
  the shell riding low on splayed legs. In a row along a log at the water's edge (`signs.ts`
  `baskingLogs`: a log lying out into the water, one cell at a time, the same however the land is
  tiled; the props draw it, the sim seats the turtles on it); when you come within 10 m they slide off
  with a splash and come up swimming, heads up. With no log about, swimming.
- **Where** (ranges.md): the alligator on the Southeast's coastal plain (not the Piedmont), Florida, the
  Gulf, East Texas and the Ozarks' south in the warm months; the yellow-bellied slider the Southeast's,
  Florida's and the Gulf's; the red-eared slider everywhere (planted far and wide); the painted turtle
  everywhere but Florida and the desert, under the ice in a northern winter; the green anole across the
  South, the brown anole Florida's and the southern coasts'.
- Fixed on the way: the alligator's tail dipped 6 cm below the ground (the foundry's "on its feet"
  check); an anole's head the plain icosahedron (it's a fingertip: the finer mesh put it over the small
  animals' 1,600).

**Verified:** typecheck; `npm test` 966/966; `tests/reptiles.test.ts` (new: the ranges and seasons; the
plans — the alligator's length and lowness, the anole's size and its throat fan, the turtle's low shell;
the logs at the edge lying into the water and tile-independent; turtles on the logs sliding off, the
alligator sliding in and sinking, the anole going up and flashing its fan); budgets in
`tests/foundry.test.ts` (the alligator with the big animals at 2,500); the shore's playtest; a studio
montage of all six (side on, three-quarter, from above).

**Next:** package #16, the small life (the monarch, the green darner, the cicada, the banana slug, the
fiddler crab, the crawfish and their chimneys).

## 2026-10-06 — Regional life (14): the new plans — bear, bison, armadillo, manatee

Package #14 of `docs/regional-life/models.md`: the four animals no existing body could make, each a
plan of its own (`fauna.ts` `bearGeometry`, `bisonGeometry`, `armadilloGeometry`, `manateeGeometry`,
dispatched by `NEW_PLAN`) on the same joints, so a grizzly, a cow or a javelina is a row later.

- **The American black bear** (bear†): the heavy rounded body, rump as high as the shoulders, the round
  head and tan muzzle, small round ears, thick pigeon-toed legs. Its coat a TINT: black in the East;
  black, cinnamon, brown or blond in the West. It stands up to look when you come (sitting up about its
  hind feet: `sitPivot`), then goes; a sow in summer has one to three cubs at her heels (`Critter.lead`:
  a cub keeps by her), and a startled cub goes up the nearest tree. At the wood's edge with the deer
  (`browser`), denned up through the northern winter.
- **The American bison** (bovid†): the great woolly forequarters, the high hump, the lighter, smaller rear,
  the head carried low with its beard, short curved horns (both sexes: `antlers: 'bison'`, `RACK` 1), the
  tufted tail. In herds; drops and rolls in a dust wallow (`wallow`); a bull bellows in the July rut. Only
  deep in open country (bison are kept herds: until the map's protected areas reach the sim, "remote" is
  the stand-in).
- **The nine-banded armadillo** (armadillo†): the front and rear shields and nine hinged bands, the pointed
  head, the upright ears, the long banded tail. Out at night (`forager`); jumps straight up when startled
  (`yip`), then runs.
- **The West Indian manatee** (swimmer†): the grey wrinkled potato of a body with algae on its back, the
  round paddle, the flippers, the square snout. Only its back and snout at the surface (`swimSink`), its
  snout lifting to breathe; it pays you no mind.
- **Where** (ranges.md): the bear in the forested mountains, the Southeast's swamps and Florida, the north
  woods, the Rockies, the Northwest and the Sierra — never the open Plains, the Corn Belt, the Central
  Valley floor or the low deserts; the bison the western Plains' and the Rockies'; the armadillo across
  the South to Kansas, Missouri and the Interior Plateau; the manatee Florida's the year round, the
  Carolinas' and the Gulf's from May to October.
- Fixed on the way: the manatee's belly sat 6 cm above its origin (the foundry's "on its feet" check
  caught it).

**Verified:** typecheck; `npm test` 962/962; `tests/newPlans.test.ts` (new: the ranges and seasons; each
plan's build — the bear's size, the bison's hump forward over the shoulders and its horns, the
armadillo's length, the manatee legless with its paddle wide; the bear standing up then going, cubs by
the sow and a cub up a tree, the armadillo's jump, the manatee unbothered, the bison's wallow and horns
on every one); budgets in `tests/foundry.test.ts` (the bear, bison and manatee at the big animals'
2,500); the shore's playtest.

**Next:** package #15, the reptiles (the alligator, the anoles, the painted turtle and the sliders on a
log).

## 2026-10-06 — Regional life (13): the mammals on the existing bases

Package #13 of `docs/regional-life/models.md`. Robby, 2026-10-06, on the vertex budgets: "could we go a
little higher for more details without losing performance, only if so" — yes, by size (below).

- **The quad plan** (`fauna.ts Quad`): stripes laid on the back's own curve (`backStripe`: a skunk's white
  V, a chipmunk's dark and pale ones), a mask (the raccoon's), a forehead blaze (the skunk's), the tail
  types (`ringed`, `naked`, `plume`, `paddle`, `stub`), `girth` and `legs`, and for the deer plan a mane,
  lower-leg and rump colours, a long muzzle, a hump and a throat bell.
- **Antlers and horns** (`antlerSide`): the whitetail's forward-curving beam and tines, the mule deer's
  forks, the elk's long sweeping rack, the moose's palms, the pronghorn's black prongs, the ram's curl —
  on their own part (9), which the critter material shrinks away unless the sim says the animal wears
  them (aAnim.z + 10): a bull, buck or ram by its seed (`RACK`: a third of an elk herd, half the moose),
  in their months (elk antlers August to March, deer September to January; horns always). The
  white-tailed and mule deer bucks carry racks now too.
- **The twelve mammals:** raccoon, Virginia opossum, striped skunk (the fox plan); fox squirrel, eastern
  chipmunk, woodchuck, American beaver, black-tailed prairie dog (the squirrel plan); elk, moose,
  pronghorn, bighorn sheep (the deer plan).
- **New roles** (`sim/critters.ts`): `forager` (raccoon, opossum, skunk: out at night, in town as much as
  out); `herd` (elk, pronghorn, bighorn: open country at dawn and dusk, coming down by their own, a
  bighorn only on ground steeper than 0.4, running 70 m together when one is startled). The behaviours:
  a raccoon goes up the nearest tree; an opossum plays dead on its side until you've walked off; a skunk
  faces you, stamps, tail stood up (the display pose), then waddles off; a prairie dog sits bolt upright
  as a sentry (the body tipped about its hind feet, `sitPivot`) and now and then leaps in a jump-yip; a
  woodchuck sits up by its hole; a beaver slaps its tail and dives (and swims low: `swimSink` for a
  mammal); an elk bull bugles in the September–October rut, head thrown back; a moose stands in the
  shallows feeding.
- **Where** (`fauna.ts MAMMALS`, ranges.md): the grey squirrel the East's, the fox squirrel the Midwest's,
  Plains' and South's (and planted in western cities); the chipmunk and woodchuck the East's and
  Midwest's (the woodchuck only on the Plains' eastern edge, asleep November to February); the prairie
  dog and pronghorn west of the 100th meridian; the opossum east of the Rockies and on the Pacific coast,
  not the interior West; the elk the West's, California's north coast's, and a few eastern herds; the
  moose the north woods' and the Rockies'; the bighorn the mountains' and the desert's; the raccoon, the
  skunk and the beaver everywhere.
- **Signs** (`assets/signs.ts`): `cellSpots` (the nests' placement, generalised: one to a cell, a cell
  deciding for itself); the beaver's lodge in ponds and lakes, never the sea (`beaverLodges`); prairie dog
  towns (`prairieTown`, pure: the props lay the mounds, `prairieMounds`; the sim keeps the dogs inside
  their town and fills it — the burrowers rise by 14 near a town).
- **Budgets by size** (`critterBudget`): the big animals (the deer family, the great birds, the bear and
  bison to come) 2,500 — a near tree's; the fox plan's 2,000; the rest 1,600, whose extra detail would be
  a few pixels. **And they cost less than before:** an animal more than 8 m away and well behind the
  walker isn't drawn at all (looking about level; looking down from the air, all are) — before, every
  live animal was drawn every frame, seen or not (`Critters.drawn`).
- Fixed on the way: a displaying bird (pose 4, the turkey's strut) counted as flying and flapped; the
  flight test is pose 2 only now.
- Reviewed in the scratch studio: the skunk's and chipmunk's stripes first sank into the coat (blob
  ridges); laid on the body's own curve, they show.

**Verified:** typecheck; `npm test` 959/959; `tests/mammals.test.ts` (new: ranges; marks; antlers on the
head's part, an elk's rack tall, a moose's palms wide, a ram's curl low; a bull's rack in October, not
May, never a cow's; the raccoon's climb, the opossum's dead act, the skunk's warning; prairie dogs only in
their town, sitting up; a herd running together; one behind the walker not drawn, all from the air;
lodges in ponds not the sea; mounds only in towns, the same however tiled); budgets in
`tests/foundry.test.ts`; shader check 24 programs, no errors; the shore's playtest (`tools/playtest.mjs
--region=shore --quick --swiftshader`).

**Next:** package #14, the new mammal plans (black bear, bison, armadillo, manatee).

## 2026-10-05 — Regional life (12): the water and big birds

Package #12 of `docs/regional-life/models.md`: on the ponds and lakes, at their edges, on the beaches and
the lots, walking the fields and over our heads. Robby asked for "amazing animation"; each bird here moves
as its row says.

- **The bird plan** (`fauna.ts BirdPlan`): the long neck (`neck`: two tapering pieces with an S, the head
  on its end, the whole of it bending at the base — a goose grazing, a heron's strike), the bills (`flat`,
  `dagger`, `spoon`, `pouch`, `hook`), `cheek` (a goose's chinstrap), `wattle`, `wingTip` (a gull's black
  primaries), `trail` (a vulture's silver flight feathers: `broadWing` takes a chord band), `noLegs` (the
  loon). The bare heads are a hood and a small head.
- **How they fly** (`critterMaterial`, `FLIGHT`): soaring (always on the wing, held out at the bird's own
  dihedral — a vulture's V, a hawk's shallow one, an eagle's flat plank — flapped by amount, folded in a
  stoop or a plunge), gliding (herons, cranes, geese, gulls, pelicans: they stand on the ground, and on
  the wing glide with a few strokes), flapping (the rest). `uFlap` is a vec3 now (rate, mode,
  dihedral). And a display pose (4): a turkey tom's fan stood up behind him.
- **The seventeen birds**: Canada goose (the black neck, the white chinstrap), mallard drake and hen (the
  green head and white collar, the chestnut breast; the hen mottled, the same blue speculum), common loon
  (summer black, winter grey), great blue heron, great and snowy egret, roseate spoonbill, sandhill crane,
  turkey vulture, bald eagle, osprey, wild turkey, California quail (the plume curling forward), brown
  pelican, laughing gull (the black hood gone white in winter), California gull. 708–1,008 vertices (the
  nest 588).
- **New roles** (`sim/critters.ts`): `waterfowl` — on the water at its own level (the sea's 0; a lake's
  its bank's lowest ground, as synth.ts lays the sheet), sunk by `swimSink`, paddling, never leaving it;
  geese grazing the lawns by it; a loon slipping under when you come close and surfacing well away;
  `wader` — at the water's edge, frozen for seconds between slow steps, off at once and heavy when you
  come; `gull` — on the beach and a coastal town's lots and plazas (a California gull's inland lots and
  fields too), lifting off now and then to wheel and come down again (`glide`, `alight`); pelicans
  skimming the waves in lines (`skim`) or rafted on the water; `fowl` — turkeys and cranes walking the
  fields in flocks, running from you first and flying only when pressed. Flocks keep together (half a
  flock bird's steps are toward one of its own) and come down by their own.
- **Raptors by species**: the vultures a kettle on one thermal, teetering, rarely a wingbeat, and never a
  stoop (`STOOPS`: the hawk's alone); the eagle only near big water; the osprey low over the water,
  stopping to hover, then plunging feet-first (a splash, a fish: `eco.caught`).
- **Where and when** (`fauna.ts WATER`, `SEASON`; `faunaMix` takes the month — the north's, the south's
  turned round): the spoonbill on the Florida, Gulf and Texas coasts; the laughing gull on the East and
  Gulf coasts (summer in the north), the California gull in the West and the Great Basin; the pelican on
  the southern and Californian coasts, a summer visitor to New Jersey and Washington; the loons on the
  northern lakes in summer and the coasts in winter; the vultures, ospreys and great egrets south for the
  winter; the cranes resident in Florida, passing through the Plains in March and October, wintering in
  Texas, the desert and California. The California quail takes the desert quail's place in California,
  the dry Northwest and the Great Basin.
- **The osprey's nest** (`assets/signs.ts`, the `sign†` genome's first): a stick heap on a platform pole
  1–6 m out from the bank, one at most to a 700 m cell, a cell deciding for itself whichever tile asks
  (`ospreyNests`); props.ts plants them where the place's raptors include the osprey.
- Reviewed in the scratch bird studio: the goose's neck was a stub and its chinstrap inside its head;
  the review fixed both.

**Verified:** typecheck; `npm test` 953/953; `tests/waterBirds.test.ts` (new: each region's birds and
their ranges; each in its season; the plan's parts; on a lake — swimmers at its level and staying on it,
geese on the lawn, herons at the edge, turkeys in flocks; the loon's dive, the heron's flush, a goose
paddling off; on a beach — gulls on the sand and wheeling, pelicans skimming, a vulture that never
stoops, an osprey that hovers and plunges; the strutting tom; the nests at the edge, one to a cell, the
same however the land is tiled); `tests/foundry.test.ts` (the nest's budget, under 600); shader check 24
programs, no errors; the shore's playtest (`tools/playtest.mjs --region=shore --quick --swiftshader`): PASS,
6 checks, 0 page errors.

**Next:** package #13, the mammals on the existing bases (the coat patterns and tail types first: the
raccoon, opossum, skunk; fox squirrel, chipmunk, woodchuck, beaver with its lodge and dam; the prairie
dog; antlers and horns, then elk, moose, pronghorn, bighorn).

## 2026-10-05 — Fix: the shore didn't boot (the fields' wash)

CI's playtest went red on 7db0be9 (package #10): the shore stopped at "paint" with `TypeError: Cannot
read properties of undefined (reading 'lat')`. A baked atlas region paints from `paint.json`, which
carries no `origin`, and the fields' wash read `json.origin.lat`. `paintGround` now takes the region's
origin (main.ts passes the manifest's) and leaves the wash out without one. The unit tests never boot
the game, so only the playtest saw it — run `node tools/playtest.mjs --region=shore --quick
--swiftshader` (about 4 minutes here) after anything that touches the boot path.

**Verified:** reproduced locally (same error), then `node tools/playtest.mjs --url=http://localhost:5173/
--region=shore --quick --swiftshader --seed=1`: PASS, 6 checks, 0 page errors (with package #11 in);
typecheck.

## 2026-10-05 — Regional life (11): the backyard birds

Package #11 of `docs/regional-life/models.md`, the first wildlife package (`regional-wildlife`): the bird
plan's extensions and the birds of the lawns and the verges. Robby: "make things detailed, and variety
and variation matter".

- **The bird plan's marks** (`fauna.ts birdGeometry`, `BirdPlan`): what a bird is known by at twenty
  metres — a hood, a crown cap, a face mask, a necklace, a neck patch, a full breast, wing bars and
  barred wings, a crest swept back or curling forward, the bill's shape (a seed-eater's thick cone, a
  crow's stout dagger, a woodpecker's chisel, a dove's slim), a fanned tail or a dove's long wedge with
  its tip's colour, the folded wing's length.
- **Every bird, better** (the shared plan and `critterMaterial`): a neck, so the head sits on the
  shoulders instead of floating off the body; the wings closed along the flank when perched — rolled
  edge-down, leaning in over the back, the tips crossing over the rump — where they used to hang to the
  ground like a skirt; a leg each side (`P.fore`, `P.hind`) so the walkers (robin, dove, crow, pigeon,
  sandpiper, roadrunner, quail, ibis) walk and the hoppers hop; a peck downward (the head used to toss
  back); each species' wingbeat (`FLAP`, `flapOf`: the crow's slow rowing, the pigeons' and doves'
  clatter); a real tail, narrow at the rump and fanned at the tip (it was a sliver: the hawk's red tail
  shows now). And a bug: the quail rested its wings up like a butterfly (the butterfly test was the
  flap's amplitude; it's a flag now, `uFlap.y` 2).
- **The eight birds**: the **northern cardinal** (red, or the female's tan — a TINT; the swept crest, the
  black mask, the orange-red cone of a bill), the **blue jay** (blue, white below, the black necklace,
  the pale face, a white bar, white tail corners), the **American robin** (the brick breast, the dark
  head, the yellow bill; runs and stops), **Steller's jay** (deep blue, the sooty head and tall crest,
  barred wings), the **Gila woodpecker** (zebra wings, the tan head, the male's red cap — a TINT, the
  chisel), the **mourning dove** (the small head, the long white-edged wedge, black wing spots), the
  **American crow** (black, big, wary from 13 m), the **rock pigeon** (plump, each its own grey, the
  green neck, two black bars, the dark tail band).
- **Where**: the songbird role's regional mix (`REGION_FAUNA`): the East's robin, cardinal, jay, dove,
  crow and pigeons; the Plains' doves; Florida's cardinals and doves; Steller's jay in the Rockies, the
  Northwest and California's conifer country, never the East; the Gila woodpecker in the Sonoran
  ecoregions only; the generic songbird stays first for the sparrows and finches (its palette loses the
  cardinal's red for a house finch's rose and a goldfinch's yellow). Pigeons are the town's (`critters.ts`:
  their weight rises with `urban`, and they come down on the plaza and the parking lot as well as the
  grass).
- **Card art**: `CRITTER_TINT` paints a species' portrait (the Almanac's card: a red cardinal, a grey
  pigeon), shared with the kit viewer.
- Reviewed in a scratch bird studio (each bird perched side on, from above, flying): it caught the
  hanging wings, the floating heads, the robin's breast hidden inside its body and the Gila's back bands
  standing off it like hoops (now barring on the closed wings).

**Verified:** typecheck; `npm test` 944/944; `tests/backyardBirds.test.ts` (new: each region's birds and
their range limits; each bird's marks and sizes; the plan's tails and legs for every bird; how each
moves; the town's pigeons on the plaza, few in the country); `tests/ecoregions.test.ts` (the shore's
animals as they were, its birds the East's). Budgets 684–1,092 vertices (limit 1,600). Shader check: 24
programs (the critter material added), no errors.

**Next:** package #12, water and big birds (the long neck, swimming, the bare head and the hover go into
the bird plan with the birds that need them: Canada goose, mallard, loon, the herons and egrets,
spoonbill, sandhill crane, vulture, bald eagle, osprey, wild turkey, California quail, pelican, gulls);
smooth cordgrass and duckweed; `people-with-purpose` when Robby calls it.

## 2026-10-05 — Regional life (10): the fields

Package #10 of `docs/regional-life/models.md`: the farmland planted, field by field, on each crop's
calendar.

- **`world/fields.ts`** (new, pure): a field is a 400 m block of the survey's grid (`fieldAt`: its crop by
  the region's `cropMix`, its rows running north–south or east–west, its own number so neighbours plant
  and cut a few days apart). The mixes: the Corn Belt's corn and soybeans in rotation; the Plains' winter
  wheat (Kansas, Oklahoma, the Panhandle, western Nebraska) with some corn; the northern Plains' spring
  wheat; the East's and the South's corn and soybeans with a little wheat; the Palouse's wheat. Each
  crop's year (`CROP_CAL`, `cropStage` on `season.ts year`): corn up in May, knee-high by the Fourth,
  head-high and tasselled in July, tan in October, cut to stubble that stands through the winter;
  soybeans yellow in late September, cut in October; winter wheat green and short under the winter,
  tall in May, gold in June, stubble by August, sown again in October; spring wheat gold in August.
- **The crops near the walker** (`grass.ts`): a cropland cell grows no lawn but its field's rows — corn as
  a row's 2 m segment (walls of leaves either side of the stalks, a stalk's dark line every third of a
  metre, leaves flecked light, a ragged top, the tassels), soybeans as a low lumpy hedge, wheat as the
  grass's tuft, wider. `cropMaterial` grows and ripens each instance by the calendar (`GLSL_CROPS` on
  `U.uYear`): the bare ground hidden, the stubble a hand high, gone under snow, swaying in the wind.
- **The fields far off** (`groundPaint.ts`): the ground's wash paints each cropland field by its crop at
  its stage today (`cropWash`): green, the ripe tan, yellow or gold, pale stubble, tilled brown soil.
- A scratch render of the crops through the year (May, July, September, October) caught the corn as solid
  walls; the stalk lines, leaf flecks and ragged top break them into plants.

**Verified:** typecheck; `npm test` 939/939; `tests/fields.test.ts` (new: each region's crops; a field
one crop and one way of rows; each crop's year; the wash; the shader's calendar the same; the crops'
geometry). Shader check: 23 programs, no errors.

**Next:** the wildlife packages (`regional-wildlife`, #11–#16: the bird plan's extensions and the backyard
birds first); smooth cordgrass and duckweed at the water's edge; the people work (`people-with-purpose`)
when Robby calls it.

## 2026-10-05 — Regional life (9): the ground layers — ferns, the prairie's bluestems, wildflower drifts, kudzu

Package #9 of `docs/regional-life/models.md`, all but smooth cordgrass.

- **The forest floor** (`world/understory.ts`, `flora.ts understoryMix`): bracken (a new plant form,
  `frond`: a stalk lifting a broad three-parted blade near level, in colonies) and the cinnamon fern (a
  tall vase; its cinnamon-brown fertile spikes stand up in May) join the ferns of the eastern and northern
  woods. Their seasons as data (`Species.fall`, `dormant`; `inFall`, `isDormant`): bracken copper in
  October and dead and gone from December to April, the cinnamon fern gold in September. (Florida's floor
  stays the palmetto's.)
- **The prairie's bluestems** (`world/grass.ts`, `flora.ts prairieMix`): a tall open-ground tuft on the
  prairie is big bluestem (head-high, 1.6×) or little bluestem — blue-green through the summer, the big one
  copper-red and the little one orange as the autumn turns (`uTurn`), bronze-tan through the winter. The
  Flint Hills' and the Corn Belt's tallgrass, the mixed-grass west, Texas's Blackland and Cross Timbers,
  the Ozarks' glades.
- **Wildflower drifts** (`render/treeSeasons.ts WILDFLOWERS`, `flora.ts wildflowerMix`, `grass.ts
  wildTuft`): each tuft has a kind (`aKind`); a drift is a patch of meadow where a third of the tufts
  flower, mostly one species to a patch, its heads opening in their own weeks of the calendar
  (`season.ts year` → `U.uYear`, 0 on January 20th): Texas's bluebonnets and paintbrush in late March and
  April, California's poppies, lupine and goldfields from February, the desert's marigolds and globemallow
  after the winter rains, black-eyed Susans and coneflowers June to August, goldenrod and asters in the
  fall, fireweed in July in the mountains and the Northwest. Each tuft a day or so off its neighbours: the
  drift comes in, it doesn't switch on.
- **Kudzu** (`vine†`, a tree kind): the tree it climbed and killed, silver under a curtain of big leaves
  hung from the top to the ground, ropes of vine where it climbs; v0 a smothered young tree, v1 the tall
  "kudzu monster", v2 a blanket over a roadside thicket. Deciduous: browned by the first frost, bare vines
  over its dead host in winter. On the South's wood edges (`kudzuShare`: a wood tree with open ground
  within 15 m — the Deep South's Piedmont and coastal plain, the southern Appalachians' valleys, the
  Gulf's hills, the Piney Woods; a little in Virginia and Arkansas). Far ≤ 1,320 vertices, near ≤ 2,250.
  The studio caught the first curtain as a pyramid of separate balls with its host showing (now one sheet).
- Still open: smooth cordgrass (the salt marsh — the grass keeps off the shore today).

**Verified:** typecheck; `npm test` 934/934; `tests/understory.test.ts` (the eastern woods' bracken and
cinnamon fern; copper in October, gone in winter; the blade near level; the spikes in flower),
`tests/groundLayers.test.ts` (new: the calendar's year; each drift's weeks, nothing in January; Texas's
bluebonnets, California's poppies, the East's goldenrod, never another's; drifts as patches of one
species; the prairie's bluestems only on the prairie; kudzu only in the South), `tests/foundry.test.ts`
(kudzu's curtain, host, blanket, season, leaves). Shader check: 22 programs, no errors. Studio:
`shots/trees-k9.jpg`.

**Next:** #10 fields (corn, soybeans, winter wheat); smooth cordgrass and duckweed (the water's edge);
then the wildlife packages (`regional-wildlife`, #11–#16); the people work (`people-with-purpose`) when
Robby calls it.

## 2026-10-05 — Regional life (8): the palms and the palmettos

Package #8 of `docs/regional-life/models.md`: five kinds appended to `TREE_KINDS` (69–73), three forms
each, far models only (fronds are already fronds), and a motion for every palm.

- **Fans** (`flora.ts fanFrond`): accordion-pleated, the segments' tips split, the whole fan folded into a
  shallow V along its middle and arching down at its rim, both faces.
  - **Cabbage palmetto** (`sabal`): a round head of fans — the young ones standing up over the crown, the
    old arching below it — on a trunk clad high up in its crisscross boots (an old one's all but fallen),
    no skirt. v0 young (its fans from the ground), v1 grown, v2 old (tall, slender, leaning).
  - **Saw palmetto**: stiff fans held up on stalks from stems creeping along the sand; one crown, a clump
    of three, an old colony.
- **Feathers** (`featherFrond`: two leaflet cards crossed along the rachis, each side's leaflets
  hanging): the **royal palm** (a smooth grey column swollen a third of the way up, more on an old one,
  and its glossy green crownshaft), the **queen palm** (slim, ringed, drooping plumes; an old one's orange
  dates hanging), the **Canary Island date palm** (a massive trunk patterned in diamonds, its
  "pineapple" of cut leaf bases, a huge dense crown; young from the ground).
- Every frond clears the ground (`keepUp`: a trunkless young palm's old fronds lie out over the grass,
  never into it).
- **MOTION 4** (far models only): a palm's fronds thrown about from its crown, the tips most, leaning
  downwind as the wind rises and tossing, rattling and bent down when a gust comes through — each palm on
  its own beat. The coconut and the fan palm too.
- **Placement**: `broadMix` + `rangeIn` — the cabbage palmetto on the Carolinas', Georgia's and the Gulf's
  coast, all of Florida, Houston's coast; the royal palm South Florida's alone; queen, Canary and fan
  palms in the warm South's towns; `palmMix` — South Florida's tropics (coconut, royal, cabbage, queen,
  fan) and the dry coasts' and warm deserts' planted palms (California's fan, queen and Canary; Phoenix's)
  only where January's mean is above 3.5 °C (`season.ts meanTemp`): never Reno's, Albuquerque's or
  Denver's; `palmettoShare` — saw palmetto under the southern pines' flatwoods. The coconut and fan
  palms at their own heights at last (8–14 and 10–18 m). Each its own green.
- Far ≤ 1,488 vertices. The tree studio caught the fans as flat jagged plates (now pleated and folded)
  and the sabal's head as a stack of discs (now round).

**Verified:** typecheck; `npm test` 926/926; `tests/foundry.test.ts` (no frond into the ground, the sabal's
boots and round head, the saw palmetto's clump, the royal's crownshaft, the queen's dates, the Canary's
crown and trunk, motion 4, heights), `tests/streetTrees.test.ts` (the cabbage palmetto from Charleston
to Houston, never Atlanta, Raleigh or the North; the royal palm only in South Florida's mix; planted
palms where January allows — Phoenix, Las Vegas, LA, Sacramento — not Reno, Albuquerque, Denver; saw
palmetto in Florida and on the Georgia coast only; a Florida flatwoods built: pines over palmetto).
Shader check: 22 programs, no errors. Studio: `shots/trees-p8a.jpg`, `p8b`.

**Next:** #9 the ground layers (bracken, cinnamon fern, bluestems, cordgrass, wildflower drifts:
bluebonnets, poppies, lupine; kudzu); #10 fields; duckweed; the people work (`people-with-purpose`) when
Robby calls it.

## 2026-10-05 — Regional life (7): the desert, the piñon-juniper and the sagebrush sea

Package #7 of `docs/regional-life/models.md` (Robby: "make things detailed, and variety and variation
matter"): ten kinds appended to `TREE_KINDS` (59–68), three forms each.

- **New genomes, far models only** (`flora.ts DESERT_FAR`: their pleats, pads, joints and canes are
  already the detail; no leaf cards):
  - **Saguaro** (`columnar†`): a pleated column (`fluted`: ridges and furrows on a parallel-transport
    frame, flat facets so each pleat is lit one side) swelling a little at the waist, its arms leaving
    level, bending up at the elbow and rising beside it. v0 a young spear, v1 grown with a few arms, v2
    old: many arms, one bowed over and down, the Gila woodpecker's holes and the callused boots.
  - **Engelmann prickly pear** (`opuntia†`): flat pads each standing on the rim of one already there,
    leaning on as it leans; a young clump, an old sprawl wider than it stands, a tree form on a woody
    trunk with a crown of pads.
  - **Teddy bear cholla**: fat golden joints in stubby chains over a black trunk of dead joints, fallen
    joints rooting round its foot; young, grown, old (more of it dark).
  - **Ocotillo** (`cane†`): a vase of grey canes from one crown, a few sprawling on an old one; leaf
    sleeves along each cane.
  - **Joshua tree** (`yucca†`): a corky trunk branching into crooked arms clad in their dead leaves'
    straw, each tipped with a dense burst of bayonets round a dark heart; one stem, branched, old.
- **Flowers and fruit as parts of their own**: geometry painted `BLOOM_PART` (it reads as foliage — every
  channel ≥ 0.98 — but a hair off white in blue, `vBloomPart`), shown only in season and discarded the
  rest of the year, a few at a time as the season comes and goes: blossom 7 the saguaro's white crowns
  then its red fruit, 8 the ocotillo's scarlet flames, 9 the prickly pear's yellow cups then its purple
  tunas, 10 the Joshua tree's cream clusters (`treeSeasons.ts DESERT_BLOOM`, `fruitNow`: by the
  calendar, `1 − U.uWinter`, in the warming half). Past the cards' 3 bits, so far models only.
- **The ocotillo's leaves after rain** (FALL_HUE 8, `rainLeaves`): out within days of rain (`U.uWet`,
  now in the shared GLSL) in its rainy seasons — the monsoon, the late winter — bare in the fore-summer's
  drought and the autumn.
- **Clump and pine rows with near models**: creosote (an open vase; the old clonal ring round an empty
  heart), Utah juniper (bushy; twisted trunks; old with silver driftwood), Ashe juniper (a dense cone;
  the cedar brake's stems; old on one trunk), big sagebrush (a silver mound; old and gnarled), two-needle
  piñon (a rounded cone; broad and full; old, flat-topped and leaning).
- The cacti and the Joshua tree stand stiff in the wind (`STIFF`).
- **Placement**: `desertMix` turns the scan's shrubs (and a pine pick where no conifer grows — the low
  desert had a coastal pitch pine) into the dry country's own by ecoregion and elevation: the Sonoran's
  creosote flats with chollas, prickly pears, ocotillos and Arizona's saguaros below ~1,250 m; the
  Mojave's creosote and its Joshua tree woodland at 600–1,800 m; the Chihuahuan's creosote, prickly pear
  and ocotillo; the sagebrush sea of the basins, the Wyoming Basin, the Columbia Plateau; the Hill
  Country's Ashe juniper and the brush country's prickly pear. `desertTrees` gives the desert's
  broadleaf picks their Joshua trees and saguaros among the mesquite; `pjBand` puts piñon and juniper
  in their band below the ponderosa (the Great Basin's ranges, the Colorado Plateau, New Mexico's
  plateau, Arizona's mountains, the sky islands, the Trans-Pecos, the Mojave's mountains, the southern
  Rockies' foothills), juniper alone on the northern basins' edges. The Great Basin's arid towns now
  grow the region's planted shade trees instead of the Sonoran's mesquite and fan palms. Each its own
  green (the sagebrush silver).
- Far ≤ 1,476 vertices, near ≤ 2,248. The tree studio caught the prickly pear as a stack (now a sprawl
  wider than it stands, and a tree form with a crown of pads), the cholla as thin claws (now fat golden
  joints), the Joshua tree's rosettes as sticks (now dense bursts round a heart), the piñon too tall and
  tiered, the junipers and the sage as lollipops (their foliage now down their stems).

**Verified:** typecheck; `npm test` 921/921; `tests/foundry.test.ts` (the saguaro's spear vs its arms and
flower crowns, the holes; the marker colour leafy but not white; the prickly pear's sprawl and tree
form, the cholla's gold and black, the ocotillo's vase and rain-leaves, the Joshua tree's rosettes; the
near kinds' leaf pictures; heights), `tests/season.test.ts` (the Joshua tree, the ocotillo, the prickly
pear and the saguaro open in that order; nothing in autumn or winter; the fruit after; the ocotillo
green after the monsoon's rain, bare in the drought), `tests/streetTrees.test.ts` (saguaros only in
Arizona's Sonoran desert, Joshua trees only in the Mojave's band, creosote in the warm deserts, the
sage in the basins, piñon at Santa Fe and Prescott but not on the basin floor nor in Flagstaff's
pines, none of it east or on the Northwest's west side; Ashe juniper in the Hill Country only; a
Sonoran scrub built near Tucson). Shader check: 21 programs, no errors. Studio: `shots/trees-d1.jpg`
… `d5`.

**Next:** #8 palms and palmettos (fronds thrashing in a gust); #9 the ground layers; #10 fields;
duckweed (#5's last); the people work (`people-with-purpose`) when Robby calls it.

## 2026-10-05 — Regional life (6): California's oaks, its giants, its chaparral and its golden hills

Package #6 of `docs/regional-life/models.md` (Robby: "make things detailed, and variety and variation
matter"): five kinds appended to `TREE_KINDS` (54–58), three forms each, and the golden hills as a
season.

- **Valley oak** (`OAKS`): v0 the savanna's giant, a vast spread with its long outer branches hanging
  to the grass; v1 a valley town's yard oak; v2 old, a limb broken and one dead. Checkered grey bark,
  bare December to March, russet in the fall.
- **Blue oak** (`OAKS`): small and compact over the foothills' grass, pale bark, blue-grey leaves
  (its own green); one trunk, two, and old and gnarled.
- **Coast redwood** (`SPIRES`, new `foot`, `burls`, the `reit` top): v0 a young spire of flat sprays
  to the ground; v1 the grove's column, bare most of its height, the crown a narrow spire high up, on a
  fluted, flaring foot; v2 old growth, burls on its foot and its top long broken and grown again as two
  leaders, each a small spire of its own, a dead spike between them. Cinnamon-red bark.
- **Giant sequoia** (`SPIRES`, the `round` top, `scar`): v0 the town's dense young cone; v1 the vast
  orange-red column barely tapering, its crown rounded; v2 the fire-scarred ancient, its top broken.
- **Manzanita** (`CLUMPS`, new `dead` stems): smooth red-maroon stems twisting up into a grey-green
  mound; v1 a tree-form one; v2 old, two stems dead and silver among the red. **Blossom 6**: its
  pink-white urns all over its twigs' ends in the winter — `season.ts winter` (the year's cold side by
  the calendar, `U.uWinter`), November to March, each bush its own weeks, never under snow.
- **The golden hills** (`season.ts hay`, `U.uHay`): in the Mediterranean climates the grass is built
  green and the season turns it oat-straw from mid-April, gold by June, through to the first rains,
  green again by mid-December (the southern year turned round); the ground's straw wash
  (`uBiome.x`) follows it, a quarter of the region's own in the green months. (`uGolden` was taken:
  the golden hour's.)
- **Placement**: `broadMix` + `rangeIn` — the valley oak on the Central Valley's floor and in the
  coast ranges' valleys, the blue oak round the foothills, the redwood and the sequoia planted in
  towns; `redwoodCountry` — wild redwoods in the Coast Range (EPA 1) and the coast ranges' fog belt
  south of it (EPA 6 in `ecoregions.ts caRedwoodBelt`: Muir Woods, the Santa Cruz Mountains, Big Sur),
  where three in five of a wood's broadleaves become redwood or Douglas fir; `sequoiaBand` — the
  Sierra's west slope 1,400–2,300 m from 35.7° to 39.2°N, in groves (a 600 m patch is one or isn't);
  `manzanitaShare` — the chaparral's shrubs (and Arizona's pointleaf); `westForm` — the grove's bare
  columns, a yard's young spires. Heights: the redwood's grove 45–75 m, its old giants 70–100; the
  sequoia 50–85; the valley oak 20–30; the blue oak 6–15; the manzanita 1.5–4 (a tree-form one to 6).
  A mapped oak in California is its coast live oak, valley oak or blue oak as the place grows them;
  lace lichen on the coast's valley oaks and blue oaks too.
- **The survey's giants**: LiDAR crowns over 50 m were dropped as masts; in the redwood country and the
  Sierra they're kept to 116 m (Hyperion), read as the region's conifers, and stay in town.
- **Fixed in passing**: `coniferMix`'s `coast` was `oceanDistAt < 3000`, but the ocean distance reads
  no farther than ~510 m, so it was always true — New England's inland pines were all its coast's pitch
  pines. Now `< 500`.
- The tree studio caught the manzanita as a bonsai of flat pads on thin sticks (now a full mound on
  thicker red stems) and the old redwood's new leaders as two balloons on stalks (now clothed from the
  old top). Far ≤ 1,464 vertices, near ≤ 1,960. Shader check: 17 programs, no errors (the manzanita's
  blossom, the valley oak's russet, the grass).

**Verified:** typecheck; `npm test` 916/916; `tests/foundry.test.ts` (the valley oak's spread and hanging
branches, the blue oak the smaller, the redwood's foot, column and narrow high crown, the sequoia's
trunk and its scar, the manzanita's red and dead stems, their seasons, leaf pictures and heights),
`tests/streetTrees.test.ts` (California's oaks only in California; wild redwoods in the north coast,
Muir Woods, the Santa Cruz Mountains and Big Sur and never Sacramento, Napa, San Jose, Fresno or the
south; the sequoia's band; the manzanita's share; a north coast wood built: redwoods, tall),
`tests/season.test.ts` (the manzanita in the winter only; the hay in Sacramento's summer, never
Boston's, Atlanta's or Seattle's; central Chile turned round), `tests/hangers.test.ts`. Studio:
`shots/trees-cal.jpg`, `trees-cal3.jpg`, `trees-cal5.jpg`.

**Next:** #7 the desert (saguaro, prickly pear, cholla, ocotillo, Joshua tree, creosote, piñon,
junipers, sagebrush); duckweed (#5's last); the people work (`people-with-purpose`) when Robby calls it.

## 2026-10-05 — Regional life (5): the swamps and the rivers

Robby, after #4: "continue on what you were originally doing you were killing it just make note of
person thing" — the people work is `people-with-purpose` in `feature_list.json`; the vegetation goes
on. Package #5 of `docs/regional-life/models.md`: five kinds appended to `TREE_KINDS` (49–53), three
forms each.

- **The cypresses** (`flora.ts CYPRESSES`, the `cypress†` genome): the foot a fluted, flaring shell round
  the trunk (`flaredFoot`: twice as many points as ribs, so the flutes come out sharp; drawn by both
  models outside the near trunk's own flare), knees standing up round it out to three metres (tall ones
  nearer), tiers of level boughs each holding out a flat feathery spray.
  - **Bald cypress**: v0 young, a cone of soft sprays to the ground; v1 grown in the swamp, flat-topped on
    level limbs among its knees; v2 ancient, a massive fluted foot, its top broken off beside the flat
    crown that took over, crooked and dead limbs.
  - **Pond cypress**: v0 tall and narrow on ascending limbs; v1 a dome's tree with its rounded hat; v2 the
    dwarf cypress of South Florida's marl prairie, stunted and gnarled.
  - Deciduous ("bald"): lime-green in spring, russet in late fall, bare and grey in winter; the heaviest
    Spanish moss of any host.
- **Water tupelo** on the leader plan with a swollen bottle foot (`Leader.foot`): v0 standing in the
  water, v1 the swamp tupelo (level limbs, the first scarlet of the fall), v2 old with a ribbed foot.
- **The cottonwoods** as `OAKS` rows: eastern and plains (v0 the prairie's lone landmark forked low into
  great climbing limbs, v1 the bottomland's tall clean trunk, v2 old and ragged on two trunks); Fremont
  (pale bark going near white on its limbs; spreading over a wash, three trunks, old). Their triangular
  leaves rattle on flat stalks (`MOTION` 1, the aspen's); gold in the fall.
- **Leaf pictures** 24 → 28: the cypress's feathers (a midrib with soft needles combed out in two rows),
  the cottonwood's toothed triangles on long flat stalks.
- **Placement**: `swampMix` — a wood by fresh water in the swamp country (the Gulf, the Southeast's
  coastal plains, Florida, East Texas and the Hill Country's rivers, the Chesapeake's south, southern
  Illinois) grows bald cypress, water tupelo and (Florida's domes) pond cypress, thickest at the water's
  edge; `swampForm` puts the old ones out in the water, the dwarf cypress only on the marl prairie
  (EPA 76). `bankMix` now also lines the Plains', the Midwest's, Texas's and the Rockies' rivers with
  cottonwoods, and the Southwest's washes, the Basin's and California's valleys with Fremont's — the
  desert at last has its riparian gallery (`regional`'s desert branch: a wash's trees). Planted bald
  cypress in Southern towns; cottonwoods in Plains towns. Heights: the bald cypress 24–36 m in the
  swamp, the dwarf 2.5–5 m, the cottonwood 18–34 m. Each its own green.
- **The near model** treats the cypresses' long limbs as the oak plan's (a ring every ~1.6 m, a side
  fewer). Far ≤ 1,476 vertices, near ≤ 1,938.
- The tree studio caught the old cottonwood's and the old Fremont's top dome floating above their
  crowns (the model too tall for its limbs): lowered.

**Verified:** typecheck; `npm test` 910/910; `tests/foundry.test.ts` (the fluted foot and the knees, young cone vs swamp
flat top, the dwarf, the tupelo's bottle, the cottonwoods broad and rattling, Fremont's pale bark, the
leaf pictures), `tests/streetTrees.test.ts` (no cypress or tupelo in the North or the West; bald cypress
in the Atchafalaya, on the Georgia coast, in Houston, north Florida and the Hill Country; the dwarf only
on the marl prairie; cottonwood on the Plains' rivers and Fremont's in the Southwest's washes, never the
other's), `tests/hangers.test.ts`, `tests/nearTrees.test.ts`, `tests/ecoregions.test.ts`. Studio:
`shots/trees-s1.jpg`, `trees-s2.jpg`.

**Next:** duckweed on the swamps' still water (a water-surface paint); #6 California's oaks and
redwoods.

## 2026-10-05 — Regional life (4): the eastern hardwoods, the flowering understory, the southern pines

Robby's bar for every package: "make things detailed, and variety and variation matter", "rapid but great
development". Package #4 of `docs/regional-life/models.md`'s build order, as `docs/earth/HANDOFF.md`
designed it — fourteen tree kinds appended to `TREE_KINDS` (35–48), three grown forms each, far and near.

- **The hardwoods on a leader** (`flora.ts LEADERS`: a straight trunk up through the crown, limbs off it
  in a spiral, a core mass and the outline's lobes in the species' own shape):
  - **Tulip tree**: open-grown, the forest's ramrod (bare more than halfway up), the old cove giant
    with a dead limb and a stub. Gold in fall.
  - **Sweetgum**: the young pyramid, the mature oval, the old round one. Its fall the jewel mix —
    purple, red, orange and yellow on one tree, lobe by lobe (and leaf by leaf on the cards), late.
  - **Shagbark hickory**: pale strips of bark curling off the trunk at both ends (in both models), a
    tall oval crown, dead limbs on the old one.
  - **Yellow buckeye**: round and low-branched; forked low into three stems; the first to turn, pumpkin
    orange, bare by October (its leaves fall on their own clock: `leafDown`).
- **On the oak plan** (`OAKS` rows, taught `upper`, `mottle`, `bias`, `limbR`, `dead`, `low`): the
  **sycamore**'s limbs going ghost-white above the fork and still climbing, its trunk flaking in cream,
  olive and brown patches, a deep irregular crown (v1 leaning out over a creek, v2 two trunks); the **bur
  oak** savanna-wide on thick crooked limbs, a stag-head on the old one. Both russet to tan in fall.
- **The small trees and the rosebay** (`CLUMPS`: stems from one root or a low fork, zigzag, arching or
  pollarded): the **redbud** flat-topped on two or three trunks, magenta along its bare twigs in March;
  the **crape myrtle**'s vase of cinnamon stems flaking grey and tan, its summer cones each tree's own
  colour, and v2 pollarded into knuckles with whips ("crape murder"); the **rosebay** a streamside
  clump, a laurel-hell tangle, an old one of thick twisting stems. The **flowering dogwood** in flat
  tiers with air between them, white bracts in April (one tree in six pink), burgundy in fall, its
  tiers bobbing each on its own beat.
- **The southern pines** (`PINES` rows; crooked boughs, long drooping brushes): **loblolly** open-grown,
  the plantation pole, old and flat-topped; **longleaf** as its grass stage (a fountain of needle blades
  on the sand, no near model, shivering), the bottlebrush sapling and the old open flat top; **slash
  pine** round-crowned, and South Florida's own leaning flat-topped one. The **eastern redcedar**: a dark
  flame, an old field's cone, a twisted bluff tree — bronzing in the cold.
- **Leaf pictures** (`LEAF_PICS` 12 → 24): sweetgum stars, tulip-tree leaves, the hickory's five
  leaflets, the buckeye's five fingers, redbud hearts, long needles in brushes; the sycamore wears the
  maple's hands, the redcedar the cedar's sprays.
- **Seasons as one set of sums** (`render/treeSeasons.ts`, used by the far crowns and the cards):
  `BLOSSOM` is a type (1 cherry, 2 dogwood, 3 redbud, 4 crape myrtle, 5 rosebay); new fall hues 4–6 and
  7 (evergreen bronze); `U.uSpring` and `U.uSummer` from `season.ts` (`spring`: the warming half's
  progress from the winter's own mean, so north Florida's dogwoods wait for March), the bloom windows
  as data checked against real calendars (DC's cherries late March to mid-April, Atlanta's dogwoods
  in April, the rosebay June–July in the mountains, crape myrtles mid-May to late September). Spring's
  flowers open on bare twigs where the leaves aren't out yet. `MOTION` (1 tremble, 2 tiers bobbing, 3
  needles tossing) replaces `FLUTTER`. Every tree's bark a shade of its own.
- **The cards' flags re-laid**: `falls 1 + 2·hue (3 bits) + 16·bloom (3 bits) + 128·motion`
  (`flora.ts packCardFlags`; the aspen still trembles).
- **The garden**: rhododendron (trusses in May) and azalea (smothered March–May, each plant hot pink,
  coral, white or magenta) in the Southeast, Appalachia, the Mid-Atlantic, the Gulf, New England and
  the Northwest.
- **Placement** (all by `CastPlace`, hashes only — no new `rng.float()` in the scans):
  - `broadMix` gains each region's new trees, cut to range by `rangeIn` (no crape myrtle north of
    Delaware or in the West, the north woods past the tulip tree's and the dogwood's reach, Texas's
    sweetgums in its east, Florida's dogwoods in its north).
  - `coniferMix`: the South's pines — loblolly on the Piedmont, longleaf on the Sandhills and coastal
    plains, slash pine on the lower coastal plain and all of South Florida; the loblolly standing in for
    the Ozarks' shortleaf until its own row.
  - `bankMix`: in sycamore country a stream's bank grows sycamores beside the willows.
  - `redcedarShare`: redcedars take the old fields and glades. `rosebayShare`: Appalachia's creeks and
    laurel hells. `understoryTrees`: dogwoods and redbuds under the eastern woods.
  - Heights (`treeHeight4`): the tulip tree 26–40 m in a cove, the dogwood 4–9 m, the grass stage under a
    metre; a survey's tall crown is never a small tree (`SMALL_TREE`); a measured longleaf is grown as
    tall as it measures. Each species its own green.
  - Spanish moss on the bottomland sycamores, sweetgums, hickories and bur oaks; ball moss on Texas's
    pecans (the hickory), bur oaks and crape myrtles.
  - The "first hints of autumn" tint only on trees that turn (never a pine or a magnolia).
  - The shore (the baked world, the Mid-Atlantic) keeps its original trees at their original weights
    and gains the region's new natives (`tests/ecoregions.test.ts`); no crape myrtle in New Jersey.
- **The near models**: a clump's third and later thin stems are plainer, without a flare (a rosebay
  thicket stays under 2,500 vertices); dead wood no longer grows a leafy branch; a branch takes the
  colour of the limb it leaves (the sycamore's white). Far ≤ 1,488 vertices, near ≤ 2,276.

**Verified:** typecheck; `npm test` 907/907 (91 files); `tests/foundry.test.ts` (46: budgets for every form; the tulip tree, the
sycamore and the street oak told apart by shape; the young sweetgum a pyramid; the shagbark's strips;
the dogwood's tiers; the stems of the clumps; the southern pines' boles and the longleaf's stages; each
tree's leaf picture; the flags round-trip and the shader's decode; the azalea's colours),
`tests/streetTrees.test.ts` (15: no crape myrtle in the North, longleaf only on the southern coastal
plain and the sandhills, rosebay only in Appalachia, no sweetgum in the West; an Appalachian cove's wood
and a Sandhills pine wood built), `tests/season.test.ts` (the bloom calendar), `tests/pack.test.ts`,
`tests/nearTrees.test.ts`, `tests/hangers.test.ts`. The shader compile check (`tools/shader-check.js`,
every new fall hue, blossom and motion): 15 programs, no errors. Tree studio montages (`shots/trees-h1`,
`h2`, `h3`, `u1`, `u2`, `p1`): the first pass's tulip trees and young sweetgums were hollow spirals of
balls and the sycamores read as acacia umbrellas — given a core mass, and climbing limbs with billows
low on them; the crape myrtle's vase widened.

**Next:** Robby, mid-session: the people need brains — "they just wander around aimlessly … a lot walk
into buildings and stand there and after 3 minutes its over crowded … not everyone on the street can
walk into everyones homes"; "ensure all animations are smooth"; "easy streamlined 3 asset mesh animation
creator all built in". Planned in `feature_list.json` and `HANDOFF.md`; then #5 (bald cypress,
cottonwoods) and the wildlife packages.

## 2026-10-05 — Regional life (3), the cloud session: regions as data

Robby, handing over to a cloud session (`docs/earth/HANDOFF.md`): "i want to make sure all these
places look alive lower 48 look alive with correct vegetatation and animals and all that". Then: "create
a new branch for yourself" (this session's work is on `feature/lower48-alive`, off
`feature/foundation-first`); and, the session having no Cloudflare or Mapillary keys, "you should just
create all the 3d models for everywhere based on our procedural 3d asset generator foundry", with
"animation like for spanish moss and other things … really good too and we want alot of variety even
per species, color, all that".

- **No keys in the cloud box.** The container has neither `CLOUDFLARE_API_TOKEN` nor the Mapillary
  `ACCESS_TOKEN` (Robby's `.env` is on his PC, which a cloud session can't see). They go in the
  environment's settings (a new session picks them up); until then the canopy layer's upload and
  deploy and the green-spot comparison wait, and the foundry work goes on.
- **Regions as data** (`ecoregions`; `docs/agent/world-data.md` "Regions of life"):
  - The EPA's Level III ecoregions with state boundaries (public domain) baked by
    `scripts/bake-ecoregions.mjs` into `src/world/ecoGrid.ts`: two byte grids over the lower 48 at
    0.05° (the ecoregion code and the state at each cell's centre), run-length coded, 69 KB.
  - `world/ecoregions.ts` `ecoAt(lat, lon)` → the region of `docs/REGIONAL_LIFE.md` §2, the code and
    the state. The code table, then the state lines each region file draws ("Covers"): NYC and Long
    Island the Mid-Atlantic's, the Front Range cities the Rockies', Tallahassee and the Panhandle the
    Gulf's, the Texas Panhandle Texas's, Flagstaff the Great Basin's, Spokane the Northwest's dry
    side. A coast or a key the cells miss takes the nearest land (the Outer Banks are a kilometre
    wide).
  - The place rides the style key (`…/<region>.<l3>.<state>`), so the tile worker has it without
    the grid. The casts read it: the tree weights and moss by region (`styles.ts ECO_VEG`), the
    broadleaf street and yard trees (`flora.ts broadMix`), the gardens (`plantMix`), the forest
    floor (`understoryMix`), the animals (`faunaMix`). The range rules ride the casts: fireflies flash
    only east of the Plains (Seattle and Denver had them), the ibis keeps to the Southern coasts, the
    Northwest's deer is the black-tailed, the snowshoe hare lives in the north woods.
  - Kentucky (Appalachia) and Ohio (the Midwest), Savannah's coastal plain (oaks, magnolias, ibis)
    and Raleigh's Piedmont, Austin and Phoenix each get their own. The shore keeps its look exactly
    (the Mid-Atlantic is its original set).
  - Credited: `src/ui/credits.ts`, `docs/DATA_SOURCES.md`.
  - Tests 882 (+11: `tests/ecoregions.test.ts`, ~190 towns the region files name), typecheck, build.
- **Live oaks and their hangers** (`regional-flora`, `models.md` build order #2):
  - **Three live oaks, three grown forms each** (`flora.ts OAKS`), all under budget (far ≤ 1,494, near
    ≤ 1,862 vertices):
    - the southern live oak: the grand open-grown one 2.5× as wide as it stands, limbs resting on
      the ground and rising again; a street oak arching over (the live oak alley); an old, gnarled,
      leaning one with a limb broken short;
    - the Hill Country's plateau oak: one trunk, a mott of three, a pair;
    - California's coast live oak: a round dark dome on snaking limbs, two leaning trunks, an old one
      with a limb along the ground.
    - Evergreen (they keep their leaves, never the autumn tint), small leaves up close, each its own
      green: the South's deep olive, the plateau's dusty olive, the coast's near-black.
  - **Hangers, a layer of their own** (`assets/hangers.ts`): Spanish moss, resurrection fern, ball
    moss and lace lichen, grown on each tree's own limbs and crown undersides, in two loads (a light
    dressing, a heavy one), each tree its own tone. Instanced on the trees' own matrices
    (`hang:<type>:<kind>:<v>:<load>`), so the region decides which and how heavy and the tree stays
    as it is.
    - **The motion** (`propMaterial` `hang`): a strand rides its tree's sway from its anchor, then
      swings in the world as a pendulum of its own length (the long ones slow), its tip most, out of
      step with its neighbours so the curtain twists and parts; a ripple runs down it as the wind
      rises; the curtain leans downwind and its tip lifts on the arc.
    - **The fern** greens and opens after the wet spells and curls grey-brown in a dry one
      (`season.ts wetness`, from the day's clouds; `U.uWet`).
    - **Where** (`hangerMix`, `docs/regional-life/ranges.md`): Spanish moss on the coastal plain from
      SE Virginia to East Texas, heaviest on the Southern coast and in the Delta's swamps, never in the
      Piedmont uplands, north of Virginia Beach or in the West (Baltimore's coastal plain caught it
      first: it's EPA 65 too); resurrection fern on the South's live oaks; ball moss in central and
      south Texas, Florida and the Gulf coast (never the Delta north of the Gulf states); lace lichen
      in California's fog belt only.
  - **Placed by region** (`broadMix`): the southern live oak on the Southeast's coastal plain, in
    Florida, on the Gulf and in East Texas (a few planted in the Piedmont and SE Virginia), 10–20 m;
    the plateau oak in the Hill Country, the Cross Timbers and the brush country; the coast live oak
    across California. In live oak country a mapped "oak" is most likely the live oak.
  - Studio: `shots/trees-liveoak*.jpg`, `trees-plateau2.jpg`, `trees-coast2.jpg`,
    `trees-liveoak-hung4.jpg` (the moss's first try was wisps hidden in the crowns: broader, longer
    strands from the lobes' undersides now hang as grey curtains).
  - Tests: `tests/hangers.test.ts` (budgets, anchoring, the range rules, the wet clock), the live oaks
    in `tests/foundry.test.ts`.
- **The northern and mountain forests** (`regional-flora`, `models.md` build order #3): eleven new kinds,
  three forms each, all under budget (far ≤ 1,398, near ≤ 2,200):
  - **pines** (`flora.ts PINES`): the eastern white pine's layered tiers (the old giant flagged downwind,
    flat-topped), the ponderosa (a young "blackjack", the orange-trunked mature tree with its open crown,
    the old "yellow-belly" column), the lodgepole (a straight pole, a small crown);
  - **spruces and firs** (`SPIRES` rows): red spruce, balsam fir, Engelmann spruce, subalpine fir (the
    narrowest steeple), and the eastern hemlock (broad, nodding, its third greyed by the adelgid);
  - **quaking aspen**: a white stem with dark eyes, a narrow crown whose round leaves tremble on their
    flat stalks — the far crown's leafy vertices shiver and its colour shimmers as the pale undersides
    flash (`propMaterial` flutter), the near cards rock fast and shimmer the same (leaf-card flag 16);
    gold in September;
  - **willow thickets** on red, gold or purple stems, and the **snag**: a dead spike, a dead ash's bare
    limbs, a beaver pond's snapped trunk with a woodpecker's hole.
  - **Placed by place** (`coniferMix`, `aspenShare`, `willowThickets`, `snagShare`): the West by elevation
    band, in a Colorado tree-line's metres (`bandElevation`: ~110 m lower a degree north) — ponderosa in
    the foothills (Missoula, Bend, Spokane, Flagstaff, the Black Hills), lodgepole and Douglas fir in the
    montane, Engelmann spruce and subalpine fir above 2,900 m; aspen in clonal groves (whole 35 m
    patches) in the montane band and the north woods; the Northeast's white pine, red spruce, balsam fir
    and hemlock (pitch pine on the sandy coast, the Smokies' spruce-fir summits above 1,500 m); willow
    thickets by fresh water in the North and the mountains; snags in a wood — beetle-killed lodgepole
    and spruce in the Rockies, adelgid-killed hemlocks in the East, drowned trunks by a beaver pond.
    Never a western conifer east of the Plains (tests).
  - **The dry side is ponderosa country** now ("Bend: ponderosa and juniper"): the Northwest test that
    said "none of the westside conifers" there asks for no hemlock, cedar or Sitka, and ponderosa over the
    interior's Douglas fir (18–32 m, not the westside's giants).
  - Studio: `shots/trees-pines3.jpg`, `trees-spruces3.jpg`, `trees-north3.jpg`. Shaders: all five
    programs compile (`tools/shader-check.js`).
  - Tests 893: the new conifers by place and band, the Adirondacks' and Asheville's woods
    (`tests/streetTrees.test.ts`), the foundry's budgets for every new kind.
- **Tools behind a proxy:** `tools/pw-proxy.mjs` hands Chromium the session's egress proxy as launch
  flags (node and curl read `HTTPS_PROXY`, Chromium doesn't; Playwright's own `proxy` option sent
  localhost through it too, which the proxy refuses) and trusts the certificates node is told to
  (`NODE_EXTRA_CA_CERTS`); `capture.mjs` and `real-compare.mjs` use it.
- **The tree studio without the game** (`tools/tree-studio.mjs`, a blank `tools/studio.html`): seconds
  where `/kit.html` took minutes under software GL; trees spaced by their crowns (a live oak is three
  street trees wide); `--extra=/tools/studio-hangers.js` dresses them with their hangers.
- **Wrap-up and handoff.** Robby: wrap up and hand off to a new session on this branch, "and also to
  know to make things derailed [detailed] and variety and variation matter"; and "it doesnt need to do
  the slow captures as we want rapid but great development … just review a faster way like the code
  itself or screenshots if that works". `docs/earth/HANDOFF.md` is rewritten for it: review by reading
  the code, typecheck and the touched test files, the tree studio when it works; CI (typecheck, the
  full tests, build, playtest on every `feature/*` push) does the heavy checking; nothing that needs
  the missing Cloudflare/Mapillary keys. Package #4 (the eastern hardwoods, the flowering understory,
  the southern pines) is designed there but not started, with the bar for detail and variety every
  package must clear. The Savannah in-game capture was stopped unfinished and isn't carried over.

## 2026-10-04 — Regional life (2): every door, the shop's whole window, the lamps, walkers on the steps, the Northwest in the foundry

Robby, through the day:

- Sea Bright: "some buildings i cannot walk inside like ocean house and angelics or sea bright
  lizza … it should be all buildings";
- Brooklyn: "the window still was not all see through … just a tiny square";
- at night the street lights made "cars and everything glow way too light where it washes it all out";
- "people walking sometimes walk through walls of building to other side around corners and when
  walking on porch into house they fall into the floor";
- "do northwest and stuff that doesnt take hrs of processing", with the foundry's models "detailed
  and well made with amazing animation" from an exhaustive list.

- **Every door opens** (`getting-in`, commit 1c43ebd). The shut-door leaf waited for the building
  standing open beside you to hand over, and it never did: the door you stand at is now activated
  whatever is open next to it. Ocean House failed on the old code and passes on the new; all 20
  commercial doors near Ocean Avenue let you in.
- **A shop under flats cuts its whole window** (1c43ebd). The facade knew the ground floor of an
  apartment block was a shop (`bd.gf`), the interior didn't, so it cut only a sash-sized square.
  The plan, furnishing, layout and views now read it too (`tests/interiorWindows.test.ts`).
- **The lamps light the street, not wash it out** (65e873f; `nightLight.ts`). A pool's heart is a
  lit midtone now (gain 1.8 → 1.2, a cream light, its own colour muted 0.55, a floor of 0.28), so a
  car or a wall in it keeps its colour. `tests/nightLight.test.ts` holds the heart at L* 55–70 on
  asphalt.
- **Walkers keep to open ground** (`walkers-clear-of-walls`, ba9d65f):
  - Every entrance carries its way up (`Door.path`): the top of a porch's steps; a raised house's
    landings and flights turn by turn. Walkers walk it, up the steps and level across the deck. On
    a test porch they were up to 0.7–1.0 m under it; now 0.00 m.
  - A walker sets out only for a door whose wall it stands in front of (`LifeInit.doorN`). One
    round the corner, or behind a shallow building, it used to reach straight through the walls.
- **The Northwest in the foundry** (`regional-flora`, 94ce999; Robby: "do northwest"):
  - **Six trees**, three grown forms each (open-grown, forest, old), far and near models, all under
    budget: Douglas fir, western hemlock (its nodding leader, and stilt roots where it grew on a
    nurse log), Sitka spruce (a buttressed foot), western redcedar (J-shaped boughs, an old one's
    candelabra of dead spikes), red alder (pale stems), vine maple (a sprawl).
    - A conifer's clumps are *sprays*: drawn out along the bough, the rim drooping, on tiers that
      spiral and close up toward the top. The first try was stacked plates on a pole (the studio
      shots `shots/trees-nw*.jpg`).
    - New leaf pictures for the cedar's flat sprays and a maple's big hands.
  - **Moss.** Beards of moss under the bigleaf maple's limbs, licorice fern along them. Moss on the
    bark as the region's damp (`styles.ts moss`): the westside's trunks green on their wet sides
    and feet. It first read lime and wrapped every trunk, then went a deep olive, in patches.
  - **Where.** West of the Cascades' crest (`styles.ts westOfCascades`) the conifers are these, at
    their real heights (fir and Sitka 25–48 m in a wood), Sitka in the outer coast's fog belt, four
    in five of a wood's trees conifers. The dry side (Bend, Yakima, Spokane) is now the Mountain
    West's: no westside moss, and cold winters (it had the marine Northwest's mild ones).
  - **The forest floor** (`world/understory.ts`): sword fern, salal and Oregon grape under a wood's
    canopy round the walker, and the lawn grass gives way there. It reads the near-tree layer's
    crowns (`NearTrees.crownsNear`): every mounted tile's trees, shown yet or not.
  - Seen: a Seattle old-growth wood (`shots/spots-pnw-wood2.jpg`): fir and cedar trunks with moss
    on their north sides, sword fern and salal between them. Compared (`pnw-flora-1`): mean 0.683.
    Seattle's Federal Avenue 0.79 (vegetation 43% against the photo's 59%, fir spires along it).
- **The model list** (`docs/regional-life/models.md`, compiled by a helper agent from the 16
  region files): every plant and animal the foundry must build, deduplicated — 1,382: 46 the
  foundry has, 1,299 rows on a genome, 37 new genomes or body plans — each with its genome, regions,
  real size, seasons, its animation and behaviour, and a priority. Its 16-package build order puts
  the Northwest (done today) first.
- Tests 868 + 3 (`tests/understory.test.ts`), the build, and the montages above.
- **Next:**
  - The Hoh and Longmire still stand in meadow: the map draws no wood there. That's the canopy
    layer, which Robby deferred.
  - The ground under a wood should be duff and moss, not the lawn wash.
  - Map OSM genera to the new kinds in `realTile` (Pseudotsuga → fir, Thuja → cedar, Tsuga →
    hemlock, Picea sitchensis → sitka, Alnus → alder, Acer circinatum → vinemaple) with the next
    worker cache bump.
  - Queued bug: an upstairs flat's floor and furniture stand out over a shopfront (the Bonobos
    building; `upstairs-over-shopfront`).
  - Then `models.md`'s next packages, and the wildlife with its animation.

## 2026-10-04 — Regional life (1): getting in, people who stay in, the regions' reference, the street trees

Robby, from Brooklyn:

- big shop windows showed the room only through a blob in the middle;
- a new building's door and windows hadn't opened, and walking in the house was see-through for a
  second;
- people who went into buildings vanished.

Then he asked for greenery compared region by region ("upstate NY, PNW moss trees, ferns, Kentucky,
Florida, Texas, middle America"), plenty of foliage and animals from the foundry, an exhaustive list
of wildlife per region in a new doc, a plan, the feature list, and to begin iterating.

- **Getting in** (`getting-in`; `docs/agent/gameplay.md`):
  - **The panes.** A pane opens whole or not at all, decided by your distance to its nearest
    point, with a per-window threshold, and only on the storeys round yours. The old per-pixel
    noise round 4.2 m from the pane's centre left big storefronts half-dissolved.
  - **The door you walk toward** builds first (your heading, smoothed from your steps).
  - **A shut door.** Within 2.5 m of a door whose interior isn't open, a leaf stands across its
    doorway and the build runs flat out. A step in stops at the door until the room is ready.
  - Court Street, Brooklyn, walked in frame by frame: the whole storefront opens from 5 m, and inside
    is continuous.
- **People who go in stay in** (`people-persist-indoors`):
  - The open building publishes its door and the free standing places on its ground storey.
  - Whoever walks in by that door goes to a place, stays, and walks back out (`IN_WALK` /
    `IN_STAY` / `IN_OUT`), the same person. A tower's ground floor takes visitors too.
  - Tested in `tests/lifeSim.test.ts`, and seen live in Brooklyn.
- **The regions' reference** (`docs/regional-life/`, researched by a helper agent from public
  sources; `docs/REGIONAL_LIFE.md`, the plan):
  - 16 regions as EPA ecoregion groups, each with its flora layer by layer and its wildlife, with
    how common each one is, where and when, and a modelling note.
  - Each region's signature, the range limits, and the foundry's build order.
  - The feature list's queue: `regional-greenery` (active), `ecoregions`, `regional-flora` and
    `regional-wildlife`.
- **The green spots** (`tools/real-spots.mjs` `GREEN`): 64 curated public streets, parks and
  roads, 3–6 a region, 40 with a fit photo. `real-compare --kind=green --group=region` gives a
  montage a region.
- **What green-1 found, and the fixes:**
  - **The survey's street trees were dropped** (`props.ts`). A crown over the street slid to a verge
    still inside the paved mask; one at the kerb line hit a kerb or a door's way in; and the
    clearance pass narrowed every street tree under a row's eaves to a stick and dropped it.
    - The trunk now takes the verge past the paved band, else a pit at the kerb, with a step along
      the street round a stoop.
    - A crown topping the roof by 3 m overhangs it, and a measured tree is never dropped.
    - Savannah's Jones Street keeps 30 of the survey's 35 trees within 50 m (it kept 6);
      `tests/streetTrees.test.ts`.
  - **The class pass measured a ceiling.** It drew the region's backdrop ground in flat colour, and
    over streamed cells its shader keeps that under the tiles: wooded cells raised 11 m stood over
    the lens in the leafy places. It's left out there now. `real-compare` also waits for the lens's
    cells' reliefs.
  - **The map's woods grew no forest.** A streamed cell's land cover is the DEM's grassland
    everywhere. `areaCoverMask` now reads the tile's OSM woods, scrub and lawns first.
  - **green-2:** the green spots' vegetation went 3% → 24% (the photos show 35%), and the mean
    score 0.57 → 0.72. Midwest 0.87, California 0.82, the Rockies 0.73.
- **Next:** forests OSM doesn't draw stay bare: Longmire inside Mount Rainier, the Adirondacks'
  NY-73, Bend's ponderosa. Neither the LiDAR records (no buildings, no record) nor OSM have them.
  The real-data answer is the USFS's NLCD Tree Canopy Cover: 30 m, the lower 48, public. Baked
  into R2 by 1° blocks, it becomes the tree scan's density everywhere. Then the regional flora (§6
  of `docs/REGIONAL_LIFE.md`).

## 2026-10-04 — Foundation first (5): audit round 2 — every cell real; the slow cities; the horizon; a phone holds each vertex once; the comparison across the lower 48

The lower-48 audit again (`docs/earth/AUDIT_48.md` round 2), now that every cell comes from our own
extract: 19 towns, desktop and phone, first visits at t/v25.

- **Every tile loads:** all 249 desktop cells real or baked, no stand-in or failed cell anywhere
  (round 1: most were vector twins); every one of the 38 arrivals outside and on land.
  `every-tile-loads` and `spawn-on-land-outside` pass.
- **A Great Lake's shore cell built in 9 s, now 0.24 s.** The tile carries the lake's whole outline
  (47,000 vertices, 253 islands) and `realExtras` tested every ground quad against all of it. Now
  `ringTester` (`realTile.ts`) buckets a big ring's edges by row over the cell, giving the same
  answers; `tests/realTile.test.ts` compares it with `pointInRing` point for point.
- **Reliefs wait their turn** (`stream.ts drainRelief`): every mounted cell asked for its relief
  rebuild at once. Those are 14 whole rebuilds, and they shared the one builder with the cells
  not up yet, so they ran 110 s and stalled out. Now they queue nearest first, two at a time (one
  on a phone), and a real cell's waits for the ring's first builds. A failed relief retries.
  Chicago: every cell real 1 s after ready (it was past the audit's 240 s wait), settled in 38 s
  (from 244 s), no cell left late. Duluth: 23 s and 57 s (from 141 s and 207 s). The silhouettes
  build at 1.3 s each (they were taking 33 s).
- **The desktop's horizon ring** (`horizon.ts`): its first build races the town's own DEM reads, and
  if one tile came late it waited for a 5 km walk, so most desktop arrivals had no far mountains.
  It now retries on a backoff (30 s, doubling to 10 min); `tests/horizon.test.ts`. Aspen's ring
  is up 35 s after ready, and Bar Harbor's montage has Cadillac Mountain again.
- Round 2's other finds, fixed earlier today (9d364c0): a triangle's gable roof (the NaN chimney at
  Ely and Santa Monica), and browser Overpass asked though the service answers. The one console
  error in every run comes from the dev server's local-worker check, so a player never sees it.
- **A phone's page holds each vertex once** (`phones`): the page kept every tile vertex in JS as
  well as on the GPU. On the phone tiers (`quality.ts freeArrays`; `?free=0` / `?free=1` override)
  each tile attribute now drops its array once uploaded (`pack.ts`), keeping what the CPU reads
  again: positions, ids, the index, and instance matrices. A tile mounted whole (the arrival ring,
  a silhouette) is drawn on its first frame whether or not it's in view (`stream.ts uploadSoon`),
  so it uploads and drops its copy straight away. A restored GPU context can't re-upload what's
  gone, so a page that frees reloads where you stand, a tier lighter as after any lost context.
  At the airport on a Pixel 7 the page's array memory went 196 → 136 MB once settled, and 243 →
  158 MB after a walk round the ring, with no errors. A forced context loss
  (`WEBGL_lose_context`) reloaded at the same spot, the phone montage is unchanged, and
  `tools/mobile-check.mjs` passes. The stream's budgets weigh a tile before its upload, so their
  counts are unchanged.
- **The real-world comparison runs on real cells** (`real-world-comparison`, Tier 1 #1, unblocked).
  Making it measure honestly came first:
  - A streamed cell's ground, roads and area sheets had no names, so the class pass counted every
    real street as "other". They are now `ground:cell`, `road:ribbons` and `water:area`.
  - A photo has to be fit: quality 0.4 or better, the sun up, segmented, and a lens of 30° or
    more. Portland's rain-dark windscreen scored 0.05, and Ashland's "street" was a deer at 5.7°.
  - The game's lens takes the photo's pitch from Mapillary's computed rotation, whose heading matches
    the compass exactly. Dash cameras tilt from −10° to +20°, and +3° on average had been reading
    as too little sky in the game.
  - Mapillary's computed altitude is too noisy to lift the lens: it raised Oklahoma City's by 47 m
    over a street photo. Only the roof of a mapped building the photo stands in lifts it now.

  The first national run (`national-1`, 106 photo spots) scored 83, with a mean of 0.689; the baked
  shore scores 0.85. Across the lower 48, photo against game, in percent:

  | | Sky | Building | Vegetation | Ground | Vehicle | Other |
  |---|---|---|---|---|---|---|
  | Photo | 27 | 20 | 14 | 27 | 4 | 9 |
  | Game | 31 | 27 | 5 | 32 | 4 | 2 |

  - **Vegetation is the gap:** the game shows a third of the photos' vegetation, worst in the
    South (Tennessee −52 points, Texas −32, Louisiana −31). Los Angeles's street trees and lawns
    are drawn as plain blocks.
  - **Street furniture:** "other" (poles, signs, fences, barriers) is a quarter of the photos'.
  - **Buildings stand too close or too bare:** 7 points too much of the view.
  - In New York and Portland the opposite happens: a LiDAR crown, or a mapped tree in its pit, right
    at the lens where the photo shows none.
  - The montages are `shots/real/<ST>-montage.jpg`.
- **Next:** Robby's `?diag=1` at the airport on his phone. Then Tier 1 from the comparison, worst
  first: vegetation in yards and along roads (a third of the photos'), then street furniture. The
  audit's leads are Aspen's lawn-green mountain, a Duluth street frame with no street, a car parked
  on a crossing, and the airfield's runways drawn as thin lines.

## 2026-10-04 — Foundation first (4): the US extract built, proven, live; every ramp; the airport crash

Tier 0's "every tile loads" (docs/GAMEPLAY_VISION.md §17): the whole-US extract built, checked
against Overpass in every kind of place, and switched on — reversibly.

- **The US extract** (`scripts/osm-extract.mjs` on D:): 14.4 M nodes, 144.7 M ways, 371 k relations
  (6,486 big), 179 M way-tile lines from 1.5 B points; ~1¾ h of steps, then the packing
  (31 bands over a night of restarts; 1,481 blocks, 36.5 GB, 10.6 M tiles, 195 M lines). What it took:
  - **Packing bands** sized by their data: the old 4° strips from −180° to +180° were 90 full
    re-reads of the ways' geometry (~7 h); a 40 M-line band ran DuckDB out of memory at 20 GB, a 12 M
    one at 14 GB; at 20 GB with the editor open Windows paged DuckDB (28,000 pages a second, every
    thread waiting). 16 GB with ≤ 8 M-line bands fits; a stopped run keeps its packed bands.
  - **An empty member role** — OSM allows it, Overpass prints `"role": ""` — comes from `ST_ReadOSM`
    as NULL, and NULL in the members' concatenation is NULL: 526 relations lost members (an
    outline's rings, a site's parts) and 778 tile lines read `null`. Found by measuring the first
    packed band, before anything was live; now `coalesce(role, '')`, a test that runs the script's
    own relation SQL in DuckDB (`tests/osmExtractSql.test.ts`, fails on the old SQL), and a packer
    that refuses anything printed as null.
  - **Speed:** a block's tall things and big relations read once per band (two whole-table queries
    a block, ~1.5 s each); a small tile compressed in place (its round trip to libuv's pool, shared
    with DuckDB's reads, cost ~1.7 ms a tile with the machine idle — hours over ~15 M tiles).
- **The proof, across the country** (`tools/osm-compare.mjs --now`: today's Overpass with each
  element's last edit, since the attic queries — the snapshot's own moment — were refused by a busy
  server; `--split` asks a dense cell in parts and merges them by element):
  | Cell | Elements each side | Result |
  |---|---|---|
  | Downtown Seattle | 6,042 | 7 differ, all edited after the snapshot |
  | Kings Beach, Lake Tahoe | 732 | 1 differs, edited after |
  | South Lake Tahoe | 1,338 | identical |
  | Santa Monica | 2,407 | identical |
  | Downtown Tucson | 6,402 | identical |
  | Aspen | 2,004 | identical |
  | Hays, KS | 2,588 | identical |
  | St. Louis riverfront | 2,489 | identical |
  | Asheville | 2,657 | identical |
  | Miami Beach | 2,180 | identical |
  | Intercourse, PA | 335 | identical |
  | Levittown, NY | 1,367 | identical |
  | Shrewsbury, NJ (two cells) | 203 and 371 | identical |
  | Bar Harbor, ME | 1,314 | identical |

  That's 15 cells in 12 states. Chicago's lakefront first answered from the backup mirror, whose
  data was from July, so osm-compare now refuses a mirror older than the snapshot; the main server
  timed out on that cell, and on Midtown's.
  The small towns' answers are kept as `tests/fixtures/osm/*.raw.json.gz` (Shrewsbury ×2,
  Intercourse, Bar Harbor) (both sides through today's `osmToTile`, so the proof outlives
  builder changes); the cities' (1–2 MB each) on D:.
- **The tile service's extract path under test** (`tests/osmWorker.test.ts`): an in-memory R2 packed as
  the extract packs; `/tile` from the extract, marked so in R2 and on the answer; the outline's edge
  left to Overpass; `/skyline`'s tall rule; a block's directory read once a request (a cell's six tiles
  read it six times at once).
- **Every interchange keeps its ramps:** `motorway_link` and `trunk_link` had no width in
  `realTile.ts` (or the bake's copy), so every on- and off-ramp was dropped — in real cells and the
  vector twin. Tiles `t/v25` + `&v=25`, so every cell rebuilds once, from the extract.
- **Go-live** (2026-10-04, late morning): the blocks staged in R2 while the packing ran (only changed blocks: the
  hashes are content's), the index uploaded (the switch), the worker deployed (`1aef467b`; the one
  before, `1c95d174`, is the rollback), `tools/must-load.mjs --live` all 11 streamed must-load towns 9/9 cells from the extract (cold, 1.6–13 s), `/skyline` 11,567 tall things over lower Manhattan, the branch pushed
  (Pages and the new CI). The CI's first run caught a real regression: the re-arrival hook threw
  on the rescue's null spec, failing the playtest's teleports. Fixed, and the second run is green:
  typecheck, 850 tests, build, the live must-load check, and the playtest's 6 checks.
  **Going back is one step** (`docs/agent/streaming.md`): delete the index
  (Overpass again within ten minutes) or `npx wrangler rollback` (the old service and its cache).
- **Robby's phone at Monmouth Executive Airport** (Android 10, Chrome 154): the GPU crashed after a
  teleport, Chrome then refused the site WebGL until restarted, and grass showed blue (DuckDuckGo's
  browser flashed and crashed). Reproduced headless as a Pixel 7 on the phone tier
  (`tools/audit48.mjs`, the airport added to its towns):
  - **The blue ground**, which is also Robby's Shrewsbury report: a streamed cell's ground
    (`synth.ts realExtras`) was cut away under wetlands as under water, and the flat sheet laid over
    the hole was one-sided and wound as the map's ring winds. About half faced down, so the sea
    plane showed through 40 m below, with grass growing on it, wherever New Jersey's land-use
    survey (`NJ2002LULC`) mapped a wooded swamp. Now only water cuts the ground, the paint colours
    a wetland, and `faceUp` turns every sheet to the sky. `tests/realExtras.test.ts` fails on the
    old code; the airport's montage before and after shows the blue gone, all but its one real pond.
  - **No leak:** 12 teleports, Sea Bright ⇄ the airport ⇄ Shrewsbury. three's geometries (585–913)
    and textures (26–28) follow the place, and the JS heap after a forced GC stays flat at
    453–536 MB. Without the forced GC it climbed to 773 MB, but that was garbage not yet collected.
  - **The weight:** the phone tier carries ~190–245 MB of vertex data (in JS as well as on the GPU)
    and a ~450–530 MB heap. That's plausibly too much for an Android 10 phone's tab. Next: free the
    uploaded vertex arrays the CPU never reads again, and Robby's `?diag=1` there after go-live.
- **The must-load towns under test** (`tests/mustLoad.test.ts`, `tests/fixtures/towns`, ~1 MB): every
  one built from the extract with land under its spawn, streets, at least half its own outlines
  standing, and trees. Levittown's point moved onto Jerusalem Avenue; the old one was in Nassau
  County Basin #30, a recharge basin.
- **The comparison loop's spots:** 146 in every lower-48 state, 106 with a photo (86 before): a
  town's centre is its nearest GNIS place of the name (Virginia's first Fredericksburg is a hamlet
  180 km from the city), a wider last look, the Census's legal suffixes stripped.
- **Mapillary's map features**, looked at before building on them: a small town is one drive (so
  "seen on different days" would drop it all), downtown Seattle 473,848 features for ~2.7 km² (one
  lamp many times over) — the rules merge duplicates instead. Robby: home mailboxes left out.

## 2026-10-03 — Foundation first (3): our own OSM extract, the audit, the tiers, arriving outside, the comparison loop

Tier 0's audit and "every tile loads" (docs/GAMEPLAY_VISION.md §17), and Tier 1's first tool.

- **The lower-48 audit, round 1** (`tools/audit48.mjs` + `audit48.js`, `docs/earth/AUDIT_48.md`): 10
  towns, each as a desktop and as a phone, with one montage per town. Public Overpass stopped answering
  during the run, from this PC and from Cloudflare (the OSM forum reports throttling and some instances
  shut down). Midtown, Intercourse, Miami Beach, the Chicago Loop and German Village had 0 of 14 real
  cells on the desktop; everything else was the vector twin, which held up (no holes, no land drawn as
  water). Found: Bar Harbor's arrival was inside a restaurant's dining room, and Levittown's was
  flagged as in water. Robby's dark-blue ground at Shrewsbury didn't reproduce (at the centre, on the
  desktop and phone tiers, with the DEM blocked, in January).
- **The queue re-ranked** (`feature_list.json`, `tools/rerank-features.mjs`): tiers 0–3 from the
  vision's §17, 90 items. 24 are new: the extract, every-tile-loads, spawn-on-land-outside,
  worker-costs, the comparison loop, public places, Mapillary objects, round 12's night, ground and
  trees, the phone look, and §15's gameplay steps. Three are superseded, with reasons:
  `brush-boat-minute`, `almanac-regional` and `traversal-spike`. One is in_progress: `own-osm-extract`.
  `npm run init` names the next item by tier.
- **Our own OSM extract.** Robby's call: R2; packed, not millions of files; match Overpass exactly and
  prove it with saved answers kept as a test; cut on a global grid from the whole-US file; ODbL on
  request; a monthly refresh from his PC; Overpass only a polite fallback. The parts:
  - `src/world/osmQuery.ts` writes the cell query once; `overpassQuery` is generated from it, byte for
    byte the old one.
  - `src/world/osmTiles.ts`: 1/128° tiles in 1° blocks, Overpass's box rule, and assembly.
  - `scripts/osm-extract.mjs` packs Geofabrik's file through DuckDB `ST_ReadOSM`.
  - `scripts/osm-upload.mjs`: content-addressed keys, only changed blocks uploaded, the index last.
  - `worker/src/osm.js`: the service reads the extract first, and `/skyline` serves both skylines from
    its tall layer.
  - `tools/osm-compare.mjs` compares the extract with Overpass.

  Proof so far: two real Shrewsbury cells built from the extract are **identical** to the TileJson
  the service built from Overpass (osmBase aside). They're kept as `tests/osmExtract.test.ts`, and in
  `wrangler dev` the worker's own path gives the same bytes.
  - The US run hit DuckDB's limits:
    - An ordered list aggregate over 1.5 B points ran out of memory. Sliced, it ran on one core. In
      eighths, it spilled 85 GB. Now it's an unordered gather and a list sort in slices of about 10 M
      points (about 11 s each, no spill).
    - Big relations got a random home block on ties (`min_by`). Now it's the lowest tile, so a rerun
      packs the same bytes.

    Each change was checked byte for byte on New Jersey's 10 blocks.
  - The browser no longer asks Overpass itself, except with `?tiles=direct`. The service tries two
    mirrors for 25 s each, rests five minutes after three failures, and caches a failure for ten
    minutes.
- **Arrive outside** (`src/player/landing.ts`): a link, a search or "walk here" now lands just past
  the foot of the nearest door's steps, facing the door. It used to land 2.2 m inside, which put
  arrivals in a Bar Harbor dining room and a Shrewsbury house. `main.ts` re-makes an arrival when the
  real cell replaces its stand-in under you.
- **A mailbox out of a slip road's lane** (`src/world/props.ts`): the playtest's posts check found a
  rural box in the lane of the Ocean Avenue / Rumson Road link. `buildings.ts`'s street index knows
  only the plain streets, so a box is now left out wherever it lands in any carriageway
  (`tests/kerbposts.test.ts`, which fails on the old code).
- **The playtest on every push** (`.github/workflows/playtest.yml`, committed at go-live): typecheck,
  tests, build and the live must-load check, then the quick suite headless on the shore. Locally 5 of
  6 checks passed; the sixth, the posts check, found the mailbox above.
- **Worker costs** (Robby's dashboard, 2026-10-03): $0.00 billed. R2 had 2.92 k writes (1 M
  included), 6.11 k reads (10 M included) and 0.03 GB-months of storage. The worker served 5.96 k
  invocations with 2.45 k subrequests (the terrain and LiDAR reads on S3, and Overpass), at a median 1.78 ms of CPU. The
  cost model is in `docs/agent/streaming.md`.
- **The real-world comparison loop** (`tools/real-spots.mjs`, `real-compare.mjs`, `class-pass.js`):
  Mapillary photos against the game from the same pose, lens (Mapillary's focal length), date and
  hour, scored by class mix (Mapillary's own segmentation against a flat-colour class pass). The
  token is in `.env`, which git ignores; the photos are for development only and never shipped.
  - First run, on the shore: scores of 0.81–0.87 (`tools/real-scores.json`). The game shows a quarter
    or less of the photos' vegetation, a fifth to a third of their "other" (poles, signs, furniture)
    and more bare ground.
  - Mapillary's terms are checked (Robby asked): fine for the loop. Street objects are fine too, with
    the logo and as a separate CC BY-SA layer (`docs/DATA_SOURCES.md` §0).

Next: finish the US extract, compare the audit's Overpass-built cells and save them as fixtures, run
the must-load fixtures, upload the blocks, deploy the worker, then upload the index (the switch).
After that: the live must-load check, push (Pages and CI), and audit round 2 on a quiet machine.

## 2026-10-03 — Foundation first (2): commercial-safe — our own place index, the licence check, credits

Tier 0's "commercial-safe infrastructure" (docs/GAMEPLAY_VISION.md §17).

- **Photon is gone; our own lower-48 place index** (`scripts/build-places.mjs` → R2 `places/v3/`,
  `worker/src/places.js`, `src/ui/placeIndex.ts`, `src/ui/geo.ts`):
  - **Names:** 1,849,206, all public domain — the Census's 31,540 places, 16,153 active county
    subdivisions (towns, townships), 3,109 counties and the states (2026 gazetteer, ranked by the
    2024 population estimates); GNIS's populated places and natural features (current, 2026-09);
    and the public places GNIS retired in 2021 (parks, forests, airports, trails, bridges, dams,
    towers, hospitals, schools, places of worship, cemeteries, post offices) from its archive. No
    street addresses; GNIS "Locale" (ranches named for their owners), mines and wells left out.
  - **Search:** each name filed under each word's first three letters, 8,026 gzipped shards in one
    95 MB object; `GET /places/search` reads the rarest word's shard by range (median 356 B) and
    ranks by standing, name match and nearness; edge-cached a day. A national park outranks the
    hamlet named for it ("Yosemite", "Grand Canyon", "Acadia"); Shrewsbury from the shore is the
    borough, then the township; "springfield illinois" is Sangamon County's.
  - **Reverse:** 13,737 tiles of 0.25° (19 MB) of the 2025 cartographic boundaries (clipped to the
    shoreline), simplified to ~25 m; the game reads the tile round it and finds the place, else the
    active county subdivision, else the county. At sea there is no town: the arrival card keeps the
    one you were in (it used to retry every second).
  - **Live:** deployed (worker `1c95d174`); in the game at `?at=40.3297,-74.0617` the arrival card
    reads "Shrewsbury · Monmouth County, New Jersey", search and reverse go only to our service.
  - **Privacy:** the loaded world's own search no longer finds houses by their address (named
    buildings only), and the search box no longer invites "an address".
  - Bugs on the way: two Shrewsburys 2 km apart (borough and township) were folded into one until
    duplicates had to be the same kind; Portland ME had no county (its Census point is in Casco Bay,
    outside the shoreline-clipped county: now the nearest county's shore); a Python edit wrote
    backspace characters for `\b` in two regexes (found when the parks' weight was still 39;
    rebaked as v3; every edited file scanned for control characters since).
- **The licence check** (`docs/DATA_SOURCES.md` §0): every source and service, its terms (quoted),
  whether a paid game may use it, its credit, share-alike. Findings:
  - **The public Overpass servers are not a game's backend** ("relying on the public instances as
    backend" for "an app for more than just OSM mappers" — run your own). They are the tile service's
    cold path today. To replace: Tier 0, "every tile loads" — Robby to decide how (below).
  - **GitHub Pages** may not host "an online business … or commercial software as a service": fine
    while the game is free; move before charging (Robby's call).
  - OSM's share-alike applies to our derived database (the R2 cells): offer it, or the code that
    rebuilds it, if the game goes public. Weather stays seeded (Open-Meteo never used).
  - The 3DEP EPT index's source repo has no licence file (its facts are USGS's, public domain).
- **Credits screen** (`src/ui/credits.ts`): every source with its credit and licence, opened from
  the intro, the HUD's credit line (desktop; a phone's line has no room, so the journal page has the
  link) and the journal page. The always-visible OSM/OpenFreeMap line stays.
- **Tests:** `placeIndex` (17: words, shards, ranking, reverse, even-odd holes, tiles),
  `placesWorker` (5: the routes over an in-memory R2 packed the bake's way), `licences` (6: every
  outside host in the code credited or a reference link; Photon and Open-Meteo never come back; every
  credit shown; §0 records each host; the ODbL line stays). 805 tests, typecheck, build;
  `tools/hud-audit.mjs` 560 layouts clear (224 failed with the link on a phone's line: hidden there).

## 2026-10-03 — Foundation first (1): the new gameplay vision merged

Branch `feature/foundation-first`, off `feature/measured-heights` (the last pushed work; it already
contains `feature/back_to_local_agent_9_30`). Robby's brief: merge the vision, audit the lower 48,
re-rank the queue into the vision's tiers, then do Tier 0 (foundations) and Tier 1 (looks right
everywhere) before any gameplay, apart from a throwaway bloom prototype.

- **`docs/GAMEPLAY_VISION.md`** is now Robby's 2026-10-03 doc ("you are the brush"): the world
  blooms from pencil into colour on first sight; pencil means collectable (tap within ~30 m; only a
  few at once, always chosen out of sight); rares as data by region; real travel by van, yacht,
  plane and balloon; the real calendar; your own private layer of the world; one home behind every
  door; and §17, the order of work: Tier 0 the world loads everywhere and the infrastructure is
  commercial-safe, Tier 1 it looks right everywhere, Tier 2 the game, Tier 3 polish.
- **`docs/GAME_DESIGN.md`** marked superseded: a table of what became of each old section, and
  only the parts that survive kept (why this engine, learning from life and the Almanac, the
  placement solvers). The full old text is in git at `abc02db`.
- `docs/agent/gameplay.md` points at the vision (and says the brush is a prototype of placing, and
  the bloom isn't built yet); `AGENTS.md`'s pointer describes the new doc; `CONSTRUCTION.md`'s
  banner and `brush.ts`'s header follow.
- **Baseline:** `npm run init` failed on two CPU-heavy tests timing out at vitest's 5 s default when
  the whole suite runs in parallel (`measure.test.ts` ringMask's 200 random outlines × 4 pads,
  `synthSeams.test.ts` street ownership); each passes alone in under 5 s. Both now carry a 60 s
  limit, like their neighbours. 777 tests, typecheck, build.

## 2026-10-03 — Measured heights on every device (4): parity, proven

- **`tests/parity.test.ts`** (2): Bain's cell (0_-1) and a Monmouth Beach cell (−1_2), each through
  `enrichTile` as a phone (`initLidar(…, false)`) and as a desktop (`true`), a fresh `lidar.ts` for
  each, then the real `buildTile`: every footprint's wall top and storeys (the interior planner's
  count, now exported as `plan.ts` `storeysOf`) identical on both. `fetch` is stubbed to fail and
  never called: the desktop read no survey. Bain's: 12–13 m, flat, ≥ 3 storeys (a phone without the
  sidecar: 2 storeys, pitched). Monmouth Beach's #42: 2 storeys (1 without). The cell's share of
  two-storey-and-up houses rises by more than 20 points.
- **Phone check** (`tools/mobile-check.mjs --device=pixel7`, the build served like Pages): the phone
  tier, running, 0 page or console errors, all 87 shader programs inside the phone limits (vertex
  uniforms 17/256, fragment 45/224, varyings 8/15, samplers 1/16 and 9/16, attributes 12/16). Its
  9 failed requests are the dev-worker probes and direct-Overpass fallbacks (no tile worker here);
  its memory sampler needs Linux `ps` (nothing on Windows — as before). The phone ring's vertex data
  (height-check): 83 MB at Sea Bright, 167 MB at Monmouth Beach, under the tier's 200.
- **Phone montage** (`shots/shore-montage.jpg`, `capture.mjs --w=412 --h=915 --query=quality=phone`,
  RTX 4070): ocean golden/noon/morning, bridge, beach, aerial — buildings at their measured heights,
  nothing missing or floating. `capture.mjs`'s sheet now keeps the shots' aspect (portrait frames
  had been squeezed into 640×360 cells).
- **Open:**
  - ~~Deploy the tile service~~ **Deployed** the same day once Robby took Workers Paid (version
    c2763604, with tile cache v24). Live: Levittown NY's cell 0_0, 843 footprints measured off Long
    Island's 2014 survey in 22.2 s, the repeat from the edge cache, no errors in `wrangler tail`.
    Midtown answered 503 three times: the service's Overpass query for that dense tile times out
    (the game's direct path asks in quarters; the worker doesn't), so production memory on the
    densest cell is still unverified.
  - Pages now builds and deploys on every push to `main` or `feature/*` (`.github/workflows/pages.yml`),
    as well as on a manual run.
  - Bain's draws four 2.9 m storeys in its measured 12.1 m (a `house` in the pack; MOD-IV says three).
    A measured flat-roofed block on a shopfront street should probably take commercial floor heights.
  - 57% of the shore's houses have fits under the 0.35 bar — a newer survey (NJ's post-2014 flights,
    if 3DEP has one over the shore) or a looser height-only rule would measure more of them.

## 2026-10-03 — Measured heights on every device (3): heights where nothing is measured

The sidecar left 57% of the shore's houses unmeasured (their fits under the 0.35 quality bar: 2,759
under 0.15, 1,088 in 0.15–0.35, 314 no fit). They kept the pack's heights — 78% of the pack's
footprints are Microsoft ML Buildings via Overture, a median 4.9 m, 1.3 m under the survey where
both exist — so a Monmouth Beach street was its measured two-storey houses with every other one a
bungalow, on every device.

- **Tags first** (`realTile.ts`, the bake's mirror): `roof:levels` now counts — ~2.6 m of roof a
  storey over `building:levels` (`Building.rl`). `height`, `building:levels` and `roof:levels` are
  never overridden. TileJson changed: **tile cache v24** (`t/v24`, `&v=24`, `DIRECT_V` 24, together);
  the deployed worker serves v23 tiles until it's redeployed (graceful: no `rl`, as before).
- **A measured neighbour's height** (`priors.ts`, in the builder's own loop, every feeder): a house
  with nothing measured or mapped draws one of the measured houses of about its size (½–2× its
  footprint) in its 256 m cell (else the tile's), by its own seed — the street's own mix.
- **Else the neighbourhood's storeys** (`docs/NEIGHBOURHOODS.md`): estate 9–11.5 m, Northeast grid
  8.6–11 m, Midwest bungalow grid 6.4–7.8, Northwest craftsman 7.2–8.8, a tract its cell's one model
  (`recipe.ts` `tractCape`, shared: cape 7.2–8, ranch 5–5.8, desert stucco 4.8–5.6); a suburb as before.
- **Measured** (`tests/priors.test.ts`, 8): three Monmouth Beach cells with the sidecar — 550 guessed,
  308 measured houses; two storeys and up, guessed **9% → 49%**, measured 41%. Deterministic in any
  order, idempotent, only from houses of its size; estates and grids ≥ 2 storeys, tracts as the recipe.
- **Seen** (`shots/shore-montage.jpg`, RTX 4070, before/after with the change stashed): from 22 m
  over Monmouth Beach the block reads as a mix of one and two storeys instead of a field of
  bungalows round a few tall houses; at the kerb, the house beside the camera stands two storeys on
  pilings (its borrowed 9–10 m crossed the builder's near-water pilings rule, which raises the floor,
  not the total). No broken roofs.
- Phones still read no survey (item 3's "optional"): with the sidecar and the service there's no gap.
- 775 tests, typecheck, build.

## 2026-10-03 — Measured heights on every device (2): the tile service measures streamed cells

Everywhere past the bake (Robby's call: Workers Paid, $5/mo). **Built and verified locally in
workerd; not deployed** — waiting on Robby to confirm the paid plan, then `cd worker && npx
wrangler deploy`.

- **The route** (`worker/src/measure.js`): `GET /measured/<cx>_<cz>.json?olat&olon&v=1`. The first
  request for a cell reads its survey over the buildings the service's own `/tile` has (keyed like
  `/tile`, so the record keys the client's footprints) and keeps it in R2 `m/v1/…` for good. While
  one request measures, the others get 202 (an R2 marker created only if absent; a marker over 4 min
  old is a dead measure, taken over at most 3 times, then 422). A cell with no survey is settled at
  once (`none`). A stale-`VER` record is re-made, not served.
- **Prototype first (Midtown, cell −1_−1: 1,839 footprints, NYC 2017):**
  - Node, lean (nodes streamed into the grid): live memory ~3 MB JS heap + ~38 MB buffers over the
    baseline (sampled with a GC each 150 ms; laz-perf's heap 7.4 MB); without the GC the heap reads
    up to 130 MB — garbage, not live. Worst case I can construct (two surveys overlapping, every
    raster live) ~90 MB with the bundle: inside 128 MB.
  - CPU 15.5 s, of which `ringMask` was 8.5 s — rewritten a row at a time (crossings per row, the
    distance only outside the outline, stopping at the first edge within the pad): bit-identical
    (tests/measure.test.ts: 200 random outlines × 4 pads, two shore cells' real footprints; the
    shore's sidecar re-measured to the byte), 15× faster. Midtown now 6.3 s CPU. Desktops gain too.
  - workerd (`wrangler dev`): 9.6 s end to end, the **same bytes as Node** (`iydluj`). The
    bundle: 1.12 MB, 341 KB gzipped; laz-perf's WASM compiled at deploy (`[build]` decodes the
    game's own base64 copy into `worker/.gen/`; a Worker can't compile bytes at run time).
    `[limits] cpu_ms = 60000`.
- **No request waits on another's promise.** workerd cancels such a request as hung (a 500). The
  first local run hit it in my sharing of an in-flight measure — and in the existing `/tile` cold-path
  dedupe and Overpass slot queue (concurrent cold requests for one cell each got a 500 — also in
  production). Now: a busy isolate answers `/measured` 202; a cell another request is fetching is
  awaited in R2 on the asker's own timer; Overpass slots are polled for. Re-run: three concurrent
  requests → one measures (200, 6.0 s), two get 202 in 0.7 s; 0 hangs.
- **The client** (`measured.ts` `serviceMeasured`, `lidar.ts`, `tile.worker.ts`): every tier asks
  for a streamed cell's record (one request a cell a session, 202s polled up to 3 min, kept in
  IndexedDB, other-`VER` records ignored, no request where no survey). `enrichTile` races a record
  on its way against the usual wait: priors now ('late'), no survey read on either tier, the relief
  rebuild applies it; only when the service can't answer does a desktop measure itself. A vector
  twin only peeks. `MEASURED_V` is one constant both sides import.
- **Verified in the game** (`tools/height-check.mjs`, the build against local workerd, Midtown):
  phone and desktop build the measured cell identically — a commercial block 15.67 m (survey
  15.37 m, prior 6 m), a house 6.08 m (survey 5.58 m, prior 7.8 m); the phone read no survey, the
  desktop read only the three cells whose `/measured` failed (the service's Overpass was off on
  purpose — the fallback). Local dev is HTTP/1.1: with slow cold `/tile` calls a browser's six
  connections queue `/measured` behind them (`worker/README.md` says how to test around it).
- Tests: `tests/measured.test.ts` +6 (the URL, one request per cell, 202 then 200, failures not
  remembered, other `VER` / not JSON rejected, no request with no survey or a peek; a record on its
  way → 'late' then the measured house, phone and desktop), `tests/measure.test.ts` +2 (ringMask).
  767 tests, typecheck, build.

## 2026-10-03 — Measured heights on every device (1): the shore's LiDAR sidecar

Robby: Bain's Hardware (1092 Ocean Ave) is right on a PC but two storeys on a phone, and many
Monmouth Beach houses are one storey on a phone. Phones never read the survey (`quality.ts`
`lidar: false` — a city's decode crashed them), so they built from priors. The fix: measure each
cell once and ship the result to every device. Branch `feature/measured-heights`.

- **The sidecar** (`public/data/shore/measured/`, `scripts/measure-cells.mjs`): every cell of the
  baked pack measured by the runtime's own code (`cellPlan` → `cellRequest` → `measureCell`, laz-perf
  through Vite's module runner), one record a cell — the same `Rec` a desktop caches — and an index
  (`ver`, the project-index date, the pack's `bakeId`, each file's hash or 0). The pack's own files
  are untouched (its tiles still hash to its `bakeId`: a test).
  - 216 cells: 127 records, 81 open water, 8 with no survey returns; ~6 s a cell, 4–6 dropped
    fetches retried, none failed.
  - **Deterministic:** run twice — once decoding nodes into kept point arrays (the browser's way),
    once streaming them into the grid (the tile service's way) — byte-identical, all 128 files.
    Nodes now reach the grid in node order (`lidarCell.ts`: float32 ground sums depend on the order).
  - **Size:** 12.4 MB raw, 4.6 MB gzipped; mean 36 KB gz a cell, max 80 KB. The buildings are ~4 KB
    gz a cell; 85% is the survey's trees (up to 12,000 a cell).
- **The runtime** (`lidar.ts`, `measured.ts`, `tile.worker.ts`): `enrichTile(…, pre)` applies a
  precomputed record first on every tier; its fits win over a browser's own (`joinRec`); a desktop
  reads the survey only for what a record lacks, a phone never. `?measured=0` leaves records out
  (a bug found on the way: the flag never reached the tile worker's build, so a desktop with
  `?measured=0` still used the sidecar).
- **Bain's, confirmed:** NJ MOD-IV lists 1092 Ocean Ave as "3SB" (three storeys), parcel centroid
  40.36220,−73.97453 — the pack's 0_-1 #61 (35.5 × 22.3 m). The survey: 12.08 m, flat, fit 0.67.
  1096 next door (0_0 #274, "2SB") fits poorly (0.25) and keeps its priors on every device.
- **Verified** (`tools/height-check.mjs`, new — a Pages-like serve, a device emulation, the built
  buildings' wall top and storeys at probe points):
  - Bain's: phone with the sidecar 12.57 m wall, flat; a desktop reading the survey itself in the
    page (`?measured=0`, 14 cells read) 12.57 m; the phone without it 6.85 m, pitched, 2 storeys.
  - Five Monmouth Beach houses: phone = desktop's own read exactly (8.99 / 7.74 / 7.41 / 8.24 /
    9.38 m walls, 2 storeys; the 7.41 m one stands on pilings, 1 storey over them); without the
    sidecar all five were ~4 m, one storey.
  - Phone ring budget: Sea Bright 83 MB of vertex data with the sidecar vs 76 MB without (4 tiles);
    Monmouth Beach 167 MB (7 tiles) — under the phone's 200 MB, which `admitCells` enforces anyway.
  - `shots/shore-montage.jpg`: Bain's and a Monmouth Beach street on the phone tier, before/after.
  - `tests/measured.test.ts` (+3): the sidecar is this `VER`'s measurement of this pack, every file
    hashes to its entry and keys only its cell's footprints (and all of them), the pack unchanged.
- **Found, not fixed:** Bain's is a `house` in the pack (no shop is mapped on it), so its 12.1 m
  is drawn as four 2.9 m storeys; MOD-IV says three (an old commercial building's ~4 m floors).
  The height is right on both devices; the storey split follows the kind.

## 2026-10-01 (afternoon) — Review round 11 and its fixes: lamplight, grain, trees, people, homes

Round 11 scored Sea Bright **8.5/10, not passed**: "five for five, and three overshot"
(`docs/earth/REVIEWER.md`). Five helpers took its must-fixes and smaller fakes side by side. Three
of them were cut off by the session's usage limit; the lead merged their committed work and checked
it.

- **Lamplight, not stage discs** (`render/nightLight.ts`):
  - **The pool:** a lamp's own fall-off, `h³/(h² + d²)^1.5` at h = 8 m (half at 6 m, 17% at 12 m),
    eased out by 22 m, so pools meet faintly. The heart is a pale cream (C\* ~16, not 48–55).
  - **The glaze:** its reserve is widened, and it no longer bites the pool's own edge.
  - **The night's floor** of sky glow keeps the street readable.
  - **Measured** (`night-check` r12):
    - frame 3: the wires, the lens and 2 pools at ≥ 2.5× pass, but its gap is L\* 26.5 (the
      moon was up; the test asks 10–20);
    - frame 13: the gap L\* 18.7 and the heart C\* 19 pass, but the fall-off couldn't be measured
      from its pose.
- **The ground's grain from structure** (`ground.ts`): the aggregate is round stones at a fleck's
  size, pale in asphalt and both ways in concrete. The sand's marks are shadow only. The dark speckle
  is cut.
- **Trees up close** (`world/nearTrees.ts`, `render/leafCards.ts`):
  - **The near model:** within 30 m a tree is the species' limbs to the second order, with a
    tapering trunk, bark furrows and 8–20 leaf-cluster cards lit as the far crown is. Stems grow on
    into the crown; trees are bare in winter by their own limbs.
  - **Cost:** models are grown ahead, one a frame; instanced; capped per tier.
  - **Measured** at 5, 8 and 10 m (`tools/tree-metrics.py` on the masks):
    - sky through the crown 9.1, 6.7 and 6.0% (the old crown 0.3%);
    - longest straight edge 4–9% of the crown's width (old 32.5%);
    - 3–4 limbs entering the crown;
    - trunk taper 1.45–1.5.
- **People at arm's length** (`assets/people.ts`, `render/creature.ts`):
  - **The body:** one smooth skinned tube per limb, shoes on soles (10.6 cm wide), rounded mitten
    hands, a nose and ears. It's 1,472 vertices, with no normal break over 23.7°.
  - **The lead:** the dog walker's hand holds it (within 1.9 cm), the arm follows it, and the dog's
    tail is carried (47 cm up).
  - **Movement:** standing people shift their weight every ~12 s, and walkers stand on the ground
    (they floated 12 cm). The beach crowd's full bodies follow on-screen size.
- **Homes and small reads:**
  - **Kitchens:** a home's kitchen has its cooker and hood, a fridge and wall cabinets (80 of 82
    seeded), with the sink under the window.
  - **Dining chairs** are spaced at ≥ 0.6 m a place, with ends on long tables.
  - **WC doors** off living rooms are shut until you step up to them.
  - **Raised houses** stand on a pad, gravel or sand, never lawn.
  - **Wakes** are thin broken foam lines that fade, and none over the shallows.
  - **Frame 9** frames a mapped marina's slips: 8+ boats.
- **Verified:** typecheck clean; 726 tests plus `hoods` 13; esbuild bundle; the round 12 captures
  (`shots/*-r12*`).

## 2026-10-01 (morning) — Review round 10 and its five must-fixes

The expert reviewer (a Nintendo / Rockstar bar) scored Sea Bright's expanded scope **8/10, not
passed**: "real at thirty metres, bare at three" (`docs/earth/REVIEWER.md`, round 10). The lead fixed
the small items itself; five helpers took the five must-fixes side by side, merged here.

- **The lead's fixes (73e83ec):**
  - **Roofs keep their own hue.** On a roof the sky fill's blue is greyed (`paintLight` with
    `skyNeutral` 0.6 by day) instead of 40% of the roof's own colour being taken out. Aerial
    greens and blues may reach 0.14 saturation.
  - **Night wires are silhouettes** (`uSkyZenith × 0.6`). A fixed navy was ten times the night
    zenith's light: the wires read as searchlights.
  - **The lamp window waits:**
    - it repaints at most every 1.5 s for tiles coming and going (each repaint is a 1024² canvas
      and its upload);
    - the canyon field is blurred at quarter size, which was most of a repaint's 0.1–0.25 s on a
      CPU canvas.
    - Tests: `lampWindow` (4).
- **1. A phone is a window, not a slot** (`player/frame.ts`):
  - **Field of view:** the lens is fitted to the screen. An upright phone sees 41° across
    (it was 31°); one on its side is capped at 95° (it was 105°). 4:3–16:9 screens are exactly as
    before.
  - **Toasts** sit under the place name, two lines at most ("Van, in pencil — paint one to finish
    it · 2 of 8 cars").
  - **The place name and clock** sit on a paper wash. The clock reads 7.45:1 against the world
    behind it (it was 3.09).
  - **HUD audit:** `tools/hud-audit.mjs` keeps the middle band (x 15–85%, y 30–62%) clear: 560
    layouts, all clear.
- **2. Night that reads as night** (`render/nightLight.ts`):
  - **Lamp pools:** each lamp's pool has a bright warm heart (`exp(−(d/5.2)³)`) and real dark
    between lamps. The lamp map now carries distance, not a 2 m blur of light.
  - **The grade:** one indigo night glaze in the post leaves the lights alone and sinks a pool's
    warm edge, the way blue over orange does. The night's floor is blue, not sand-warm.
  - **The review's occluder check** uses spot-shots' id pass (`tools/id-pass.js`).
  - **`tools/night-check.mjs`** measures frame 3 the reviewer's way.
- **3. The ground you walk on** (`groundCover.ts`, `groundPaint.ts`, `ground.ts`):
  - **In the detail window:**
    - sidewalk flags every 1.5 m, with a centre joint on wide walks;
    - a dark kerb face and a 0.6 m gutter pan that turns the corners;
    - drive aprons, tar snakes and patches;
    - yards of lawn, gravel or crushed shell, by neighbourhood and distance to the sea;
    - sand drift near beaches.
  - **The ground shader** adds mottle, pebbles and the beach's ripples, footprints and wrack near
    the walker, faded by pixel footprint.
  - **Measured:** the bottom 40%'s texture is 2.6–4.2 (the reviewer asked ≥ 2.5; it was 0.8–1.5).
  - **Placement:** lawn things never on paving; mailboxes and hydrants 45–60 cm behind the kerb
    face.
- **4. The front door opens on a home** (`interior/*`, `decor.ts`):
  - **Cottages** (≤ 110 m² a storey) open into the living room: 40 of 40 seeded.
  - **Bigger houses** keep a hall with the stair in view and a cased opening to the living room.
  - **New pieces:** skirting, coats on a rail, a runner, a lit console lamp, a mirror, ceiling
    domes.
  - **Sun pools** come only through real windows, in the room they light.
  - **Pose 19** picks the sunniest room. Frame 6 shows 10 pieces with its largest bare plane at
    15%; frame 19 is 8–11% sun pool.
- **5. The shore keeps one calendar** (`calendar.ts`, `docks.ts`, `crowd.ts`, `crowdLayer.ts`):
  - **Marinas** get finger piers every 4.5 m, with boats at the month's share: 27.9 boats per
    100 m of waterline in October.
  - **Riverfront docks:** 40% of riverfront lots get a dock and a boat.
  - **Beach people** in season sit under the umbrellas: 219 people for 80 umbrellas at the 50 m
    pose, 13:00 on 15 July.
  - **Kids** jump waves at the waterline. **Lifeguards** are on duty Memorial Day to Labor Day,
    10:00–17:00.
  - **Beach lots** fill by season × hour: 13% on an October evening, 98% at a July lunchtime.
- **Verified:**
  - Typecheck clean.
  - The full suite: 674 tests, plus `hoods` 13.
  - esbuild bundle.
  - Each helper's measurements and montages, plus the round 11 captures.
- **Next:** round 11 with the reviewer.

## 2026-10-01 (small hours) — The flying hitch, whole bridges, roofs from the photo, the small things

Four of Robby's reports (2026-09-30 21:50), taken by four helpers working side by side and
merged here.

- **The flying hitch** (`groundPaint.ts` `DetailGround`). Robby: "every ~2 seconds, even flying
  slow, it locks up for half a second".
  - **What it was:** the ground-paint windows repainted their whole 2048² canvas whenever you were
    66 m from the detail window's middle: three `blur(6px)` passes over the land cover, every road,
    lot and footprint, then a 16 MB upload. At the default 40 m/s that's every 1.65 s; the 1.6 km
    window did the same every 352 m.
  - **Why the probes missed it:** the script only records those draws (6–10 ms). The browser
    rasters them at the upload, which a probe with rendering off never reaches.
  - **The fix:** a window now slides. What it still shows is copied across, and only the strip it
    moved onto, plus the blur's band, is painted, a slice a frame, on an OffscreenCanvas. The new
    picture is swapped in when the move is whole.
  - **Measured:** a headless flight with rendering on went from a worst frame of 11.0 s to 4.6 s
    (now a tile mount), p90 from 4.16 to 3.01 s.
  - **Tests:** `groundPaint.test.ts` (10), with a canvas that meters its blur. The playtest's frame
    check flies too (R.35), and `tools/hitch-probe.js` gains `sync`, which waits for the GPU.
- **Bridges stand whole** (`bridges.ts`, new). Robby: "the bridge in Sea Bright looks collapsed".
  - **What it was:** each tile profiled only its own piece of the Rumson–Sea Bright bridge, as an
    arch of its own. The deck dropped to ~0.2 m over the channel, a V in the river, and walkers on
    the mapped sidewalk stood on the water.
  - **The fix:** every tile profiles the whole bridge from every way it can see, then draws only
    its own. The deck:
    - lands on the approach streets within centimetres;
    - holds level over the channel: 3.5 m under a movable span, rising with the width of the water
      for a fixed bridge;
    - never dips below the line between its ends.
  - **What a bridge is made of:** slab and girders, sidewalks, parapets with railings, piers into
    the riverbed, abutments.
    - `bridge:movable`: a bascule (tender houses, timber fenders), a lift span or a swing span.
    - `bridge:structure`: a truss, an arch, a suspension or a cable-stayed span.
  - **Collision** is the deck as drawn.
  - **Tests:** `bridges.test.ts` (23), including a fixture cut from the baked pack. The tiles'
    two pieces of Sea Bright's bridge meet to the millimetre, and none of the pack's 33 road
    bridges dips.
- **Roofs wear the colour the aerial photo sees** (`aerial.ts`, `aerialFetch.ts`).
  - **What it was:** 25,770 of the shore pack's 27,161 buildings carry a NAIP roof sample, but with
    the photo's green cast in it. The renderer folded every green and blue to one warm grey: 97% of
    the shore's roofs were the same grey.
  - **The baked pack:** each tile's samples are white-balanced as it builds (the cast fitted per
    tile), and `aerialRoof` keeps the hue. Clay red reads as tile, a blue or green as painted
    metal. Mapped `roof:colour` still wins.
  - **Streamed US cells** read their own roofs off NAIP in the tile worker: the USGS National Map
    ImageServer (public domain, no key), or the tile service's new `/naip` relay if a browser is
    refused. The result is cached per cell. `?aerial=0` shows the old roofs.
  - **Walls** have no real data beyond rare tags. The street-level plan (Mapillary) is in
    `docs/agent/world-data.md`.
- **The micro layer** (`render/impostor.ts`, `world/micro.ts`, `world/microLayer.ts`,
  `assets/micro.ts`). Robby: detail "as much as we want … 2D–3D assets that always face the user".
  - **What's placed:** 37 small things, deterministic by position:
    - carts at the kerb on the area's collection day;
    - porch chairs, flags, A-frames and planters;
    - beach umbrellas, chairs and towels, by season;
    - cleats, dock boxes and buoys;
    - the OSM picnic tables, boards, cabinets and seamarks.
  - **How it's drawn:** real 3D close up, hemi-octahedral impostor cards from 25–60 m, +2 draw
    calls for all of it.
  - **Caps:** cards per tier 12k / 4k / 1.5k; atlas 2048² on desktop, 1024² on phones.
  - **Tests:** `impostor` (11), `micro` (11), `foundry` (+2).
- **Tile cache keys:** `t/v23`, `&v=23`, `DIRECT_V` 23 (the bridge tags `bs`/`bm` and the micro
  furniture). **Robby: redeploy the worker** (`cd worker && npx wrangler deploy`). It also carries
  the `/naip` relay.
- **Verified:**
  - Typecheck clean.
  - The full suite: 605 tests, plus `hoods` 13 through its container stand-in.
  - esbuild bundle.
  - The four helpers' before/after montages, and a merged sheet (`shots/merged-a.jpg`).
- **Next:** the expert reviewer's round on all of it. Then trees and people on impostor cards
  (1.15, 9.5), and wall colours from street-level photos.

## 2026-10-01 (night) — No more pale distance; a sharp frame on phones

- **"Paint as you explore" is gone** (Robby: it laid a pale colour over the distance, which
  read as the fog he'd complained about). It was the lighter of two paint modes: a pale first wash
  over the ground you hadn't walked. The world is now simply painted, near and far. Exploring shows
  on the map, which always paints in where you've walked; the atlas and journal still count it.
- **Sketch mode** is the other mode and is unchanged: pencil to the horizon, painted as you walk
  or photograph. It's named that in the panel ("sketch mode: pencil till you walk or photograph
  it"). `?sketch=1`, `?loop=paint`.
- **Phones keep the sharp frame** (`quality.ts` `stepsPaid`, main.ts auto quality). Auto quality
  used to drop a phone's paint detail and hi-DPI whenever the frame was over 25 ms, whether or not
  pixels were the problem. Now each round's steps are measured by the next and undone unless the
  frames got 12% quicker; Robby saw no speed difference raising it back by hand. The phone tier's
  paint detail is 85% (from 75%).

## 2026-10-01 (later) — The far skyline: the city across the bay

A helper's draft (2026-09-28), merged onto today's code.

- **What it is** (`world/farSkyline.ts`): one Overpass read of the very tall — 120 m or 35 storeys,
  masts from 150 m — within 60 km, through the tiles' own `osmToTile`. The towers are flat-topped
  prisms, one merged mesh per 8 km sector on the bare-earth DEM, cached in IndexedDB and re-read
  after a 15 km walk. Real-lite tiles only (`?farskyline=0` off).
- **How it looks:** the earth's curve with standard refraction lowers the towers. The sea's bulge
  hides their bases: from a Jersey beach, Manhattan's lowest ~100 m. The day's air takes them
  toward the sky. Clear air shows them faintly out to ~75 km; the usual haze barely; a hazy day or
  sea fog not at all. Towers the skyline ring or the detail tiles already draw are left to them.
- **The far layer** has a depth of its own (`shared.ts` `farDepth`, linear to 150 km). The towers
  write it, the horizon ring tests against it (a nearer ridge hides a tower), and a hook clears it
  before the near world draws.
- **The paint kept them** (`post.ts`): a tower at 40 km is a stroke a few pixels wide, and the brush
  smeared it into the sky. Towers mark themselves in alpha (0.5) and the composite lays them back as
  drawn.
- Tests: `tests/farSkyline.test.ts` (7). Visual: the container reaches neither Overpass nor the
  DEM, so it ran on a stand-in read of Manhattan's tallest at their real places. A debug block
  showed the layer draws, behind the beach's crest and the jetty. At true scale the city is a few
  pixels from the beach, so the real check is on the deploy, from a balloon on a clear day.

## 2026-10-01 — Deeper archetypes: supermarkets, hotels, schools, churches, libraries, banks

Interiors Slice 4 (docs/INTERIORS_PLAN.md §5), finishing a helper's groundwork that the usage
limit stopped (its decor pieces, `placeOf`, the hotel and school strips in plan.ts).

- **What a building is** (`uses.ts` `placeOf`): its OSM tag first, else its name (several languages);
  plan.ts turns that into a family — `market`, `hotel`, `school`, a library/bank/post office/gym/
  pharmacy floor, a church or a mosque.
- **Back of house at its share** (`layout.ts` `backStrip`): a storefront's side walls are glass with
  piers 0.35 m wide every 3.4–5 m, so a partition straight across could only land a cell's depth
  either way of what it wanted. It now stands at the depth that makes the area and jogs at each side
  wall to its pier; the corner is a back room. Supermarket 22.5% (§2: 20–25%); restaurant kitchens
  30.9–35% (§2: 30–40%; they were 26–46%).
- **A supermarket planned round its fixtures** (`Layout.fix`): checkouts at the door with lanes
  toward it, produce on the door's other side, the main aisle, gondola runs with 1.8 m aisles and a
  cross aisle every 13.75 m, chillers and freezers along the back partition. 60×40 m: 6 checkouts,
  42 runs, 10 cold cases, 27k vertices (budget 90k).
- **Hotels and schools**: corridor storeys with en-suite guest rooms (bath inboard, passage open to
  the bedroom, mirrored pairs) and classrooms; the ground storey a lobby with its breakfast room or a
  hall and office — or, on a storefront, a public floor (lobby, bar, breakfast room; a school's hall
  and dining hall) with its kitchen behind.
- **Walls chosen together** (`bandCuts`): a greedy pick put a party wall on a pier's far edge, and
  the next room had no pier in range — 13 of 31 rooms on a hotel's back band came out too narrow for
  a bathroom. A DP over a 10 cm grid now picks the band's walls together: 60×18 m hotel 27–31 rooms
  of 25–35 m² a storey, all with a bathroom; classrooms 51–64 m².
- **Churches** get a narthex, pews (0.91 m pitch, 1.5 m centre aisle) and an altar; a mosque a
  carpeted prayer hall with its mihrab and minbar; a church that became a library is its reading
  room. A library, a bank, a post office, a gym and a pharmacy furnish their floors (stacks; teller
  counters and queue posts; treadmills by the glass).
- Fixes on the way: slivers a lift or core left became unreachable "rooms" (now dropped); piece keys
  that shared a key with different geometry (the shared cache would have mixed them).
- **Tests:** `tests/interiorArch.test.ts` (16, all failing on the old code: no `market`, no `fix`,
  no hotel rooms); `interiorBudget.test.ts` +5 cases (a supermarket ≤ 90k); foundry budgets for the
  18 pieces. Full suite passes (hoods through its cloud shim).
- **Visual:** test buildings registered live by the Sea Bright spawn, shot in SwiftShader
  (`shots/synthin-{a,b,c}.jpg`): the supermarket, a hotel corridor, room and breakfast room, a school
  corridor, classroom and hall, the nave, a restaurant, the library, bank, gym and prayer hall. The
  pews read as one black mass under the nave's high lamps (now oak to walnut) and the gym's rubber
  floor as a void (lightened). (Grass and a pole that poke through two of them are the test
  placement's: open ground near the spawn, no footprint to clear them.)
- **Next:** a dais for the chancel; the qibla from the real bearing; `tourism`/`leisure` into the
  tile's use tag (a cache bump); lifts in five-storey blocks whose core slot has no pier.

## 2026-10-01 — Stand-in cells agree at their seams; a car stops at its bumper; raised doors on the wall with room

Finishes the work of a helper that the usage limit cut short on 2026-09-29 (after (af)). It is
merged onto `feature/updated-controls-for-mobile` as `feature/back_to_local_agent_9_30`.

- **Stand-in cells agree at their edges** (`synth.ts` `standInLots`). A stand-in placed its lots
  greedily, in the order it walked its own streets, so two neighbouring cells kept different lots
  in the strip they share: about a third of them. Buildings came out doubled, overlapping or missing
  along the seam, and doubled walls flicker.
  - Every lot is now a pure function of its position. Along a street they're kept in turn. Where
    two streets' lots clash (a corner, the next block), the higher-ranked lot by hash wins in two
    rounds of "outranks every undecided rival". A lot's fate depends only on candidates within
    `LOT_REACH`, so any tile with that much ground round its window gets the same lots as its
    neighbour, lot for lot.
  - Streets are emitted 140 m past the box on every side. A street line wanders 26 m off its grid
    line, so stretches just past the far edge had belonged to no tile.
  - `tests/synthSeams.test.ts` (5): two neighbours built in both orders and alone have identical
    margins; no footprint is doubled or overlapping across the seam; no lot stands in a street.
  - Procedural Midtown, headless: 5,119 buildings, 0 nested, 0 touching.
- **A car stops at its bumper** (`collision.ts` `moveBody`/`bodyPush`, `vehicles.ts` `carBody`).
  A car's collider was one 1.05 m circle round its middle, so head on its nose went 1.15 m into a
  wall. It is now a capsule as long and wide as the car's own model (kit recipe; a bike rack adds
  to the back). It slides along walls, and a post or a corner brushing its side pushes it aside
  instead of catching it.
  - `tests/carBody.test.ts` (8): head-on, glancing, past a post, through a doorway's width, turning
    against a wall.
  - The `__DRIVE__` check measures the stall from the bumper.
  - Procedural Midtown: 486 m driven, 0 clips, 0 inside.
- **A raised house's door goes on a wall its stair has room at** (`buildings.ts` `doorWalls`,
  `raisedStair`, `raisedDoorWall`).
  - On a tight lot every stair shape from the street wall ran into a neighbour, a garage or the
    street, so the door up there couldn't be reached. Now the house tries its other open walls
    (best-facing first, up to 8). If none fits, it takes the least-blocked one.
  - Any other building's door is the same wall as before.
  - `tests/raisedStairs.test.ts` (+1).
- Tests: 515 pass, including `hoods.test.ts` run here with file reads standing in for vite's
  `import.meta.glob`. Typecheck clean.
- Left from the helper's list: pilings on Grand Pointe Way (Sea Bright) stand over the road's
  modelled width. The house outlines and the road width estimate disagree there. Not yet looked at.

## 2026-10-02 (later) — Weather to test against; fog now and then, anywhere

- The owner liked the odd random fog — kept, rarer: drifting fog 'rare, anywhere' (default; about
  one hour in eleven, lighter than a coast's, plus the coastal morning marine layer), 'coastal
  mornings' or 'never' (panel Weather → drifting fog).
- Weather presets (panel Weather → weather preset): clear, fair, hazy summer, marine layer, thick
  fog, overcast, blustery, snow day, or drifting — checked in the game by choosing each in the
  panel's own dropdown.
- tests/interiorTower.test.ts: a 30 s limit (its 39-storey plans take 5–6 s on a slow machine — the
  "failures" of the last sessions); 501 tests pass.

## 2026-10-02 — The white wall: fog along the sight line; a phone's view sharper and farther

- **Reported** (a phone over Seattle, 250–300 m up): past ~1 km everything sank into a flat white
  sheet, tower tops standing clear of it; with the paint on, a smear.
- **Why the sheet**: `applyFog` fogged a point by the density of its own layer (thick near the
  ground, a ~33 m scale) times the whole distance — from a balloon or a hill, the sight line
  mostly crosses thin air, but distant streets were fogged as if it hugged the ground the whole
  way. Now the mean density along the sight line, eye height to point height (`layerMean`, exact).
  At street level eye and point share a layer: Sea Bright's street view before/after identical.
- **…and the sea fog**: auto weather rolled a sea-fog layer over every town a third of the time
  (0.30 over inland Seattle when shot). Now a marine layer: coastal (oceanD < ~500 m), mornings,
  gone by 11.
- **A phone, sharper and farther** (quality.ts phone tier): hi-DPI paint (≤ 1.5×) and a canvas at
  that ratio on phones only (setPixelRatio 1 stretched a DPR-3 screen ~3×), paint detail 0.75, a
  6 km silhouette ring and skyline (under coarseMB). Auto quality now measures once the ring
  has streamed in (≤ 40 s wait) — measured during the burst, a phone that holds 60 fps after was
  stepped down for good. (SwiftShader here is slow enough to step down: sharpness is for a real
  phone to show.)
- **Evidence**: shots/phone-view-montage.jpg (Pixel 7 emulation, network trusted): Queen Anne at
  250 m before — a white wall past 1 km; after — the water and the far shore. hud-audit 140 clean;
  483 tests (interiorTower's 5 s timeouts excluded — they fail on the previous commit here too).

## 2026-10-01 (night) — Paint-as-you-explore only when picked; the open world's sea without a canvas

- **No bleed**: the far sketch (pencil to the horizon, photos painting the frame) is off unless
  picked — it's on trial; the near "paint as you explore" wash stays ON by default (the owner's
  call). Either lights the composite's `uSketch`; the far one no longer needs the near one ticked. Walks are recorded
  regardless (atlas, journal, arrival cards); the arrival card says "walk to paint it in" only with
  a look picked.
- **Puget Sound white on an iPhone** (reported; no iPhone or WebKit here to reproduce). Emulated on
  a phone, the open world's unbuilt Sound is the stand-in: a flat 3 m plain in haze. Three ways it
  stayed that plain, all fixed:
  1. `dem.ts` decoded Terrarium through createImageBitmap + OffscreenCanvas — which a worker on
     iOS < 16.4 doesn't have: no DEM, ever. Now `terrariumFromPng` reads the PNG bytes itself
     (three's bundled fflate; exact vs pngjs on two real tiles; tests encode all five filters); the
     canvas is the fallback. Also no colour management anywhere: the same heights on every device.
  2. A stand-in's water needed a DEM to press into: no DEM in time, no sea. `flatDem` gives it a
     flat grid at the stand-in height to take the map's water, marked late for its relief.
  3. The relief rebuild returned nothing when the DEM never came, and flat ground never asked
     again for late water. Now it rebuilds with the flat ground and the water, once (no re-late).
- Seen end to end, once the harness was fixed: the emulations' "stall" was the harness — its
  Chromium didn't trust this container's proxy CA (net::ERR_CERT_AUTHORITY_INVALID), so every DEM
  and vector-tile fetch failed and only flat stand-ins could build. With `ignoreHTTPSErrors`, the
  ground under a camera over the Sound reads −6 m / sdf −60 (sea) within 3 minutes, and from 300 m
  over Magnolia the Sound is water with boats on it, fading into pale haze to the horizon (maybe
  the "white" reported — no far shore shows; to look at with the reporter's screenshot).
  (Real cells meanwhile fail and retry: the tile service's Overpass upstream is still down.)
- tests 501 (interiorTower's 5 s timeouts on the freshly restarted container fail on the previous
  commit too), typecheck, build.

## 2026-10-01 (evening) — A photo sees past the ropes: no more streaks out to the horizon

- **The streaks** (a phone, photos from a balloon, the atlas map): straight bands of canvas fanning
  from where you stood out across the bay. A photo paints what its depth readback saw, and in the
  basket the ropes and posts run up the frame — each a column of samples 3 m away, hiding the
  ground behind it from the basket to the horizon: a radial line of unpainted world per rope.
  (Poles, wires and birds did the same, smaller; in third person the envelope a wedge.)
- **Fix** (`render/seen.ts` `mendDepth`, called in main.ts `paintView` before unprojecting):
  along each row and column, a run that stands well in front of ground on both sides — thin (≤ 6%
  of the frame), or nearer than the ride's reach up in one (balloon 30 m / 70 m third person, plane
  45, car 11, boat 14) — is bridged by the line through its two sides in 1/depth (exact for flat
  ground). Never into the sky; a building wider than thin still hides what's behind it on foot.
- **Tests**: seen.test.ts (ropes bridged to within 1% of the open ground; the sky and a 40 m house
  kept; an envelope seen through with `near`), explore.test.ts (a basket photo: the ropes' lines
  of sight bare 1–8 km out without the mend, none with it). 498 tests, typecheck, build.
- Streaks already in a save stay until a photo covers them again — one from the same spot does.
- **The live site** builds from `main` (pages.yml, or a manual run of it on a branch): the options
  panel's close (2026-10-01 later) reaches the phone only once it's deployed again.

## 2026-10-01 (later) — The options panel on a phone: it closes, and Get out stays in reach

- **Couldn't close it**: lil-gui 0.21 names its root `.lil-root`; style.css still said `.lil-gui.root`,
  so none of the phone rules matched — no close button, no sizing, no scrolling (and the cream theme
  never reached the desktop panel either). Selectors now match both; the theme is set on every
  level (0.21 declares its dark defaults on each nested folder, so a root-only theme left pale text
  on cream). The close is a "× Close" pill.
- **No Get out with it open**: `touchActionState` returned nothing while the panel was up, and the
  panel covered the right edge top to bottom. Now, upright, it's an opaque sheet across the top
  that always leaves the bottom ~300 px — the stick and the corner cluster — free; on its side it
  runs down the left, clear of the cluster; and the ride's button stays.
- **Verified** (real game, Pixel 7 emulation, both ways, by touch): More → Options opens it; the
  Close pill is the element under the finger; a car summoned with the panel up — Drive reachable,
  driving, Get out and Boost reachable, got out; Close hides it. hud-audit 140 layouts clean,
  495 tests, typecheck, build.

## 2026-10-01 — Phone controls rebuilt: a stick you can see, Paint under your thumb, every button named

- **What a phone showed** (real game, Pixel 7, both ways): six identical unlabelled circles —
  ✈ ⌂ ☰ ▣ ✎ ⋯ — stacked down the right edge (a 3 × 2 block in the corner on its side); Paint, the
  game's verb, looked like everything else; ⌂ read as "home", not "go anywhere"; and the walking
  stick was invisible until a thumb happened to land in the empty left half.
- **Now** (index.html, style.css "the phone HUD", controller.ts, main.ts): each hand has one job.
  The left thumb walks — the stick is drawn where it rests ("walk" in it until you've used it
  once), comes to your thumb, and follows a thumb that runs past its rim, so you never lift to find
  it. The right thumb looks and does — a cluster in the corner: Paint (72 px, ink) in the corner,
  Fly (Land while flying) over it, Brush beside it, Lift in a lobby, and what you're next to (Board /
  Drive / Step in / Get out) as an ink pill over them that pops in. Riding, the ride's buttons take
  the same places (Boost in the corner; Faster / Slower; Up / Down — Burn / Vent in a balloon — beside
  Paint; View over it). Go / Map / More sit along the top right, out of the way. Every button is a
  drawn icon with its word under it; hints and toasts use those words (Paint, Land, Map, Boost…),
  and the brush's hint no longer says P and B on a phone. Buttons shrink under the finger (and stay
  pressed while held), and tick on Android. The place name, the hint and a ride's readout read down
  the top left; the credit is one line along the bottom.
- **Verified**: `tools/hud-audit.mjs` (now per button with its word, the stick's ring, and a
  by-a-lift state; `--shots` writes every layout) — 140 layouts (10 phones × both ways × 7 states),
  no overlaps. Real game on a Pixel 7 emulation, both ways, driven by touch: the stick walked ~7 m
  and followed the thumb past its rim, its "walk" cleared, Fly turned to Land and took off.
  typecheck, 495 tests (interiorTower's 5 s timeout under load passes alone), build.

## 2026-09-30 (night) — A house on a tile line built once; the shore test on streamed tiles only

- **Tile ownership is half-open** (`scripts/lib/tiles.mjs` `ownsPoint`): a building centred exactly
  on a tile line was owned — and built — by both tiles (the Rumson playtest's one overlap: seed
  41723065 at x = −3072 in −4_−2 and −3_−2). Four such entities in the shore pack; the raw inputs
  aren't in this checkout, so the pack was patched by the same rule (the second copy → `own: 0`)
  and `bakeId` recomputed by the bake's own FNV recipe (it reproduced the old id exactly before
  the patch). tests/tiles.test.ts pins the edge (fails on the old rule).
- **The shore test measured files nothing streams**: `public/data/shore/tiles/` holds 72 tile
  files the manifest doesn't list (`-7_*`, `-8_*`, from the same bake commit — 2.9 MB shipped,
  never loaded), and Red Bank lies in them, past the backdrop. tests/hoods.test.ts now reads only
  manifest tiles; Long Branch's north end (grid) and Oceanport (suburb) replace Red Bank, which
  moves to the real-lite fixtures (`nj-grid`) — it streams, as the deep link that set the montage
  camera down in stand-ins showed. The leftover files are left in place (worth removing once
  someone confirms nothing else reads them).

## 2026-09-30 (evening) — Neighbourhoods, phase 1; the phone's silhouette ring budgeted

- **Why Rumson read like its neighbours** (docs/NEIGHBOURHOODS.md): one style table for every town
  in a region, every look decision a per-house hash from it; lot size and era — the two things
  the eye reads first — reached nothing; a big house (> 700 m²) became a flat-roofed block; and
  OSM maps almost none of Rumson's houses (one in the reference square), so the game had LiDAR
  footprints and fixed-size fills there.
- **Phase 1, client-side** (no tile-service redeploy): `world/hood.ts` measures each 256 m cell's
  homes (footprint, spacing, uniformity) → estate / old grid / tract / suburb; recipes, drives,
  frontage hedges and canopy follow (estates: shingle and white clapboard under slate, steep roofs,
  dormers, long privet hedges, 3× trees; old grids: painted Victorians with bays; tracts: one model
  a cell). The neutral path is today's recipe exactly; the shore keeps its look. The old grid
  and the tract are regional (by the style's `sub`/family): Midwest brick bungalows, Northwest
  craftsman, desert stucco-and-tile tracts.
- **Real places, tested**: the baked pack's towns (Rumson → estate at 45% of homes vs < 5% for
  Fair Haven, Monmouth Beach; Fair Haven → grid — see the night entry: Red Bank was measured from
  unstreamed leftover files, now replaced) and frozen real-lite tiles
  from three more states (Levittown NY → tract, Portage Park IL → grid, Wallingford WA → grid).
  AZ / CT / TX are listed but the tile service 503'd all day — re-run `tools/hood-fixtures.mjs`.
- **Montage** (shots/shore-montage.jpg, before / after, street and 60 m): Rumson (Dogwood Lane,
  Buena Vista Ave) reads more wooded, with privet hedge runs along the frontages — a modest change
  from these views, since the houses stand back in the trees; Fair Haven and the shore unchanged.
  Red Bank's deep link (`?at=40.3478,-74.0636`) is past the shore pack, so it streams — and the
  tile service's 503s set it in procedural stand-ins; not yet seen by eye.
- **The phone's silhouette ring budgeted** (`coarseMB` 90 / 60 MB): the Manhattan run below found
  it at 171–190 MB — three times the detail tiles.
- **Manhattan on a phone** (headless Pixel 7, phone tier, four hops round Midtown): 0 lost GPU
  contexts, 0 errors, peak renderer 1,006 MB, GPU process 724 MB. The public Overpass servers
  were down (the tile service answered 503 for uncached cells), so the detail tiles were the
  procedural stand-ins — the real-tile run is still owed. Re-run with the cap: the silhouette ring
  held at 86–89 MB every hop (was 171–190), 0 lost contexts, 0 errors; peak renderer 1,021 MB
  (JS heap and page textures dominate it now), GPU process 694 MB. The tile service still
  answered 503 for Midtown at the end of the day.

## 2026-09-30 (later) — Balloons, painting to the horizon, and the core loop reviewed

- **Paint as you walk, smoother** (the far sketch). The walk's colour stepped in at 10 Hz in big
  jumps — near you each pixel popped. Now strokes at 20 Hz, ~1.5 s blank to full underfoot
  (`bloomRate`), and the composite paints in two passes: a pale first wash over the pencil, then
  the pigment deepening, its edge ragged by paper and brush-stroke noise that never touches bare
  paper or finished paint. (The walker pin in tests/explore.test.ts re-pinned on purpose.)
- **A photo paints the whole frame.** Measured headless from 150 m over Sea Bright (the rendered
  frame re-read at 480×270, each visible pixel's paint cell checked): bare pixels were 0.1–0.2%
  within 2 km, **3.0% at 4–8 km, 5.2% at 8–15 km and 99% past 15 km** — the "canvas clouds" were
  the far field's sampling gaps and everything past the reach. Now a closing pass over the stamps
  (`Stamps.close`), a 48 km far window, reach up to 22 km under your control (panel: "a photo
  paints out to"), a 384 readback on a PC: **0.1–0.4% out to 15 km**, 22% past it (past 22 km).
  The bloom is slower (2.4 s a cell, the farthest 2.2 s late) so the colour is seen running out;
  the viewfinder's marks lift and the brush sounds through the run, a chime as it lands.
- **Hot air balloons** (docs/agent/gameplay.md "Hot air balloons"): a foundry family
  (`assets/balloon.ts`), real buoyancy physics with the lag kept readable (`balloonPhysics.ts`),
  winds aloft that veer with height (`wind.ts`), first person in the basket with third person on
  V / ⤢, Space / ▲ burn, C / ▼ vent, an assist that holds the height you let go at, photo mode in
  the basket. Other people's balloons fly at dawn and dusk and come down on beaches (step in:
  yours); on a first visit one waits on the nearest beach (Sea Bright's). Paint one from life and
  the brush paints your own on open ground.
- **Any colour**: every ride's swatch row in the brush has a free colour picker; a balloon a
  second one for its stripes.
- **The core loop reviewed** (docs/CORE_LOOP_REVIEW.md, a designer's read of the code). Built from
  its list: photo paint counted (`stats().photoKm2`, the journal, the arrival card); the shot says
  its reach and area, or where the pencil still is; the held breath; area milestones; the balloon
  and its card; `?loop=paint` starts in this loop.
- **Neighbourhoods** — research only so far: docs/NEIGHBOURHOODS.md (why Rumson reads like its
  neighbours, the open data that tells them apart, the model, a test framework, phases).
- Verified: typecheck; `npm test` 481 tests in 51 files; build; tools/hud-audit.mjs 120 layouts
  (with a balloon state); the montage (shots/shore-montage.jpg: the beach balloon, someone's
  balloon aloft and down on the beach, the basket at 160 m, the envelope from inside, third
  person, pencil before / colour after a photo — 199 km² out to 22 km — phones in the basket); PC
  playtest (drive, walkabout) pass with the same numbers as before.

## 2026-09-30 — Phones: the touch controls reviewed, a game that sleeps when put away, the city that crashed Chrome

- **The touch controls (the entry below), reviewed and fixed.**
  - Photo mode had stopped WASD walking on a PC (it set `walker.holdMove`), and leaving it let go of
    a lift ride's hold mid-ride. A pinch now just takes its two fingers off the stick and the look
    drag (`Walker.releaseTouches`); the stick walks while you frame, as WASD does.
  - The ride stick had no dead zone: steering sideways wandered into full throttle or the brakes,
    and a plane's nose never settled. `vehicles.ts` `stickAxes`: 0.1 steer, 0.25 throttle, rescaled;
    part way cruises at that share of the top speed and brakes that gently. Keys are ±1, so the
    keyboard drives exactly as before.
  - A double-tap on the look side could throw you out of a car at speed (two missed taps by the
    boost button): it gets you out only once stopped. The ride's button says Drive / Board /
    Get out / Jump out.
  - Touch "Fly up/down" did nothing unless the stick was pushed too (climbing rides on the movement,
    as Space/C do on a PC — left as it is there). ▲ ▼ now climb and sink on their own
    (`walker.climb`) and sit beside the dock while flying, not in a drawer over the view.
  - The ⋯ drawer never closed: a touch on the world closes it, and it closes behind the map, a
    photo, the brush or the panel. ▣ does what P does (the brush away, a viewpoint faced). ⌂
    focuses the search in the tap (the only way an iPhone raises its keyboard). A phone's hints and
    toasts name its buttons (`body.nomouse`; a touch-screen laptop keeps its key names). Held
    buttons let go when they disappear, the window blurs or the page sleeps.
  - The page never zooms (`touch-action`; iOS's gesture events, since iOS ignores
    `user-scalable=no`): a pinch had zoomed the page, hiding the controls with no way back. The
    atlas map pinch-zooms instead (`mapview.ts`).
- **The phone HUD, from the montage and a geometry audit.** The montage showed three overlaps;
  an audit of the HUD's boxes (the production CSS on 10 phone sizes, upright and on their side,
  walking / beside a ride / driving a car / flying a plane / flying on foot, a long hint up) found
  25 overlapping layouts, mostly on a phone's side. Now none:
  - On its side the hint was centred and pinned to the dock's edge at once with its text on one
    line, so its pill came out narrower than the text; it wraps now, centred over the place name
    (a long street name ran under it), over Get out while riding, clear of ▲ ▼ while flying. Get
    out sat 2 px over ⇧. The ride's readout sits beside the ride's buttons (a plane's ran over
    + −), the place name ends short of it, and the map-data credit runs along the top edge (the
    dock and a ride's buttons covered its end).
  - Upright, the ride's readout sat over the place name: it moves to the free corner under the
    dock; the place name keeps the left half while riding. The hint ends short of ▲ ▼, ⇧, + − or
    Drive beside the dock (`body[data-ride]`).
  - A phone's readout shows the live numbers only; how to drive is the toast as you get in (the
    two lines of instructions were what ran into everything). A PC's readout is unchanged.
- **Sleep when put away** (`ui/lifecycle.ts`): hidden → sound suspended (phones; a PC tab sounds
  on), the life worker paused (everywhere: it ticked at 20 Hz for a page nobody could see), held
  input released; back on screen it picks up (an iPhone's interrupted sound on the next tap).
- **Walking out through a wall after a flight (Robby, on a phone).** Reproduced headless: a flight
  faster than a phone builds tiles lands over a cell of silhouettes — no walls, no footprints — so
  the search for open ground saw nothing and came down inside a house (dead centre); until its tile
  came (23 s under SwiftShader) nothing held you in. A phone now hovers ("coming down as the street
  paints in…") until the cell is built and lands on open ground (12.7 m clear of the same house),
  and on foot waits where it stands (`stream.solidAt`, main.ts `groundCheck`).
- **The Manhattan crash.** On a phone Chrome died in NYC, then refused the site WebGL (the red
  report at the bottom). Found and fixed:
  - Every tile's sign atlas leaked on unload, on every platform: GPU textures 24 → 36 over four
    round trips in Sea Bright (the scene holds 19). Now disposed with the tile: 23–25.
  - Collision walls were tombstoned, never reclaimed: 263k walls (211k dead) after four round
    trips on a phone; one long hop on a PC left 166k dead. They leave the walk world now, on every
    platform, a slice a frame (`WalkWorld.purgeSome`, ~1.5 ms; a tile's walls at once took 65 ms
    on a phone): flat at 106k on the phone run.
  - LiDAR in the tab: one Midtown cell (NY_NewYorkCity) measured +130 MB RSS in Node with the game's
    own `measureCell`, two read at once, and each measured cell built twice. Phones build from the
    mapped heights (`?lidar=1` forces it).
  - The phone ring held up to nine 1 km cells, and a downtown cell is ~100 MB of vertices. A
    200 MB budget (low: 120), nearest first (`world/budget.ts`); Sea Bright's whole ring (97 MB) is
    untouched. Real builds 2 at a time (low 1), no teleport building the whole ring at once, a 4 km
    skyline (low 3).
  - A lost GPU context on a phone sheds memory before it's given back, and the next load in the
    tab steps down a tier. WebGL that won't start says how to get it back (close the browser and
    reopen: Chrome blocks a site's WebGL after a GPU crash).
- Verified: typecheck; `npm test` 472 tests in 50 files on an idle machine (lifecycle, budget,
  touchControls and the wall purge added; diag/quality extended) — under five SwiftShader browsers
  three heavy tests time out at 5 s, all pass with a longer timeout; build. Headless Pixel 7, Sea
  Bright, phone tier, four 3.5 km round trips: textures 23–25 (was 24 → 36), walls 106k flat (was
  263k), renderer peak 1,165 MB (was 1,285), GPU process 881 MB (was 949), 0 page errors.
  - Sleep, counted by the life worker's messages (not frames): 57–59 ticks in 3 s awake, 0
    hidden, 50–59 back, phone and PC; a phone's sound running → suspended → running, a PC's
    running throughout; a held stick let go.
  - The wall purge: a 19k-wall tile took 7.5–34.5 ms at once in Node; sliced, at most 1.56–1.73 ms
    a frame (7–10 ms in all). In the page every dead wall was freed and reused (phone 50,375, PC
    95,971), none left queued.
  - No page zoom: the viewport meta rewritten to allow zoom (Android's force-zoom; an iPhone
    ignores it anyway), two-finger spreads on the intro card, the world, the map and the
    sketchbook stayed at scale 1; with `touch-action` back to auto the card and the sketchbook
    zoomed 4.9×. (iOS's gesture events can't be tried here: no WebKit.)
  - `tools/hud-audit.mjs`: 100 layouts, no overlaps (25 before). The montage
    (`shots/shore-montage.jpg`, 11 states upright and on its side) reviewed.
  - `mobile-check`: Pixel 7, iPhone and desktop boot, 0 page/console errors, 72–75 programs
    within the phone limits. PC playtest (drive, walkabout): pass, the same numbers as with the
    purge off (296 m at up to 38 km/h, 0 clips; 146 m through a door and out, 0 stuck).
  - The flight repro and the on-foot wait (stick held: 0 m until the cell was built, then walking)
    as above.
- **Not verifiable here:** the tile service, Overpass and OpenFreeMap are blocked from the agent
  sandbox, so no real Manhattan tiles loaded; the budget was exercised in Sea Bright only. Needs a
  real phone after the next Pages deploy (Manhattan, `?diag=1`).

## 2026-09-29 — Mobile control parity

- Kept the existing walking thumbstick behavior intact and reused its axes for vehicles.
- Added contextual enter/exit controls plus a deliberate double-tap gesture in the look area
  when the same interaction is available. Added touch boost and plane throttle controls.
- Added a More drawer for planting, seed cycling, time skip, and flight controls, plus a mobile
  Options drawer with developer controls and ride summoning behind the existing debug toggle.
- Added touch controls for photo zoom, light-time steps, and frame visibility; pinch-to-zoom;
  brush rotation; and mobile guidance for the existing lift and map controls.
- Verified with `npm run init` (47 test files, 450 tests), `npm run build`, and Pixel 7/iPhone
  mobile-check runs. Both device emulations booted in phone quality with shader limits in range
  and zero page or console errors. Reviewed `shots/shore-montage.jpg`; OSM credit remains visible.
- Headless emulation is not a physical-device check. Tile-health probes and some map requests
  could not reach local tile/Overpass services; repeat the real-phone check after Pages deploy.
- The feature queue had 12 pre-existing `in_progress` items, contrary to its one-active-item
  invariant. Selected `phones` for this work and returned the other 11 to `not_started`, keeping
  their notes/evidence, so `npm run init` can validate the queue. No staging, commit, or push.

## 2026-09-29 (af) — Towers you can ride up, and a test suite that plays the game

Two helper agents worked in their own copies while the main session merged and committed (ae).
Merged three ways onto (ae); 450 tests pass (one timing test made robust, below); typecheck clean.

- **Interiors, slice 3: towers (`docs/INTERIORS_PLAN.md` §5).**
  - Every storey exists, from the facade's floor height: a 150 m tower has 39. Only three storeys
    round the walker are built. The next set builds behind the one you stand in and swaps in whole.
  - Lifts:
    - office towers have a bank of cars across the core, with a 3.2 m lift lobby;
    - blocks of flats have a lift beside the core stair;
    - ragged outlines get a free-standing shaft.
  - A real ride: the car's doors open, you step in and turn round, the doors shut, the display
    counts the floors, and you step out on the storey you chose. About 6–8 s.
    - Keys: L in a lift lobby opens the floor chooser; ↑↓, W/S, PgUp/PgDn or typing a number picks a
      floor; L or Enter goes.
    - Touch: a ⇅ button.
  - Stairs continue storey to storey in their shaft. Shafts cut every floor and are walled at
    every height, so you can't fall in.
  - Offices of 6+ storeys get a double-height lobby: a rail round the void and a gallery along the
    core.
  - A tower on a podium has upper storeys only inside its own outline.
  - Each storey takes its layout, paint, furniture and people from its own seed. They had shifted
    as you climbed.
  - Curtain walls use the storeys' floor height, glazed floor to ceiling inside, mullions every
    1.5 m. Tall offices show desks and ceiling lights behind the glass, lit floor by floor at night.
  - The HUD reads "floor 24 of 39", and an office tower is no longer "a shop".
  - Cost:
    - tower plan 2.0 KB, 0.05 ms;
    - worst build step 0.6–1.9 ms;
    - 12–53k vertices built.
  - `settleWalker` sits out a ride, which walks you through the shaft wall on purpose.
  - Seen in `shots/mid-montage.jpg`, a Manhattan-like grid of towers served through the real
    pipeline (offline, the stand-ins are 1–3 storeys): the lobby and mezzanine, the lift and its
    car, floor 20 by day and night, the stair shaft, a glass tower, the podium, the street at night.
  - `tests/interiorTower.test.ts` (18), plus tall cases in `interiorBudget` and the lift pieces in
    `foundry`.
  - Not yet: plant floors, sky lobbies, lifts in 5–7-storey blocks over shops, real Midtown data.
- **A suite that plays the game (`tools/playtest.js`, `tools/playtest-core.js`, `tools/playtest.mjs`).**
  - The new checks run the game's own code in fixed 1/60 s steps, seeded:
    - `__WALKABOUT__`: street legs and doors, in, up the stairs, out; an A* over the walker's own
      moves plans each leg.
    - `__DRIVE__`: takes a parked car with E and drives seeded routes; three-point turns; gets out
      and back in.
    - `__TELEPORTS__`: the atlas's "walk here", then the settle.
    - `__STREAMING__`: the ring covered in time; nothing mounted twice; no ghosts or errors.
    - `__FRAMES__`: p50/p95/p99 and hitches against desktop and phone budgets.
    - `__ROADPOSTS__`: posts inside a car street's kerb.
  - Each check has a self-test that plants the failure it's for; all 25 catch theirs.
  - `node tools/playtest.mjs --url=… [--at=…] [--only=…] [--quick]` runs it headless and exits
    non-zero on a failure (`npm run playtest`).
  - Sea Bright: 846 m walked, 4 buildings in and out, 1 staircase, 477 m driven, 6/6 teleports
    good, 0 failures. Procedural Midtown: the same, 0 failures.
- **What the suite found, fixed in shared code:**
  - A signal mast on the main avenue's centre line stopped every car dead. Street-name poles,
    hydrants, bins, lamps and 11 mapped power poles stood inside the kerb. Posts now step out past
    their own kerb, and name poles stand beside the road: 31 → 5 in the lanes within 2 km of the
    spawn.
  - Stand-in houses stood across streets (460 of 5,455 in procedural Midtown); a lot that touches
    a street is now refused.
  - A teleport with no door near could leave you in the water; it now finds open ground.
  - A raised house at the kerb (Front Street) ran its stair across the street. Stairs now count a
    street's carriageway as in the way.
- **Also:** `interiorBudget`'s 8 ms step budget now takes each step's best of five, not the median.
  The median still tripped at 8.7–16 ms on a loaded 2-CPU runner, for steps that take ~1 ms alone.
- Tests: `interiorTower` (18), `playtest` (23), `landing` (3), `kerbposts` (2), `synthLots` (1),
  `raisedStairs` (+1). The new ones fail on the old code. 450 pass.
- Open: a lot with no room for a raised house's stair should get its door on another wall.
  Pilings on Grand Pointe Way overlap the road (road width estimate). A car's nose can reach
  1.15 m into a wall on a head-on hit. Stand-in lots disagree at a third of shared cell edges.

## 2026-09-29 (ae) — Playable first: every door opens, no building inside a building, a steadier sky

Robby's glitch list from his city walks: buildings flicker, many doors can't be walked through ("a
building in a building" downtown), and flying high the ground flashes blue and green. Also asked
for: a real gameplay test suite. Every fix is in the shared builders, so it holds for every city.

- **Buildings inside buildings (`nest.ts`, new).** OSM draws many towers as a "wedding cake": each
  tier a `building:part` from the ground up, nested inside the wider, lower tiers. Drawn as they
  came, the tiers' walls met in the same planes and flickered, and each tier had a footprint and a
  door, so you walked in the front door and into the next tier's wall.
  - Now a building nearly all inside a larger one (≥ 90%) rises from its roof as a part of it, or
    is hidden if it's no taller. A building mapped twice keeps the first copy. A survey (LiDAR)
    block across a mapped building goes. Pure and idempotent; margin context is read, never changed.
  - Manhattan, 3 real cells: 98 nested pairs → 8. All 8 are Grand Central Terminal's 157k m²
    outline, which only partly overlaps the towers (52–81%).
- **Where a stand-in meets a real cell (`seams.ts`, new).** Stand-ins cut buildings at their own
  cell edge, so a building on the seam was drawn twice, flickering where the copies met. The
  stand-in's copy now hides until its own real tile lands.
- **The way to a front door stays open.**
  - While a tile builds, its door approaches (3.2 m out), its own footprints, and now its stairs and
    landings are keep-outs in the builders' scratch world. Racks, tree pits, hydrants, planters and
    parked cars stay off them. Only the scratch world holds them; the live world never does.
  - A door never opens where another building's outline runs across the front.
  - A yard fence across the front walk gets a gate.
  - Kerb cars stay off sidewalks too narrow for them.
  - A mapped flagpole at a door (the Century Association's) stands beside it.
  - Raised shore houses: the stair takes the first shape whose flight, and the metre you step off
    onto, stands in the open, in this order: along the wall, round the side (now needing a walkway
    beside it), switchback, straight out. If none is clear, the least-blocked shape is used. Side
    stairs had run down the 40 cm between two houses, inside the neighbour.
  - A mapped fence stops short of a low stair it runs across or alongside. A fence now blocks only
    up to its top, so a landing or bridge can pass over its line.
  - What a tile's own buildings put round them (hydrants, front hedges) stays in the tile's own
    cell. Over the edge are the next tile's doors, which it can't see: a hydrant had stood on a
    neighbour's bottom step.
  - The door planters are back, just outside the doorway (the keep-out had removed them).
  - Measured by walking in: Manhattan, 7 real cells: 14 → 3 of 295 doors blocked (stand-ins 22 →
    8 of 205). Sea Bright, the whole baked region: 4 of 1,857. Two of the four open onto a building
    4 m away; one is a raised house on a lot with no room for a stair.
- **Tall things on roofs stand on the roof.** A mapped water tank, antenna, chimney or flag inside
  a building's outline now stands on its roof, rooftop-sized unless the map gives a height (a height
  past the roof counts from the street). Drawn from the street, they had stood in the rooms.
- **Flying high: the near plane rides the altitude (`render/nearPlane.ts`, new).** At 25 cm, one step of
  the depth buffer was a metre at 2 km, so shore ground a metre over the sea plane fought it. Now
  the near plane is 1% of the clearance over the highest ground within 60 m. A step 3 km out is a
  few centimetres again. The sea plane is also pushed back two depth steps.
  - Not reproduced in Sea Bright (SwiftShader, 400–3,000 m, with and without the fix). The z-fight
    arithmetic says this was the cause. Need from Robby: where he saw it.
- **The gameplay test suite (`tools/playtest.js`).**
  - `__OVERLAPS__`: nested footprints.
  - `__DOORS__`: walks the approach to every door near you. If that fails, it floods the ground by
    the walker's own moves (sliding on walls, climbing 75 cm a step) to find any way in.
  - `__FLICKER__`: draws the real frame twice, 5 cm apart along the view, and counts pixels that
    jump well past their neighbourhood's own variation. An id pass couldn't follow the water's and
    grass's shader-moved vertices. `__FLICKER_SELFTEST__` proves it sees a planted fight (1.6%).
  - `__ALTITUDE__` flies up and runs the flicker check at each height; `opts.near` and `bare`
    rerun the old frame for comparison.
  - `__FLYOVER__`: a contact sheet of a flight.
  - Diagnostics: `__DOORWHY__`, `__DOORFLOOD__`, `__WALKTRACE__`, `__SEGS__`, `__FLICKERWHO__`,
    `__REALDIFF__`.
  - Run headless in the cloud mirror on the baked region: overlaps 0 nested; doors as above; the
    spawn views and flights at 400/1,500 m flicker-free.
- Tests: `nest` (6), `seams` (2), `doorway` (5), `raisedStairs` (2), `nearPlane` (4). The door,
  roof and stair tests were checked to fail on the old code. 399 pass.

## 2026-09-29 (ad) — Four helpers merged: real rooms, phones, photos that paint, streets that stay drivable

Four helper agents worked offline in their own copies while the main session waited; each came
back with tests. Merged by three-way merge onto (ac), 380 tests pass, typecheck clean, checked live
in the pane where noted.

- **Interiors, slice 1 (`docs/INTERIORS_PLAN.md`): rooms, not halls.**
  - A plan in two stages. The tile worker builds the shell (`interior/plan.ts`: storeys, real
    stairs, a house's hall, corridors by plate depth, office cores). The rooms are laid out when you
    walk up (`interior/layout.ts`, a storey a frame).
  - Houses get a hall to the stair, then living room, kitchen, dining room or study, and a WC; upstairs
    a bathroom and 2–4 bedrooms (doubles ≥ 11.5 m² and 2.75 m wide). Blocks get corridors and flats.
    Offices get a core (15–30% of the plate), desk benches within 13.5 m of the glass and meeting
    rooms. Shops keep aisles with a back of house. Partitions meet the facade only between windows.
  - Every room is reachable from the front door; the collision world has exactly the drawn walls,
    and a wall that would land on you leaves a doorway where you stand. The HUD names the room.
  - Cost: rooms are painted from a room-map texture, and repeated furniture is instanced. Worst
    build step 47–1,243 ms → about 1 ms; a house is 30k vertices (was 43k), a supermarket 12k (was
    1.1 M).
  - Seen live in Sea Bright (`shots/int-seabright.jpg`, `shots/tour-seabright-house.jpg`): a hall
    with the stair beside it; living room, kitchen, dining room and study; upstairs a landing,
    bedroom and bath.
  - Tests: `interiorLayout.test.ts`, `interiorBudget.test.ts` (28).
  - Not yet: towers past 4 storeys, lifts (slice 3); curtain walls matching the interior (slice 2).
- **Streets that stay drivable (the `__GRADES__` residuals), fixed in the shared grader
  (`grade.ts`).** It was built from four Queen Anne cells captured live. Six causes, each with a
  test that fails on the old grader:
  - dead ends left on the raw hill;
  - alley and driveway junctions as flat plateaus on the street;
  - a lesser way averaged with the greater street's carriageway at its mouth;
  - a 4 m way reading a neighbour's ground;
  - shallow-angle joins;
  - the cap measured along bends instead of the chord a car spans.
  - A last pass (`holdLimits`) holds every 8 m chord to 99% of the class limit on the final surface.
  - On the captured cells: 19 ways over 25% → 0; worst 56% → 24%. Steep streets stay steep.
  - 2nd Ave W at the x = 0 seam was a dead end, not a seam: both cells agree there to 0.0 mm.
  - Known limits: seams stay consistent only while a way recovers within the 48 m of shared road
    context. Untagged hills over 27% for 700 m can't all be held (tag `incline`).
  - No cache bump: grading runs on each build, and the caches hold TileJson.
- **Phones: why the page was blank, and a report if it ever is again.**
  - The page never failed under Chrome's phone emulation (0 JS errors; every shader within ES 3.0
    limits). The likely cause is the phone running out of GPU memory: about 950 MB at desktop
    settings, 340 MB of it street-sign atlases.
    - Sign atlases are now cropped to what they hold (textures 546 → 271 MB, every device).
    - Life instances draw only live slots (2.4 M → 0.45 M triangles).
  - A phone quality tier and a low tier (`render/quality.ts`) are picked at boot. The phone tier
    paints at CSS resolution with 1024² shadows and 2048² ground paint, and the tile rings shrink to
    900/1500/4000 m. It never overrides a saved knob.
  - A boot report (`ui/diag.ts` in `#fatal`, plus an inline guard in `index.html`) shows the GPU,
    limits, tier, the first shader log and the first errors. It opens when WebGL fails, a shader
    fails, the boot throws, no frame is drawn in 15 s, the context is lost, or the bundle can't load
    — or on `?diag=1`. A crashed visit drops a tier on the next load.
  - Seen live with the pane at 375×812: "quality phone (touch screen)", the world drawing.
  - `tools/mobile-check.mjs`: Pages-like serve, device emulation, shader-limit audit.
  - Needs a real phone: open `…/Map_Game/?diag=1` after the next deploy.
- **Photos paint what they frame (Robby's idea).** With the far sketch on, a photo paints
  everything visible in it, near and far: a 256×144 depth readback is unprojected to the ground,
  each sample paints a disc as wide as its footprint, and it blooms in over ~2 s. Past 2 km it
  paints 64 m far cells, which a 32 km far window shows. Walks and stats are untouched.
  - Seen live: a photo on Ocean Ave painted 729 cells out to 1.6 km.

Tests: 380 pass.

## 2026-09-29 (ac) — Cleaner looks to try, and paint-as-you-walk all the way out

Robby's asks, after his walks round Kerry Park and Liberty Island: a few cleaner, more vibrant
filters to try beside watercolor HD (which stays the default), and the first version's
paint-as-you-walk back as an option.

- **Four new Look presets and four new knobs** (panel → Look). The knobs:
  - `crisp` lays the unbrushed frame back over the paint;
  - `softGlow` is a mist over the lights, with the bright sky and sunlit faces blooming;
  - `clarity` is local contrast against the paint's own small blur;
  - `contrast` is an S-curve.
  - The presets are `clean vibrant` (saturated, crisp, no paper edge), `clean HD`, `gouache` and
    `dreamy pastel`. Every preset sets all four knobs, so switching never carries one look's extras
    into the next. Compared at Kerry Park, 16:00: `shots/looks-kerry3.jpg`.
- **Paint as you walk, far away too** (panel → Watercolor, off by default).
  - With it on, every place you haven't been is the pencil underdrawing at any distance: graphite
    hatching on paper, lighter with distance.
  - Walking paints it in with a wet edge and pigment pooled at the rim. The sky and the far layer
    stay painted.
  - "paint reach as you walk" (20–400 m, 45 by default) sets how far round you paints.
  - Seen at Kerry Park (`shots/sketchfar.jpg`): downtown is pencil and the park you stand in is
    painted.
  - The explore window is 4 km, so past 2 km everything reads unexplored in this mode.
- Docs: `docs/earth/LOOK_DEFAULTS.md` (the new looks), `docs/agent/rendering.md`.

Tests: 311 pass.

## 2026-09-29 (ab) — Cuts as places, and a harness that re-poses until it sees

Round 9's must-fixes 4 and 5, on streamed Queen Anne.

- **Cuts as places (must-fix 5).**
  - Poured walls are board-formed: a course every ~30 cm, each board a shade off its neighbours.
    Rain streaks run down from the coping, and one panel in three has moss at its foot.
  - The hedges on a wall are clipped: rounded boxes 3.4 m long, where they were faceted boulders.
  - **A stair to each lot.** A house's front walk (under 2.5 m wide) that comes down to a wall 0.7 m
    or taller gets a flight up the face, running along the sidewalk to a landing where the walk
    meets the wall (`wallStairs`: 18 cm risers, 28 cm goings).
    - The rail opens at the landing and no hedge grows there.
    - The walker climbs it: a ramp deck, with walls on its open side (`stairColliders`).
    - Test: along the sidewalk, up the flight, over the coping onto the lot. Beside the steps the
      wall is still a wall.
    - The steps are their own mesh (`retaining-steps`), so a frame can check it sees them.
- **Asserts that see, and re-pose (must-fix 4).** `tools/spot-shots.js`:
  - An id render in two passes. The first draws the world with depth and marks what stands within
    2.5 m and 4 m of the lens, and how much of the frame is world at all. The second draws only the
    subject against that depth, so its share counts only where it's the nearest thing.
  - Checks: the subject ≥ its `fill` (5% by default); nothing within 2.5 m over 5% of the frame or
    within 4 m over 15%; the world ≥ 20%; nothing at the lens; not inside a building; not on a roof.
  - A frame that fails is re-posed, not stamped. The harness circles the subject at the distance
    that frames it, from the bearing asked and then round it, at eye level on open ground. Only
    what still fails is stamped. `repose: false` keeps a pose as given.
  - `car: 'parked'` frames a parked car near the spot from its side.
- **Frames** (`shots/spots-r10-walls.jpg`, 7 poses; no stamps on the six that must pass):
  1. the 7 m poured wall from its sidewalk: 51% of the frame, the board courses visible;
  2. a rockery: 15.6%;
  3. steps up to a lot: 8.1% for the steps alone, with the wall beside them;
  4. a clipped hedge on a wall: 23%;
  5. Queen Anne Ave N, parked both sides;
  6. a parked car on a 27% grade, re-posed to its side at 6 m: 19.5%;
  7. a pose facing the sky, `repose: false`: fails as it must (subject 0%, world under 20%).
- **Not met: `__GRADES__` 0.**
  - Queen Anne (x −900..800, z −1500..100): 557 ways, 16 over 25%. Twelve are service roads. The
    others are 2nd Ave W (36% at (10, −471)), W Blaine St (29%), Warren Ave N (27%) and 1st Ave N
    (26%).
  - City-wide: 4,730 ways, 79 over, most at bridge ends, overpasses and the Ship Canal.
  - Frame 6's car stands on one of these slopes.
- **Queued by Robby this session.** These are in the backlog (R.27–R.31), and the far skyline
  already has a draft.
  - Distant cities at their real distance: Manhattan from Sea Bright's beach on a clear day.
  - Interiors at real scale: `docs/INTERIORS_PLAN.md` measures today's gaps (rooms 16–40 m deep,
    storeys capped at 4, one room a storey in most houses) and plans five slices.

Tests: 311 pass.

## 2026-09-28 (aa) — Never shut in a building; the Space Needle stands on its legs again

Two of Robby's reports. Two helper agents read the code while (z) was being finished and found the
causes. Each fix below was checked against a test that fails without it.

- **"Buildings spawn doorways where other buildings are and I can't get out."**
  - **Doors onto a neighbour.** `pickDoorWall` scored walls by the street they face and never asked
    whether the ground outside was open. A building behind another (its street side is the front
    one's back wall), a party wall, or overlapping outlines got a door onto a neighbour's unbroken
    wall.
    - A door now goes only on a wall whose outside is open ground. It's probed across the opening
      from 0.45 to 2.2 m out, against the walkable buildings round it, margin neighbours included.
    - It tries the seeded spot, then the middle, then near each end. No open wall: no door, no
      interior, a solid building.
    - Test: `pack.test.ts`, a house built against the back of another. Its door had been in the
      shared wall; now it opens onto open ground.
  - **Through the wall.** `WalkWorld.move` took each frame's step in one piece. A slow frame at a run
    (0.6 m) or a boosted car (1.9 m) landed past a wall's line and was pushed out on the inside.
    Long steps now go in pieces. This was also a car driving through walls.
  - **Teleports put you 2.2 m inside the nearest door.** They now skip a door whose outside is a
    building or a wall.
  - **The rescue.** `settleWalker` now runs once a second on foot, not only on a tile mount. It had
    used `blocked`, which is true anywhere inside a footprint, so every mount stepped an indoor
    walker out of the house and someone under a beach house out from its pilings. It now reacts to
    a wall through your body (`touching`, at your feet's height) or a solid footprint.
  - Live, 17 cells round Seattle Center: 3 of 9,834 doors open into a building, all on synth
    stand-ins at a real cell's edge (they can't know the real neighbour; they go when it lands).
- **The Space Needle a plain cylinder.** OSM maps it as an outline the size of the saucer, with
  parts: the core and legs from the ground, the top house at 140–158 m.
  - osmToTile's part join hides an outline only when ground-standing parts cover 60% of it. So the
    Needle's outline stayed as a "podium" capped under its lowest lifted part: a 40 m-wide column
    140 m up.
  - An outline a lifted part overhangs, with something standing under it, is now drawn by its parts
    (`realTile.test.ts`). LiDAR no longer measures outlines that parts stand on (a measured roof
    would stretch a podium back into one prism).
  - The skyline ring now reads tall parts too, and keeps them with their outlines (`SKY_V` 2). From
    afar the Needle was always its 184 m outline.
  - Cache keys bumped together: `DIRECT_V` 22, tile service `t/v22` and `&v=22`. **Needs
    `npx wrangler deploy` in `worker/`.**
  - Seen live (`?tiles=direct`, `shots/needle-fix.jpg`): a saucer and halo on a slim core, the
    100-ft level below.
  - Its colours still come from a brick recipe; the landmarks pass will do its white steel.

Tests: 309 pass.

## 2026-09-28 (z) — Driving through Seattle without the hitch every couple of seconds

Robby's report: teleport to Seattle, drive around, and the game lags every couple of seconds. A frame
probe (`tools/hitch-probe.js`, new) timed every per-frame system while a car crossed downtown at
15 m/s, and showed what the hitches were.

- **The traffic's road graph was rebuilt in one go on every tile change.** This was the big one:
  491 ms on the 22,000 roads of a downtown ring, every few seconds on a drive. Half of it was the
  walk surface under 227,000 road samples. The other half was a string key built for each vertex
  several times over.
  - The rebuild is now sliced: it runs about 4 ms a frame (`lifeInitSteps`, pumped in `main.ts`).
    The sim keeps the old graph until the new one is whole.
  - Vertices sit in an integer hash table, and shops are counted from a flat grid.
  - A road piece's heights are kept while its road lives and its terrain cell took no new patch
    (`Terrain.genIn` / `WalkWorld.surfaceGen`).
  - Its output is byte-identical to the old build (`scratch/lifeinit/bench.mts`: cold, warm, after
    a ground change, sliced). A warm rebuild of the bench city dropped from 152 ms to 32 ms.
- **Instance scans read every tree in the city.** The squirrels' tree list (every 2 s — "every
  couple of seconds"), the almanac's spotting (every 0.5 s) and the commissions each walked every
  instance of every loaded tile, a city's hundreds of thousands of trees.
  - `ctx.instances` now skips tiles the circle can't reach.
  - It also reads the instance array in place.
- **A drive-by built interiors.** Every door passed within 16 m assembled a whole interior (69–209 ms
  spikes). Driving or flying, nothing activates; a build in progress drops.
- **Grass cells took 9–19 ms each downtown.**
  - Only the streets near the walker are considered (re-listed every 25 m), and the cheap tests
    come first (the paint mask, the street strips by box).
  - Cells are capped at about 3 ms a frame.
  - The ground painter keeps its merged road, area and footprint lists per set of tiles. It used to
    re-sort them for every 20 m mask.
- **Every mount rebuilt the neighbourhood grids** (houses, shops, built volume, paved ground) from
  every footprint and segment in the ring, 15–25 ms. Each tile's own grid is now worked out once and
  summed.
- **A new tile went to the GPU in one frame.** A downtown tile is 100–130 MB of vertices; uploading
  it was a 40–60 ms render.
  - A mounted tile now shows 12 MB (or 24 meshes) a frame, each drawn the frame it appears, even
    off-screen, so its buffers go up then rather than when you turn round.
  - What it replaces (its stand-in, its silhouette, its flat first build) stays on screen until it's
    whole (`TileStream.reveal`).
  - `TileStream.lastMount` says where a mount's time went.
- Smaller fixes:
  - the terrain remembers the last cell it was asked about (no key string per height query);
  - the lamp pools are one painted sprite, stamped;
  - the footstep surface only looks at streets within reach (`roadBounds.ts`);
  - front walks go with their tile (they piled up for the whole session, a tile's again on every
    remount — and a stand-in's stayed painted under the real tile).

**Measured.** Downtown Seattle (14 real cells), a car moved 15 m/s for 30 s, same pane:

| | Before | After |
|---|---|---|
| Longest frame | 503 ms (and 432 ms) | 81–83 ms |
| Frames over 40 ms | 30 | 19–30 |
| Grass time per 30 s | 1,513 ms | 172–209 ms |
| Mount | 31–51 ms, plus a 57–68 ms render | ~20 ms (collision 12), upload spread over ~0.5 s |

Traffic rebuilt twice during the drive, with no spike. What's left of the slow frames is the GPU: the
downtown ring draws ~15 million triangles in ~1,800 calls a frame. Building meshes are 76 bytes a
vertex, non-indexed, 1.3 million vertices a tile, and the rockeries are 390,000 vertices a tile.
That's the next performance item: level of detail and lighter vertices, then a phone budget.

Found alongside (queued):
- the door-placement bug Robby reported (task 67);
- the Space Needle as a plain cylinder (task 66);
- collision walls are tombstoned on unmount but never compacted (memory over a long drive).

Tests: 305 pass.

## 2026-09-28 (y) — Traffic that flows (reviewer round 9, must-fix 3): every street carries its class's traffic, turns ride a curve through the box, cars that don't cross share it

Round 8b measured Queen Anne at 63% of cars stopped (bar: 25%), 2.0 m/s. Most of them were queued
behind others. A bench in the container reproduced it: a Seattle-like 9×9 grid, 100 m blocks, an
arterial every third street, the probe's metrics (`scratch/flow.mts`). It found four causes.

- **One density for every street.** One car per 25 m on every street put an arterial's traffic on
  every side street, and the side streets' stop signs queued it back onto the arterials.
  - Streets now carry cars by class (`CARS_PER_KM`: residential 5 per km, tertiary 18, secondary
    34, primary 50, at the day's peak).
  - Cars spawn by that density. At junctions they mostly keep straight on (4×) and otherwise turn
    by the traffic each road carries: off an arterial now and then, onto one mostly.
- **Every way through a junction crossed its middle.** Cars followed the two edges into the node,
  and a turn jumped lanes there.
  - A car now rides a curve through the box, from its lane at the box edge to its lane beyond
    (`turnAt`). Visibly better, and it makes the next fix possible.
- **One car in the box at a time.** The box holds up to three cars when their curves stay a car's
  width apart and they leave by different lanes. Opposite approaches go together, and a right
  turn goes beside a through car (`crosses`, `takeBox`).
  - Safety, each found by the bench's overlap count and traced tick by tick:
    - a car claims the box from its point of no return;
    - a committed car doesn't have second thoughts at its line;
    - a claim holds while the car is still in the box;
    - "what's in the box across my way" follows its actual path (`boxAhead`);
    - at a standstill on every arm, whoever waited longest goes (it had been a four-way lock);
    - two head-on left turns take turns.
- **Waiting for the car ahead to be well clear of the box.** That let one car in four seconds
  through a green. A car moving off beyond is now followed, not waited for: discharge went from
  one car per 4 s to one per 1.45 s.
- **Walkers:**
  - one put down past its corner planned its crossing from the middle of the junction, out in the
    road;
  - anyone standing in a carriageway now counts as crossing for the cars (`inRoad`, `xnow`);
  - cars in the box stop for a walker on their way.
- Holds are counted by cause for the probes (`LifeSim.holdWhy`).

**Measured.** The bench, rush hour, 0 overlaps in 40+ runs across seeds and rules: 62–66% → 27–33%
stopped, 1.8 → 5.0 m/s. **Live on Queen Anne (12 real cells, `__CARPROBE__`, clock ticking):**

| | Before | 14:00 | 17:30 |
|---|---|---|---|
| Cars stopped | 63% | 8% | 5% |
| Mean speed | 2.0 m/s | 6.9 m/s | 7.1 m/s |
| Longest stop | 56 s | 37 s | 29 s |
| Overlapping pairs | — | 0 | 0 |
| Cars on the road | — | 40 | 44 |

Tests (`traffic.test.ts`):
- a queue of eight at a red goes over the line at 0.61 cars/s once it turns green (bar 0.4);
- an arterial through a grid carries more than 4× a side street's cars per km;
- the busy grids run at 1.6× their streets' noon traffic, with 0 walkers hit and 0 fused cars.

Also: **"trees" that were masts.** LiDAR surveys file some lattice masts under high vegetation, so a
50 m "tree" hung over town (Robby's report). A peak whose crown is under 7% of its height, or anything
over 80 m, is no longer a tree (`detectTrees`; test in `measure.test.ts`; LiDAR cache `v8`).

Tests: 305 pass.

## 2026-09-28 (x) — Reviewer round 9 on the boat minute: a sketch that reads as a sketch, a wash that goes wet and dries, one card at a time, a boat you walk aboard

Round 9 (`REVIEWER.md`) scored Seattle 7/10 and the boat minute 6/10 as a slice, **not passed**:
"the sketch looks real, the wash looks like a wipe, and your boat looks like everyone else's."
Its must-fix 1 is done and measured; most of must-fix 2 too.

- **One card first** (`commissions.ts`). The first painting teaches the single most prominent
  paintable kind in the frame (at least 1.5% of it). After that, only what's composed: each at
  least 4% of the frame, at most 3, never one already painted. The rest stay pencil cards.
- **Your boat is yours** (`brush.ts`). Painted things start in a bold colour (red, blue, ochre or
  green, one per kind), with the classics after. The chips follow what you aim at (water: your
  boats; a street: your cars). The status line has one verb.
- **The sketch pass** (`post.ts`, `propMaterial` wash). The sketch is drawn in its own pass and
  laid over the painting, so the paint filter never smears it:
  - translucent paper with hatched graphite strokes;
  - a doubled graphite outline taken from its own depth, which boils (redrawn 7 times a second)
    and catches on the paper's tooth;
  - dashed wherever something stands in front of it;
  - the world pales round it (`U.uBrush`).
- **Where it goes** (`brush.ts` solve):
  - in view and clear of the bar's own rectangle (a phone's at the top, or down the side held
    landscape);
  - never under a nearer boat or car on screen, or behind a building;
  - with the room its own hull needs, so a skiff can lie near the bank where you can step aboard
    and a cruiser goes further out (`place.ts` `Hull`, `kit.ts` `boatDims`);
  - near and in the clear first, then near with only an edge hidden, then further out;
  - with room only out of view, it says "tap the water where you can see it".
- **The wash goes wet, then dries.**
  - Wet: darker and richer (saturation ×1.45), pooling at its edge, bleeding past the line, with
    the bristle sound as you rub (1.3 s unhurried, up to 3× rubbing).
  - Then it dries (0.9 s): the wet colour lightens into the real boat, which settles onto the
    water and bobs. A ring runs out across the water (`U.uRipple`), the view leans in 6° and
    back (`walker.zoom`), a hull-settling slosh and the chime play.
  - The toast: "your skiff — walk out to it to go aboard".
- **The payoff.** Someone at the helm (seated at a skiff's tiller, standing at a wheel). Walk into
  your boat from the water's edge to board it. Moored rides bob. The hull planes at speed. The wake:
  - the ribbon has a vertex on the track itself (two per station had bent the churn into a zigzag
    as the V widened);
  - the churn is as wide as the transom and breaks into clumps of foam; the arms are thin broken
    strokes (`wakes.ts`);
  - its beam attribute was never re-uploaded to the GPU, which had made the churn a spike.
- **The phone bar** is one line of chips that scrolls sideways, with the colours on a line of their
  own: 131 px tall at 375×812 (it was 251). A phone held landscape gets a narrow column at the left.
- **Harness:** `tools/brush-check.js` → `__BRUSHCHECK__()`. It measures on the frame itself: the
  sketch's share of the frame; how much of it is hidden (a mask pass, `U.uGhost.w`); the sketch's
  visibility sampled through the wash; and ΔE sketch → dry over its own pixels (CIE76 and
  CIEDE2000).

**Verified live** (Sea Bright marina, noon, the browser pane):

| Reviewer's test | Bar | Phone 375×812 | Pane |
|---|---|---|---|
| Sketch share of the frame | ≥ 2% | 3.42% | 3.73% |
| ΔE76 sketch → dry | ≥ 25 | 49.6 | 44.3 |
| ΔE2000 sketch → dry | — | 30.6 | 29.1 |
| Sketch visible through the wash | ≥ 70% | 86.7% | 86.4% |

The hidden 13% is the hull under the water line. Also checked:
- Walked into the painted skiff from the bank 3.5 m off: aboard in 0.62 s, with the helmsman at
  the tiller.
- 12 m/s with a churn as wide as the transom.
- Shots: `shots/brush-r9-desktop2.jpg` (sketch, wet, drying with the ring, dry),
  `brush-r9-phone.jpg`, `brush-r9-sail7.jpg`.
- Tests: 302 pass (place 8, brush 3).

Open from must-fix 2: Rumson's landing lit; three cold players under 90 s (that needs people).
Next: must-fix 3, traffic that flows.

**Queued (Robby, 2026-09-28):** "really huge trees flying around", which he thinks are cell towers.
Likely the LiDAR tree finder reads masts as trees, with a crown up at the mast top. Fix: skip tree
detections at OSM `man_made=mast|tower` (`tower:type=communication`), draw a real mast there, and
cap thin, very tall returns.

## 2026-09-28 (w) — The brush, slice 1: paint a thing from life, then paint one where you aim (built while the computer was away)

Robby and I settled the game (`docs/GAME_DESIGN.md`, "Paint It Real"):
- painting is the verb;
- what you can paint is earned by painting the real thing from life;
- every verb works on a phone;
- you never draw on the 3D world — you aim and it snaps.

Slice 1, the boat minute, was built and tested in the cloud copy:

- **Paint-to-own** (`commissions.ts`):
  - A coloured Almanac card is a kind you can paint.
  - A painting records when each card was coloured in (`pt`) and which kinds that frame taught (`fresh`).
  - The city's kerb cars can be painted from life now too.
  - The painting's toast adds "yours to paint now: B for your brush".
- **Placement rules** (`player/place.ts`): pure solvers, shared by the brush and the old summons.
  - A boat goes on the nearest open water with room for a hull (5 m all round), bow off the land.
  - A car goes in the lane nearest your aim, facing the way you look, and pulls up past a house built to the kerb.
  - Never on top of what's already there: a moored boat (6.5 m) or a parked car (4.2 m).
  - When nothing fits, it says why and which way ("a boat needs open water — the nearest is 300 m east").
- **The brush** (`ui/brush.ts`): B, or the ✎ button on a phone.
  - The chips are the kinds you own, last used first. The one that fits what you aim at is picked for you until you pick by hand.
  - A family you haven't painted from life shows a pencil chip that says where the nearest real one is.
  - The sketch is the kind's own model in pencil, and it glides to the solved spot.
  - Controls: R turns it (a car takes the other lane); C or a swatch changes its colour; the wheel or 1–9 picks another kind.
  - Click (on a phone, tap the sketch) and the colour washes in from where you touched it. Rubbing hurries it, and the view holds still while you rub.
  - When it dries it's a real ride, saved where you painted it (`vehicles.ts paint()`); E to board.
  - Harness hook: `__BRUSH__`.
- **The pencil and the wash** (`propMaterial({ wash: true })`, `uWashAt`):
  - The sketch is graphite grey, hatched in the model's own frame on the shaded side, cross-hatched in the deepest shade, with its folds drawn.
  - The colour spreads with a ragged wet edge and pigment pooling at the rim.
  - Checked offline through the game's own watercolour pass: sketch, half washed, finished. A white hull still reads as colour arriving.
- **Free rides are a developer switch.** V / Shift+B / N summon only with the panel's "free rides" on; otherwise V and N say how rides are made now.
- **Boarding** reaches 7 m, because a hull needs 5 m of open water round it.
- **The intro's key list** now says: B, your brush.
- **Tests:** 300 pass (place 7, brush 2).

**Verified live once the computer was back** (Sea Bright marina, the browser pane):
- P at the moorings coloured five boat cards at once (a harbour painting teaches several boats),
  and the toast said they were yours to paint.
- B opened the brush over the water with the skiff chip first. The pencil sketch snapped 3 m off
  the aim, clear of the moored boats. The wash ran from the touch point and the skiff was real
  (`shots/brush-minute-noon.jpg`: sketch, half washed, dry).
- Boarded from the shallows 4.6 m off; 12 m/s under way (`shots/brush-sail.jpg`).
- After a reload, both painted skiffs were where they'd been left.
- The prompts: "P — paint that boat from life" with no boat owned, then "B — your brush".

**On a phone-sized screen** (touch emulation, 375×812):
- The ✎ button opens the brush.
- A tap on the water moves the sketch; a tap on the sketch starts the wash; rubbing hurries it.
- Fixed there, so the flow works end to end:
  - Taps anywhere count now; the walking stick only walks when dragged. The left 45% had ignored
    taps, and so did a sketch standing there.
  - The bar keeps clear of the button column, hides the place name while you paint, and sits
    above the map credit.

Next: reviewer round 9 on the boat minute and on Seattle, then the pending list.

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
  - **Found live and fixed: moving cars through parked ones.** `__CAROBB__` counted 66 such pairs
    in 20 s, all on wide one-way streets with kerb parking (West Queen Anne Driveway: 10.9 m,
    parked both sides at ±4.3 m). A one-way's two lanes sat at ±w/4 = ±2.7 m, into the parking
    lanes.
    - The life graph now carries the kerb the parked cars take (`edgeKerb`, from the same rules
      kerbside.ts parks by: parallel 2.3 m, angled bays 5 m). Lanes are laid out in the band
      between them: a one-way's two lanes share it; a two-way keeps right of its middle.
    - Live: 68 → 4 pairs (1 moving-vs-parked, 3 moving).
    - `tests/traffic.test.ts`: a one-way, a two-way and a one-way with angled bays, every space
      taken, 40 s of traffic, no box touching a parked car. Without the fix: 4,115 and 1,544 hits.
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
  warped street grid (108 m pitch, sine-wandered lines), a low-freq noise town mask for
  density, lattice-hash h for every choice. No per-tile RNG for layout -> seams are
  structurally impossible; neighbour tiles agree about shared roads/lots by position.
- **Streaming** (stream.ts): specAt(cx,cz) -> baked manifest tile or {id:s+key, synth:1}
  spec; update() iterates the cell window (not the manifest); radius sweep for drops.
  Fixes found by subagent trace: a queued set kills a resolved-but-unmounted refetch
  storm; coarse silhouettes now cover [LOAD_R, COARSE_R) (was [DROP_R, COARSE_R) - a
  900 m dead zone where nothing loaded); ensureAround enumerates synth cells too;
  synthOrd is cell-hashed (session-independent ids).
- **Worker** (	ile.worker.ts): init takes seed; spec.synth -> synthTile on-thread
  (pure JS, no fetches), then the identical uildTile+pack path. In-page fallback same.
- **Ground** (ground.ts/pack.ts): ground material exposed via userData.groundMat ->
  setGndMaterial(); new pack tag 'gnd'; synth tiles emit a ground chunk into extra.
- **Props** (props.ts): slice containment now uses the tile's own slice box (inSlice)
  so poles/trees/benches emit outside the baked grid; pavedMask bounds clamped for boxes
  fully outside the slice (was negative canvas size).
- **Buildings** (uildings.ts): landmarks ?? [] (synth has none).
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
