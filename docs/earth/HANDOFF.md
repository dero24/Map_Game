# Handoff: the lower 48, alive — part 2 (2026-10-05)

## Start here (2026-10-09): the region pass — each region and sub-region against the real thing

Robby, 2026-10-08 (night): "soon we are going to focus on regions within the 16 regions so this research
you are doing and only research for rumson amd other towns compare will bw used in next session as
reference for how to best ensure each eegion and sub region matches qhat they actually look like in a
super effecient atreamlined wa". So the next session starts **the region pass** (`docs/ROADMAP.md` Track
B; feature `region-match-pass`) with **`docs/REGION_MATCH.md`**: the loop for one region in one sitting,
the spots (place types × sub-regions), the photos (Mapillary first, its gaps filled from public photos —
never Google Street View, not even for testing), the checklist, the knob in the code behind each layer,
and the worked example (Rumson, Oak Park, Plano: §6). `gameplay-one-plan` and the Sea Bright proof of
concept (below) wait until Robby says; a session unsure which comes first asks him.

### Robby's second batch (2026-10-08 night → 10-09): all six done, on `feature/four-reports`, not pushed

Robby, after the four reports went live: "please fix the remaining bugs like this", the animals that
vanished as he followed them, and Rumson's "too much fluffy trees" against real photos. LOG 2026-10-08
(night, later) has the numbers. Committed one at a time on `feature/four-reports`; **not pushed** (a
`feature/` push publishes the game: Robby's OK first). No tile version: every fix is the game's (v31
stays; his reminder — a fix to how the tile service builds coasts would need v32 and a deploy).

1. `bug-night-pale-creatures` — **passing** (the walkers' night lighting on every creature out of doors).
2. `bug-seawall-railing` — **passing** (`dem.ts seaShore`: the water's edge at the coastline).
3. `life-city-night` — **passing** (`lifeSim.ts cityNight`: a city's evening into midnight; Midtown by
   Bryant Park 23:00 4 → 46 walkers, Times Square 22:00 6 → 47; both half a city by `cityAt`'s built
   volume — a place's own nightlife, OSM's bars and theatres, would say more, if Robby wants it busier).
4. `life-critters-persist` — **passing** (`critters.ts STAY`: an animal goes only out of sight; flushed
   birds land again, squirrels come down, burrowers come up, indoors they wait).
5. `bug-life-origin-stack` — **passing: never in the game** (three.js's `decompose` reads a hidden,
   zero-scaled instance as a whole one at the origin; `vehicles.ts hiddenInstance`; the debugging doc).
6. `review-suburbs-real` — **passing** (the comparison and the method: `docs/REGION_MATCH.md`).

### Before that: Robby's four reports (2026-10-08) — all passing and live

### Where the four stand (2026-10-08, night: all four passing and live; the work goes on from `feature/four-reports`)

All four are fixed (LOG 2026-10-08 night has the numbers; before/after montages in the git-ignored
`shots/fix/`, and on Robby's page https://claude.ai/artifact/J7koij7UdW1rjCzrVQmqJS). Robby: "yes,
just all the above but just create new feature branch we will work off of" — "push change to new
branch inatead of merging to lower48-alive". So **`feature/four-reports`** (off `fix/four-reports`)
is the branch to work from, pushed and published; `feature/lower48-alive` is left as it was. Robby
ran the tile service's deploy himself (v31, worker dffa75f6: the permission check refuses a
production deploy from a session); the client asks `&v=31`. **Next: `gameplay-one-plan`** (below).

1. `bug-night-glow-people` — **passing** (walkers lit by the night: `nightLight.ts` FIGURE).
2. `life-density-realism` — **passing** (`lifeSim.ts` LAND: the land's share, a home street's day,
   the late hours, rural roads; the first crowd the hour's; the crowd thins as the hour turns).
3. `look-crisp-preset` — **passing** ("crisp watercolor" in the panel's Look folder, `?look=crisp`).
4. `bug-harbour-water` — **passing, live** (tiles v31). How it went out, for the next tile bump —
   the tile service is deployed before the client asks the new `&v`:
   1. `cd worker && npx wrangler deploy` (the worker's key is already `t/v31` on the branch);
   2. `node tools/must-load.mjs --live`, and the live cells round Ellis Island carry the bay as sea:
      `curl "https://map-game-tiles.map-game-tiles.workers.dev/tile/1_0.json?olat=40.703125&olon=-74.046875&v=31"`
      (and `0_1`): a `water` area with `k: "sea"` covering the cell, Liberty Island a hole in `0_1`'s;
   3. only then the client: `&v=29` → `&v=31` in `src/world/stream.ts` and `DIRECT_V` 29 → 31 in
      `src/world/tile.worker.ts`, the streaming doc's line with them; build, commit;
   4. then the item `passing`, `gameplay-one-plan` `in_progress`, and `feature/four-reports` pushed
      again (that publishes; nothing is merged into `feature/lower48-alive`).
   **No v30**: this session's before captures asked the live v29 service for `&v=30` round Ellis
   Island, and the edge keeps those answers under that URL for 30 days. Until a deploy the client
   stays at the live `&v`, so a dev page serving the tree (Robby's on :5173 too) can't burn the next
   one. To look at a new tile version before its deploy: a local worker on another port
   (`cd worker && npx wrangler dev --port 8795 --persist-to D:/map_game_osm/wrangler-v30 --local`:
   its R2 holds the extract's index and the New York blocks 105_130 and 106_130) and the page at
   `?at=40.6995,-74.0396&tiles=http://localhost:8795`.
- Noticed, not done (for Robby to rank): the gulls on a lawn at night read pale as the walkers did;
  a railing on a seawall stands in the water's edge (the sea floor's slope over the terrain's last
  grid step, every coast: `dem.ts waterPatch`) — new to see on Liberty Island now that its bay is
  water; Midtown at 10 pm is as quiet as at 3 am (the town rhythm's evening ends by 21:30); now and
  then (seen under load, old code and new) a stack of walkers or cars at a region's origin with no
  position of their own.

Robby, 2026-10-08, of his reports of 2026-10-07: "okay i guess it should fix those first"; then
"we can have the new session fix the bugs first, and then we can do the gameplay implementation
after". So they come first, one item at a time, in this order:

1. **`bug-night-glow-people`** (the active item): people at night lit by the night, not glowing.
2. **`life-density-realism`**: crowds and traffic that follow the place and the hour: quiet at
   night, a car every few minutes on a desert road. Painted places now keep the people and traffic
   of their hour (`docs/GAMEPLAY_STREAMLINED.md` §5), so this also sets what a painting keeps.
3. **`look-crisp-preset`**: the additional preset for a better watercolor overlay (Robby: "create
   the additional preset for better watercolor overlay"): a "crisp watercolor" switch in the
   developer settings, to compare against the default; its notes list what to try, cheapest first.
4. **`bug-harbour-water`**: the harbour's water meets its shores. It changes what the tile service
   builds: a new tile version, the worker deployed before the client is published (the branch
   merged back, below), never an unreleased `&v=` against the live service
   (`docs/agent/streaming.md`). Ask Robby before deploying.

- **On their own branch** (Robby: "go off of a new branch of this current one"):
  `fix/four-reports`, off `feature/lower48-alive`. The first session creates it; later ones switch
  to it and carry on. Not a `feature/` name: pushes to `main` and `feature/*` publish the game to
  GitHub Pages and run the checks (`.github/workflows/`); a `fix/` push publishes nothing, so run
  the checks on it by hand when wanted (`gh workflow run playtest.yml --ref fix/four-reports`, never
  `pages.yml`). (It was to go back into `feature/lower48-alive`; Robby chose instead to push it to a new
  branch to work from: `feature/four-reports`, above.)
- **Robby's screenshots:** `C:\Users\Robby\Pictures\Screenshots\_bugs` (outside the repo: look,
  don't commit). `_water_bug3.png` is the night from Liberty State Park, the walkers pale against
  the dark ground (`bug-night-glow-people`); `_water_bug.png` and `_water_bug2.png` are the bay's
  grey ground and its straight edge, `_water_bug_location_reference.png` where
  (`bug-harbour-water`). The rest are older: the circling plants, the horizon's pyramids and the
  grass on courts are fixed (LOG 2026-10-08); `_man_through_door_chicago.png`
  (`bug-walker-into-wall`) and `_grandstaff_terrain_glitch*.png` (`bug-grandstaff-terrain`) are
  open but not in this round; the airport shots are from 2026-10-04.
- **Each one:** read its notes; capture the before; fix it; tests; a before/after montage shown to
  Robby; commit on the branch, pushing only after his OK; the LOG entry; the item `passing` with
  its evidence; then mark the next one `in_progress`.
- **After the four:** mark `gameplay-one-plan` `in_progress` (below).
- **If Robby names another item** in a session, that session works it and hands back: set the
  active item to `not_started` (in its notes, "paused for <his item>"), mark his item
  `in_progress`, and before the session ends leave his item `passing` (or `not_started`, its notes
  saying where it stands) and the paused item `in_progress` again, so the next session picks up
  where the queue was.

### Then: one gameplay plan, agreed with Robby (`gameplay-one-plan`, no code)

Robby, 2026-10-08: "there are other gameplay files that talk about that as well, we want 1 good
streamlined approach for gameplay and want to take our time to ensure we get it right before
implementing and testing". A design session with him, not a coding one:

- **Fold every gameplay file into `docs/GAMEPLAY_STREAMLINED.md`.** In the repo:
  `docs/GAMEPLAY_VISION.md`, `docs/GAME_DESIGN.md`, `docs/CORE_LOOP_REVIEW.md`,
  `docs/Other_Ideas.md`, `docs/LIST_OF_POTENTIAL_ITEMS_AND_PARTS.md`. In Robby's `for_mapgame`
  folder: `GAMEPLAY_VISION.md` (an older copy than the repo's) and `MULTIPLAYER_PLAN.md` (not in
  the repo; ask him whether to bring it in).
- **List what each still says that the plan leaves out or says differently, and go through it with
  Robby** section by section; he decides what's kept. Record it in the plan's Decisions.
- **Take the time it takes.** The plan's open questions (§16) are for the proof of concept to
  answer by playing; this settles what the game is.
- **When Robby says the plan is right:** a note at the top of each other file (history; the plan of
  record is the streamlined plan; his `for_mapgame` files only with his OK), the tier-2 items
  matching the plan, the item `passing`, and `poc-first-minute` back to `in_progress`.

### Then: the Sea Bright gameplay proof of concept

Robby, 2026-10-08: "soon will have to do a poc of it at least starting in sea bright", and "i like
that it will be on a switch so it will not affect the current game". The plan's §14 is this work.
The proof of concept is built one part at a time:

1. **`poc-first-minute`** (paused until the plan is agreed): everything in view colours on first
   sight; 3–5 pencil things near you, picked out of sight; tap one to paint it, its card into the
   field guide.
2. **`poc-touch-moments`**: sit on a bench; toss a crumb and the gulls bunch up, then lift (the
   warning sign, then the moment); the gold edge; paintings keep the game's date, hour and weather.
3. **`poc-painted-place`**: the back of the van, a room bigger than the van (step out and look back
   at a small van); hang a painting; step in (the hour and weather held, the place's people and
   traffic going on as at that hour, ~250 m to walk, pencil past the edge); release the gull.

- **Everything goes behind `?poc=1`.** It's a throwaway prototype: without the switch the game must
  not change (run the shore playtest both ways).
- **Each item's notes say what the code already has and lacks** (an inventory of 2026-10-08, with
  files and lines). Read them before planning.
- **Each part ends with** tests, a reviewed montage (`node tools/capture.mjs … --query=poc=1`, or the
  in-page montage: `docs/agent/debugging.md`; capture mode keeps shots fully painted unless told
  otherwise, so `?poc=1` must win over it), a LOG entry, the item `passing` with its evidence, and
  Robby playing it. Then mark the next part `in_progress`.
- **After part 3,** Robby and two or three people who haven't seen the game play the first ten
  minutes; record their answers in the LOG. Then back to the roadmap's milestones 2–5
  (`docs/ROADMAP.md`) unless Robby says otherwise.
- **"Start near you?"** touches privacy: not before Robby says so.

The rest of this file is the regional-life handoff of 2026-10-05, still the reference for that work.

---

Robby: "i want to make sure all these places look alive lower 48 look alive with correct
vegetatation and animals and all that". Then: "you should just create all the 3d models for
everywhere based on our procedural 3d asset generator foundry". Then: "ensure animation like for
spanish moss and other things are really good too and we want alot of variety even per species,
color, all that". At the wrap-up: **"make things detailed, and variety and variation matter"**, and
**"rapid but great development"**.

Read this first. Then read `docs/regional-life/models.md` (the build list) and the rows of the
package you're on. `docs/REGIONAL_LIFE.md` and the latest `docs/earth/LOG.md` entry are background.

## Confirm on Robby's PC (after the cloud session of 2026-10-06)

**Done on the PC, 2026-10-07** (LOG "Smooth away from Sea Bright; roads and bridges clear"): the baseline
(init: the monarch test's timeout under load, one feature in progress), the build, the full shore
playtest (it found the 2.2 s shader freezes, now fixed: frames pass; flicker's self-test fails on the last
commit too — not chased), the soak (no stalls), the shader check on the GPU (27 programs, no errors),
`mobile-check` on a Pixel 7 and an iPhone (running, no errors, every shader limit inside a phone's). And
Robby's report the same morning — lag away from Sea Bright and after a teleport, walls and buildings in
the roads on the Sandy Hook bridge and in towns — worked through (the new `roads` playtest check). The
audit48 montages read the same day; the animals walked with tools/critter-shots.mjs
(`node tools/critter-shots.mjs` → shots/critters-handoff-montage.jpg): all 18 found.

**Then, the same day (LOG 2026-10-07 pm, eve, night):** the streets fitted to their buildings (the
tile service's guessed parking given back where fronts stand), stations over streets lifted, streets
under towers sunk, nothing set at a kerb in another street's lanes, the desert's measured crowns as
trees; a city's frame (scene matrix, per-camera tile culling, the coarse ring merged, the painter's
windows by grid) and the grass after a teleport. `smooth-and-clear` done. **To check a town's streets**:
`node tools/playtest.mjs --at=LAT,LON --only=roads,drive,walkabout` (roads: hits a thousand lane
samples — Asheville 0.85, Miami Beach 0.31, Midtown 1.4, Seattle 3.2, Chicago 7.3). What's left there is
in the LOG's "Next" lines. The tile service is at v26 (deployed 2026-10-07: osmToTile's widths and
underground outlines at the source, mapped trees by species, colours in either spelling); the next bump
deploys the worker before the client goes out (docs/agent/streaming.md).

**Then the flora review (LOG 2026-10-07 "last"; `regional-flora` in progress):** each plant in its season
(the mild winter's leaf fall, the lawns' winter, the gardens' and the forest floor's year), on its ground and
in its numbers (verge trees on residential streets nothing measured, the desert's own floor — under the
survey too — planted palms only in town), and two street fixes it turned up (rural roads at their own width:
the parking guess given back in open country; survey-found blocks in a street gone). **To measure greenery**:
`node tools/real-compare.mjs --kind=green --group=region --tag=<name>` (about 25 minutes; read
`shots/real/<region>-montage.jpg`; for an A/B stash `src/` and run the same tag pair, since the dev
server serves whatever the tree holds as each spot loads). Last: `flora-2`, vegetation 24.6% against the
photos' 34.6%, mean 0.725. What's next is the LOG entry's "Next".

**Then land cover everywhere (LOG 2026-10-07 "closing"):** ESA WorldCover in every streamed cell and the
far ring (tiles **v28**: the Olympic Peninsula's forests, the far hills' woods), areas that meet a cell without
a vertex in it clipped to it (the beaches of Ruby, Cannon, Pismo, Cape May and seven more), and distant trees
(the Hoh 22 → 49–57 fps). **v28 is live** (worker 0fb76c69, the client pushed after it): 22 of 25 US beaches
sampled show sand at the water. Next there: beaches, sands, wetlands and woods mapped as multipolygon
*relations* are never fetched (`osmQuery.ts` takes them as ways only) — the statement, the US extract
re-cut and uploaded, tiles v29, with Robby's go-ahead (LOG "Next"). Never point a page carrying an
unreleased `&v=` at the live service (what retired v27).

**Then the natural areas mapped as relations (LOG 2026-10-08 "later"):** tiles **v29** live (worker 90e0bdeb):
the query's new relation statement, and — rather than re-cutting the 35 GB extract — an add-on of just those
relations (`scripts/osm-extract-addon.mjs`, R2 `osm/v1/addon/`, 772.5 MB) the service reads beside the extract
when both are of one snapshot. OSM beaches now at 22 of 25 sampled US beaches. At the next monthly full cut the
relations come with the extract itself: retire the add-on then (docs/agent/streaming.md "The add-on"). Robby's reports of the same evening — a developer-settings preset for a crisper
watercolor, the harbour's water north of the Statue of Liberty (diagnosis in the LOG), people glowing at
night, crowds and traffic too dense at night and on desert roads — went to another session.

**Then the far woods' seasons (LOG 2026-10-08 "evening"):** the far ring's canopy and the wooded horizon
ridges turn in autumn and go bare in winter with the trees in front of them (their make-up from the trees
about the walker), and a near wood's floor goes to leaf litter once the leaves are down. Summer is the same
as before; developer settings → Time of day → "far forests follow the season" (`?farseason=0`) puts the old
look back. Client only, pushed after Robby saw the before/after.

The cloud session built packages #11–#16, the leftovers, the West's lizards, the water's life (seen
from above) and each animal's abundance. They were checked with
tests, CI, the shore playtest and studio montages, never in a real browser on a real GPU. On the PC:

1. **The baseline.** `git checkout feature/lower48-alive && git pull`, then `npm run init`: typecheck,
   999 tests, pack and invariant checks. Then `npm run build`.
2. **The heavy checks the cloud skipped.**
   - `node tools/playtest.mjs --region=shore` (the full one, not `--quick`): PASS.
   - `node tools/soak.mjs --region=shore --seconds=120`: no freezes (more animals about now: up to 30
     fiddlers, 24 roosting monarchs).
   - The shader check on a real GPU: `npm run dev`, then in the console
     `await import('/tools/shader-check.js'); await __SHADERS__()`. Expect 27 programs, no errors.
   - Phones: `node tools/mobile-check.mjs --device=pixel7` and `--device=iphone`.
   - Montages: `node tools/audit48.mjs --towns=seabright-nj,miamibeach-fl,asheville-nc,chicago-il,tucson-az,santamonica-ca,seattle-wa`,
     then read `shots/audit48/<town>-montage.jpg`.
3. **Walk these places** (`npm run dev`, then `http://localhost:5173/?at=LAT,LON&date=YYYY-MM-DD&hour=H`).
   - The shore, July, midday (`?region=shore&date=2026-07-15&hour=12`): laughing gulls with a few
     ring-billed on the beach. Fiddler crabs on the sand: walk up and the whole flat goes down its
     burrows; the males wave their great claws. Turtles on logs at the ponds slide off with a splash.
     Darners patrol the water's edge. Monarchs over the gardens. The cicadas' chorus in the trees in the
     afternoon.
   - The Georgia coast, July (`?at=31.99,-81.0&date=2026-07-15&hour=11`): smooth cordgrass right down to
     the water on the salt marsh; an alligator on a bank that slides in; green anoles up the trunks
     flashing their pink throat fans; crawfish chimneys in wet lawns.
   - New Orleans, July, then January (`?at=29.95,-90.07&date=2026-07-15&hour=10`, then
     `date=2026-01-15`): duckweed's lime carpet on the still ponds, never the river, gone in January.
     Crawfish on the banks raise their claws and back off.
   - Monterey's coast, December (`?at=36.62,-121.92&date=2026-12-15&hour=13`): monarchs hanging in
     clusters under the crown of the biggest tree about; on a warm afternoon some fly out and settle again.
   - Yosemite Valley, late October (`?at=37.745,-119.59&date=2026-10-25&hour=14`): black oaks gold among
     the pines. The Sierra foothills (`?at=38.9,-121.08`): gray pines, leaning and sparse, among the blue
     oaks.
   - Tucson, May (`?at=32.22,-110.97&date=2026-05-15&hour=10`): side-blotched and spiny lizards doing
     push-ups and dashing a few metres; a collared lizard running on its hind legs; rarely a horned
     lizard that sits tight.
   - Chicago, July, then late September (`?at=41.88,-87.62&date=2026-07-15&hour=12`, then
     `date=2026-09-20`): ring-billed and herring gulls on the lots and the fields; in September the
     monarchs streaming south overhead.
   - Seattle, November (`?at=47.6,-122.3&date=2026-11-10&hour=15`): banana slugs on the forest floor that
     draw in their tentacles when you stand over one.
   - Asheville, June, early morning (`?at=35.6,-82.55&date=2026-06-15&hour=7`): a black bear standing up
     to look before it goes; a sow's cubs going up a tree.
   - **How common the animals are.** Sea Bright, July, at dusk (`?region=shore&date=2026-07-15&hour=19`):
     squirrels, robins, gulls, the odd raccoon — a turkey or a fox only now and then over a long walk,
     not round every corner. Then the woods (`?at=40.25,-74.35&date=2026-07-15&hour=19`, the Pine
     Barrens' edge) or Seattle's Discovery Park against downtown: more deer, turkeys, foxes out of town;
     an elk a rare find in the Cascades' foothills. Say which species feel too common or too rare (one
     line each in `ABUNDANCE`, `src/assets/fauna.ts`).
   - **The water's life.** The shore in July from the beach or a jetty, looking out (`?region=shore&date=2026-07-15&hour=10`):
     a dolphin pod rolling past beyond the breakers. The same in January (`date=2026-01-20`): harbor
     seals hauled out or riding low, humping into the water when you come; with luck a humpback's blows
     far out, then its flukes. Key West's or Miami's shallows (`?at=24.55,-81.8&date=2026-03-15&hour=12`):
     schools of little fish milling under the surface, mullet leaping, a tarpon rolling. Puget Sound,
     summer (`?at=47.6,-122.43&date=2026-07-15&hour=14`): orcas, the odd breach; harbor seals.
     Monterey (`?at=36.62,-121.9&date=2026-01-15&hour=12`): sea otters on their backs, sea lions, a gray
     whale's blows. A beaver pond: the beaver's wake, the tail slap and dive when you come. A Chicago
     river in July: the silver carp jumping when you're close.
   - **The panel's Creatures folder** (`` ` `` opens the panel): pick an animal, "go see it" — it should
     land you where it lives at the right month and hour, by its water if it keeps to one, then say how
     far and which way it is. Try a near one (the dolphin from the shore) and a far one (the orca).
   - **Each animal on its own ground** (the ecosystem review): no gulls or pigeons standing in the roads
     (lots, plazas, the beach); no deer, rabbits or turkeys milling in the street (they still dash across
     it when chased); fiddler crabs on salt-marsh mud, not the swimming beach (where the map has no
     marsh, none); herons and egrets at ponds, rivers and marshes, not in the surf; robins gone from
     northern lawns in midwinter; no fish rising in a northern January.
   - **How busy** (toned down after Robby's phone walk, Sea Bright to the Rumson bridge): fewer people,
     cars and animals everywhere, a phone at half again; no gulls standing in the roads (parking lots and
     the beach only). The knobs are in Life & sound (everywhere, suburbs & country, main streets, cities,
     the beach, how many animals). If a slider was ever moved, "reset all settings" (Debug) brings the
     new defaults back.
4. **Watch for:** frame rate with the bigger casts (PC and phone) and by the water (the fish, rings
   and blows are few and capped — say if the shore's frame rate dips); anything floating, sunk or
   pointing the wrong way; a lizard, crab or slug too small to notice (they're drawn larger than life on
   purpose: say if it's too much or too little); the duckweed's look up close; the cordgrass at a
   marsh's edge.

Known gaps, by design for now: the duckweed doesn't part in a wake; the slug leaves no slime trail; the
crawfish chimneys stand all year; no snakes, frogs,
bees or grasshoppers yet (the reference's P2 plans).

## How to work in this cloud session (Robby's call)

The game was smooth and rendering before this work started. Work fast, and keep the work great.

- **No slow captures.**
  - Don't run in-game captures: no `capture.mjs`, `light-shots`, `spot-shots`, soak or audit
    tools. Under the box's software GL they take tens of minutes.
  - Don't run the full test suite or `npm run init` as routine.
- **Review the fast way.**
  - **Read your own code carefully**: the geometry, the GLSL, the placement rules.
  - Run `npm run typecheck`.
  - Run only the test files you touched or added, e.g.
    `npx vitest run tests/foundry.test.ts tests/streetTrees.test.ts`.
  - **A quick picture when it helps**, if it works:
    `node tools/tree-studio.mjs --tag=<tag> --kinds=a,b,c` → `shots/trees-<tag>.jpg`. That's the
    foundry's trees side by side, no game boot. Read the montage. If it's slow or fails, skip it
    and rely on reading the code.
  - **After a GLSL change**, run the shader compile check if it works: on a dev page,
    `await import('/tools/shader-check.js'); await __SHADERS__()`. Drive it with Playwright plus
    `tools/pw-proxy.mjs proxyArgs()`, as `tree-studio.mjs` does. A shader that doesn't compile
    blanks the trees, so at minimum re-read every `#if` path you touched.
- **CI does the heavy checking.** A push to `feature/*` runs typecheck, the full `npm test`, the
  build and a playtest (`.github/workflows/playtest.yml`), and publishes Pages (`pages.yml`).
  - After pushing, check that the run went green: `mcp__github__actions_list` on `dero24/map_game`,
    branch `feature/lower48-alive`.
  - If it went red, fix it before the next package.
- **Missing keys: skip it, don't chase it.** The cloud box has no Cloudflare or Mapillary keys and
  Robby knows. That parks three things; leave them alone:
  - the canopy layer;
  - the R2 uploads and worker deploys;
  - the Mapillary photo comparison.

  Everything in the foundry runs without keys, and that's the work.

## Where things stand

- **Branch `feature/lower48-alive`** (off `feature/foundation-first`). Work and push here. `main`
  is for PRs; don't open one unless Robby asks.
- The last commit before this handoff was 4b87a07; the tree was clean and CI was green.
- **Built** (`models.md` build order):
  - **#1, the Northwest:** Douglas fir, western hemlock, Sitka spruce, western redcedar, red alder,
    vine maple; moss on bark; the forest floor.
  - **Regions as data:** `world/ecoregions.ts ecoAt(lat, lon)` gives the region (`REGIONAL_LIFE.md`
    §2), the EPA Level III code and the state.
    - These ride the style key (`…/<region>.<l3>.<state>`).
    - `castOf(style)` hands every mix a `CastPlace` `{ climate, sub, eco, l3, west, state }`.
    - **Every new mix takes a `CastPlace`, never a place name.**
  - **#2, live oaks and their hangers:**
    - `flora.ts OAKS`: southern, plateau and coast live oak, three forms each.
    - `assets/hangers.ts`: Spanish moss, resurrection fern, ball moss and lace lichen, in two loads,
      each tree its own tone.
    - The motion is `propMaterial`'s `hang`, a pendulum per strand, out of step with its
      neighbours. The fern greens after wet spells (`U.uWet`).
  - **#3, the northern and mountain forests:**
    - `PINES`: white pine, ponderosa, lodgepole.
    - `SPIRES` rows: red spruce, balsam fir, Engelmann spruce, subalpine fir, eastern hemlock.
    - Aspen, whose leaves tremble (`propMaterial` `MOTION` 1); willow thickets; snags.
    - Placed by `coniferMix` by elevation band, with aspen groves, willow thickets and snags.
  - **#4, the eastern hardwoods, the flowering understory, the southern pines** (2026-10-05; LOG
    "Regional life (4)"):
    - `LEADERS`: tulip tree, sweetgum, shagbark hickory, yellow buckeye. `OAKS` rows: sycamore, bur
      oak. `CLUMPS`: redbud, crape myrtle, rosebay. The dogwood's tiers. `PINES` rows: loblolly,
      longleaf (grass stage, bottlebrush, old), slash pine. The redcedar.
    - `render/treeSeasons.ts`: blossom types 1–5, fall hues 0–7, the bloom windows as data on
      `U.uSpring` / `U.uSummer`. `MOTION` 1 tremble, 2 tiers bobbing, 3 needles tossing. The cards'
      flags: `falls 1 + 2·hue + 16·bloom + 128·motion` (`flora.ts packCardFlags`).
    - 24 leaf pictures. Rhododendron and azalea in the gardens.
    - Placement: `broadMix` + `rangeIn`, `coniferMix`'s southern pines, `bankMix`, `redcedarShare`,
      `rosebayShare`, `understoryTrees`, `treeHeight4`, `SMALL_TREE`.
  - **#5, the swamps and the rivers** (2026-10-05; LOG "Regional life (5)"), all but duckweed:
    - `CYPRESSES` (the `cypress†` genome): bald cypress and pond cypress, a fluted foot shell
      (`flaredFoot`) and knees. Water tupelo on `LEADERS` with `foot`. Cottonwood and Fremont as `OAKS`
      rows, `MOTION` 1.
    - Placement: `swampMix`, `swampForm`, `bankMix` (cottonwoods, Fremont's, cypress).
  - **#6, California** (2026-10-05; LOG "Regional life (6)"):
    - Valley oak and blue oak as `OAKS` rows; coast redwood and giant sequoia as `SPIRES` rows (`foot`,
      `burls`, `scar`, the `round` and `reit` tops); manzanita as a `CLUMPS` row (`dead` stems) with
      blossom 6 on `U.uWinter` (`season.ts winter`).
    - The golden hills: `season.ts hay` → `U.uHay` (the grass, `grass.ts`; the ground's `uBiome.x`
      scaled in `main.ts`). Mind the name: `uGolden` is the golden hour's.
    - Placement: `broadMix` + `rangeIn`, `redwoodCountry` (EPA 1 + `ecoregions.ts caRedwoodBelt` on EPA
      6), `sequoiaBand` + `SEQUOIA_GROVE` (props.ts groves by 600 m patch), `manzanitaShare`, `westForm`;
      the LiDAR's giants kept to 116 m there.
  - **#7, the desert** (2026-10-05; LOG "Regional life (7)"):
    - Far-only builders (`DESERT_FAR`): saguaro (`fluted`), prickly pear, cholla, ocotillo, Joshua
      tree; their flowers and fruit as `BLOOM_PART` parts (blossom 7–10, `DESERT_BLOOM`, `fruitNow`);
      the ocotillo's rain leaves (FALL_HUE 8, `rainLeaves`, `uWet` now in the shared GLSL); `STIFF`.
    - `CLUMPS` rows creosote, Utah and Ashe juniper, big sagebrush; `PINES` row piñon.
    - Placement: `desertMix`, `desertTrees`, `pjBand` (props.ts `dryShrub`, `dryTree`).
  - **#8, the palms** (2026-10-05; LOG "Regional life (8)"):
    - `fanFrond` (sabal, saw palmetto), `featherFrond` (royal, queen, Canary), `keepUp`; MOTION 4 (far
      only) for every palm, the old coconut and fan palms too.
    - Placement: `broadMix` + `rangeIn`, `palmMix` (props.ts `palmsGrow`: January's mean > 3.5 °C),
      `palmettoShare`.
  - **#9, the ground layers** (2026-10-05; LOG "Regional life (9)"), all but smooth cordgrass:
    - The forest floor's bracken (`frond` form) and cinnamon fern, their autumn and dormancy as data.
    - The grass field's tuft kinds (`aKind`, `wildTuft`): the prairie's bluestems (`prairieMix`) and
      wildflower drifts (`WILDFLOWERS` on `U.uYear`, `wildflowerMix`).
    - Kudzu, a tree kind on the South's wood edges (`kudzuShare`, props.ts `woodEdge`).
  - **#10, the fields** (2026-10-05; LOG "Regional life (10)"): `world/fields.ts` (`cropMix`, `fieldAt`,
    `CROP_CAL`, `cropStage`, `cropWash`, `GLSL_CROPS`); the crops grown in the grass field's cropland
    cells (`grass.ts` `crops`, `cropMaterial`); the fields' wash in `groundPaint.ts`.
  - **#11, the backyard birds** (2026-10-05; LOG "Regional life (11)"), the first wildlife package:
    - `fauna.ts BirdPlan` marks (hood, cap, mask, necklace, neckC, breast, bars, barred, crestTilt,
      `bill`, wedge, tailTip, wingL); `tailFan`, `wingBar`, `wingStripe`.
    - Every bird: a neck; wings closed along the flank in `critterMaterial` (the shoulder at the flank);
      one leg `P.fore`, one `P.hind` (GAIT x: 0 hop, π walk); birds' GAIT w negative (a peck down);
      `FLAP` / `flapOf`; `uFlap.y` 2 = a butterfly.
    - Cardinal, blue jay, robin, Steller's jay, Gila woodpecker, mourning dove, crow, pigeon (TINT parts
      painted per bird by `critters.ts SPEC.colors`; `CRITTER_TINT` for portraits); pigeons weighted by
      `urban` and allowed on paved open ground.
  - **#12, the water and big birds** (2026-10-05; LOG "Regional life (12)"):
    - `BirdPlan` `neck` (+ `neckCol`, `neckW`), bills `flat`/`dagger`/`spoon`/`pouch`/`hook`, `cheek`,
      `wattle`, `wingTip`, `trail`, `noLegs`; `FLIGHT` (mode 1 soar, 3 glide; the dihedral) in `uFlap`
      (vec3); pose 4 = display (the turkey's fan).
    - The sim's new roles `waterfowl`, `wader`, `gull`, `fowl`; states `glide`, `alight`, `skim`,
      `hover`, `plunge`, `dive`; `Critter.wl` (its water's level: `level()`, `swimSink`), `show`;
      `STOOPS`, `FLOCKS`; raptors want 3 where vultures fly.
    - `faunaMix(…, month)` with `SEASON`; `WATER` per region. `assets/signs.ts` (the nest) placed in
      props.ts.
  - **#13, the mammals on the existing bases** (2026-10-06; LOG "Regional life (13)"):
    - `Quad`: `stripes` (`backStripe`), `mask`, `blaze`, `tail` (ringed/naked/plume/paddle/stub),
      `girth`, `legs`, `mane`, `legC`, `rump`, `snout`, `hump`, `bell`, `antlers` (`antlerSide`, part 9:
      the shader hides it unless aAnim.z ≥ 10; the sim's `RACK` says who and when).
    - Roles `forager`, `herd`; states `possum`, `warn`; `Critter.sit`, `yip`; `sitPivot`; `MAMMALS` per
      region; `critterBudget` (2,500 / 2,000 / 1,600); `Critters.drawn` (animals behind not drawn).
    - `signs.ts`: `cellSpots`, `beaverLodges`, `prairieTown`, `prairieMounds`.
  - **#14, the new plans** (2026-10-06; LOG "Regional life (14)"): `bearGeometry`, `bisonGeometry`,
    `armadilloGeometry`, `manateeGeometry` (`NEW_PLAN`); `Critter.lead` (a cub keeps by its mother),
    the `wallow` state, the bear's stand (`sitPivot`, its own count before it goes), `WEST_BEAR`.

## The bar: detail, variety, variation

This is Robby's priority for every model. "alot of variety even per species, color, all that".

- **At least three grown forms per species:** open-grown, forest and old, or the species' own (the
  live oak's alley, the longleaf's grass stage, the pollarded crape myrtle). Two trees of one kind
  side by side must never look stamped.
- **Per-tree variation from the seed:**
  - lean, crown asymmetry, a broken limb;
  - height across the real range;
  - bark tone, and leaf green: each species its own green, then a shift per tree.
  - Fall colour and bloom colour vary per tree; for the sweetgum, per lobe.

  Use `variantAt`/`hashf` and the instance seed, carried in flat varyings (rule 7). Never add
  `rng.float()` calls to `props.ts`'s scans: that reshuffles every region.
- **Silhouette first.** A tulip tree, a sycamore and a white oak must tell apart at 100 m by shape
  alone.
- **Detail where you stand:** bark character (shaggy hickory, mottled sycamore and crape myrtle,
  corky sweetgum), and leaf pictures matched to the leaf.
- **Motion that belongs to the plant.** We have:
  - the aspen's tremble;
  - the moss's pendulum;
  - the fern curling dry.

  Add more like these: the dogwood's tiers bobbing, the willow's whips streaming, palm fronds
  thrashing in a gust, the longleaf grass stage shivering.
- **Seasons are variation too:** bloom windows, early and late turners, evergreens that bronze in
  winter.
- **Within budget:**
  - far model under 1,500 vertices;
  - near model at most 2,500 vertices, with 8–20 cards;
  - the near trunk at the ground at least 1.3× its width where it meets the crown;
  - built under 14 m and scaled to the real tree.

  Detail comes from smarter geometry (sprays, ribbons, card pictures), not more vertices.

## Package #4, the eastern hardwoods, flowering understory and southern pines — built

Built 2026-10-05 as designed below (kept as the record of the design; LOG "Regional life (4)" says
what changed from it: the tree studio found hollow crowns and umbrella sycamores, both fixed).

**The trees.** Append these to the end of `TREE_KINDS`. There are 35 kinds today; the last is
`snag`, index 34. Each needs three forms, with far and near models.

| kind | the shape that makes it read | colour and season |
|---|---|---|
| `tuliptree` | ramrod trunk, a high narrow crown, bare below | yellow in fall |
| `sweetgum` | pyramidal young, rounder later | autumn a *jewel mix* per lobe: purple, red, orange, yellow |
| `hickory` | tall oval crown; shaggy bark in curling strips (reuse `plan.hang` strips) | golden-bronze fall |
| `buckeye` | rounded, low-branched | first to turn: early orange, bare by October |
| `sycamore` | an `OAKS`-style row: massive limbs, mottled bark, white upper limbs | tan-brown fall |
| `buroak` | an `OAKS` row: savanna-wide, thick corky limbs | russet fall |
| `dogwood` | small, layered horizontal tiers | white bracts in April; red in fall |
| `redbud` | multi-trunk, flat-topped spread | magenta along bare limbs, Mar–Apr |
| `crapemyrtle` | multi-trunk vase, mottled bark; v2 pollarded with knuckles | summer cones, a colour per tree: pink, watermelon red, lavender, white |
| `loblolly` | a `PINES` row: tall bare bole, small high crown | none |
| `longleaf` | a `PINES` row: grass stage, bottlebrush sapling, old flat-topped | none |
| `slashpine` | a `PINES` row: a rounder open crown | none |
| `redcedar` | dark columnar spire, on old fields and fence lines | bronze-green in winter |
| `rosebay` | rhododendron thicket by Appalachian streams | white-pink trusses, early summer |

Garden `SPECIES`:
- rhododendron, blooming in May;
- azalea, blooming Mar–May, coloured per plant: hot pink, coral, white or magenta.

Add them to `REGION_GARDEN` for the Southeast, Appalachia and the Mid-Atlantic.

**The materials.**
- **`BLOSSOM` becomes a type, not a boolean.**
  - The types: 1 cherry, 2 dogwood, 3 redbud, 4 crape myrtle, 5 rosebay.
  - Put shared GLSL helpers (bloom colour and timing) in `GLSL_SHARED` (`src/render/shared.ts`,
    around line 108) for `propMaterial` and `leafCards` to share.
  - Crape myrtle and rosebay bloom in summer. Add `U.uSummer` from `season.ts`, high when the air
    is about 20–24 °C or warmer; set it in `main.ts` beside `uWet`.
- **New `FALL_HUE` values:** 4 jewel, 5 orange (early), 6 russet. Today there are only 1–3.
- **Re-lay the leaf-card flags** in `nearTrees.ts` and the decode in `leafCards.ts`, both together.
  The aspen's flutter must still work.
  - Today: `falls 1 + 2·hue (2 bits) + 8·bloom + 16·flutter`.
  - New: `falls 1 + 2·hue (3 bits) + 16·bloom type (3 bits) + 128·flutter`.
- **`pack.ts`:** the `PMat` prop's `blossom` becomes a number.
- **Kind sets:** update every set that a new kind belongs in:
  - `NEEDLED`, `DECIDUOUS`, `FALL_HUE`, `NEAR_KINDS`, `FLUTTER`, `LEAFLESS`;
  - in `props.ts`, the kind constants and heights.

**Placement.**
- **`REGION_BROAD`:**
  - tulip tree, hickory and buckeye in Appalachia and the Midwest woods;
  - sweetgum in the Southeast and the Mid-Atlantic;
  - sycamore along streams;
  - bur oak on the Midwest and Plains edges;
  - dogwood and redbud as understory and yard trees, from the Mid-Atlantic south and in the
    Midwest;
  - crape myrtle on streets and in yards in Texas, the Southeast, the Gulf and Florida;
  - redcedar on old fields east of the Plains.
- **`coniferMix`**, the southern pines in the southeast, gulf and florida regions and Texas's L3 35:
  - loblolly in the Piedmont and in plantations;
  - longleaf on the sandhills and the coastal plain;
  - slash pine in Florida and on the Gulf.
- **`rosebay`** near streams in Appalachia.

**Tests**, small and targeted:
- **`foundry.test.ts`:** the budgets and shape of each new kind.
- **`streetTrees.test.ts`**, the range rules:
  - no crape myrtle in the North;
  - longleaf only on the southern coastal plain;
  - rosebay only in Appalachia;
  - no sweetgum in the West.
- **The flags:** a round-trip test of the new layout.

**Close out:**
- mark #4 built in `models.md`;
- add the blossom types and flags to `docs/agent/rendering.md`;
- update `LOG.md` and `feature_list.json`;
- commit, push and check CI.

## After #4

Robby, 2026-10-05: "continue on what you were originally doing … just make note of person thing" and
"you can keep doing trees and vegetation if unfinished … just ensure that is maintained". So the
vegetation packages go on in order (#5 next); the people work is noted as `people-with-purpose` in
`feature_list.json` (rank 11.45: walkers on errands, homes private, buildings with a capacity, smooth
blended animation, a built-in rig and clip maker — its notes say what the code does now and the plan).
In a cloud session that work is tested headless (`tests/lifeSim.test.ts`) and on the kit page; the
in-game look is checked on Robby's PC.

- **#5:** built (2026-10-05); duckweed 2026-10-06 (the lake shader on still water, LOG "the
  leftovers") — it doesn't part in a wake yet.
- **#6:** built (2026-10-05); the black oak and the gray pine 2026-10-06.
- **#7:** built (2026-10-05). Rarer desert rows (organ pipe, barrels, chain-fruit cholla, bursage)
  can ride a later package on the same genomes.
- **#8:** built (2026-10-05).
- **#9:** built (2026-10-05); smooth cordgrass on the salt marsh 2026-10-06.
- **#10:** built (2026-10-05). Cotton, peanuts, rice, orchards, vineyards and hay could follow on the
  same field system (a crop each: a calendar row and a geometry).
- **#11:** built (2026-10-05); the long neck, swimming, the bare head and the hover came with #12. A scratch bird studio (perched side on, from above, flying; the fold applied on
  the CPU) is how the birds were reviewed: the in-page tree studio's pattern with `critterLib`.
- **#12:** built (2026-10-05); the inland gulls (ring-billed, herring) 2026-10-06.
- **#13:** built (2026-10-06) but for the beaver's dam (it needs a stream's line; the lodge stands in
  ponds and lakes).
- **#14:** built (2026-10-06). The bison stand in "deep open country" until the map's protected areas
  reach the sim (they're kept herds: parks and preserves).
- **#15:** built (2026-10-06); the West's lizards too (the reference's P2 §13.1: fence, side-blotched,
  spiny, collared, horned — rows on the same `sprawlerGeometry`, LOG "the West's lizards"). The snakes
  and frogs need their own plans (snake†, frog†).
- **#16:** built (2026-10-06): all sixteen build-order packages are in. Left out of #16: the slug's
  slime trail, the chimneys' season, the fiddlers on marsh mud (the map doesn't tell it from the beach),
  crawfish seen under the water.
- **Next for the wildlife:** the reference's P2 rows (`models.md` §13 on): the snake† and frog† plans,
  more insects on the bug† and dragonfly† plans (bees, skimmers, grasshoppers, the spotted lanternfly).
- **Before 1.0:** a lighter version of each animal for phones and far off (about 40% of the vertices),
  like the trees' far model and the crowd's lite person.
  - The casts go in `faunaMix`, by `CastPlace`.
  - A range-rules test, from `docs/regional-life/ranges.md`.
  - Robby asked for "amazing animation"; each `models.md` row says how its animal moves.
- **Also queued, no keys needed:**
  - the ground under a wood as duff and moss;
  - moss on boulders;
  - the bug `upstairs-over-shopfront`: an upstairs flat's floor and furniture stick out over a
    shopfront (the Bonobos building, Brooklyn).
- **Parked until keys exist:**
  - the canopy layer (NLCD → R2);
  - the OSM genus → kind mapping in `realTile.treeKindOf`, which needs a worker cache bump and a
    deploy;
  - the Mapillary green-spot comparison.

## Robby's rules

- Do the work yourself. Use at most one subagent, for a bounded side task.
- Commit and push after each package. Write a LOG entry each session, and tests for every new
  system.
- Quote Robby's own words in the feature notes.
- Mapillary: never print or commit the token; photos stay in the git-ignored `raw/mapillary/` and
  are never shipped. Never unblur faces or plates. Never use Mapillary Vistas.
- Never use Google Street View. Public places and public data only.
- Ask Robby before anything touching privacy or a big redesign.

## Things that bit us

- Many files are CRLF. A script that edits them must keep the line endings.
- A vitest title with an apostrophe goes in double quotes.
- **Leafless kinds** (`snag`): the leaf merge is guarded, and `crownR` has a floor of 0.6.
- **Conifer clumps** are *sprays* (`lobe(…, { dir, stretch, bend })`). Flat blobs read as stacked
  plates on a pole.
- **Hangers:** each type keeps its own host list, and `props.ts` skips an empty geometry.
- **Terrain:** `heightAt` is absolute elevation (sea level is 0), and the virtual-region test
  terrain is flat. Elevation-band tests pass the elevation in directly.
- **vitest silences console output.** A scratch test (`tests/_dbg.test.ts`, git-ignored) writes to
  a file via `(await import('node:fs'))` with `// @ts-ignore`. Delete it before typecheck:
  `@types/node` isn't installed.
- **Killing processes:** `pkill -f <pattern>` matches your own shell. Kill by PID.
- **Chromium needs `tools/pw-proxy.mjs` `proxyArgs()`** behind the session's proxy.
  `tree-studio.mjs` already uses it.
