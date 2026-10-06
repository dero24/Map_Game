# Road to 1.0

The plan of record for finishing the game: what's done, how the work is divided, and the order of
the milestones to a 1.0 release. `feature_list.json` tracks the items; this doc gives the order and
what "done" means. Written 2026-10-06; update it when a milestone closes or the plan changes.

## Where we stand (2026-10-06)

| Tier | What it means | State |
|---|---|---|
| **0** | The world loads everywhere | 9 of 9 items passing; the playtest runs on every push |
| **1** | It looks right everywhere | 32 passing, 2 in progress (regional flora, regional wildlife), 15 not started, 1 blocked |
| **2** | The game itself | 26 items, none started yet (by design: foundations first) |
| **3** | Polish | 14 passing, 11 not started |

Regional life (`docs/regional-life/models.md` build order): **14 of 16 packages built**.

- **Plants:** all 10 packages built.
- **Birds:** both packages built: the backyard birds, then the water and big birds.
- **Mammals:** both packages built: on the existing body plans, then the new plans (bear, bison,
  armadillo, manatee).
- **Still to go:** reptiles and small life.

## The 16 regions

The lower 48 split by ecology, not by state: EPA Level III ecoregions grouped into sixteen
(`docs/REGIONAL_LIFE.md` §2, `src/world/ecoregions.ts`). States only matter for range limits.

| # | Key | Region | Reference towns |
|---|---|---|---|
| 1 | `new-england` | New England | Boston, Portland ME, Burlington VT, Bar Harbor |
| 2 | `upstate-ny` | Upstate New York and the Adirondacks | Albany, Buffalo, Syracuse, Lake Placid |
| 3 | `mid-atlantic` | The Mid-Atlantic coast | New York City, Philadelphia, Baltimore, Washington, Sea Bright |
| 4 | `appalachia` | Appalachia, Kentucky, the Smokies, the Blue Ridge | Pittsburgh, Asheville, Knoxville, Nashville, Lexington KY |
| 5 | `southeast` | The Southeast Piedmont and coastal plain | Atlanta, Charlotte, Raleigh, Savannah, Charleston SC |
| 6 | `florida` | Florida | Miami, Orlando, Tampa, Jacksonville, Key West |
| 7 | `gulf` | The Gulf Coast and the Louisiana bayous | New Orleans, Baton Rouge, Mobile, Pensacola, Memphis |
| 8 | `texas` | Texas: Hill Country, coast, brush country, Panhandle | Austin, Houston, Dallas, San Antonio, Lubbock |
| 9 | `plains` | The Great Plains | Wichita, Omaha, Oklahoma City, Fargo, Billings |
| 10 | `midwest` | The Midwest and Great Lakes | Chicago, Detroit, Cleveland, Indianapolis, Minneapolis |
| 11 | `ozarks` | The Ozarks and the Ouachitas | Springfield MO, Branson, Fayetteville AR, Hot Springs |
| 12 | `rockies` | The Rocky Mountains | Denver, Boulder, Estes Park, Aspen, Bozeman, Missoula |
| 13 | `desert-sw` | The Southwest deserts | Phoenix, Tucson, Las Vegas, Albuquerque, Santa Fe, El Paso |
| 14 | `great-basin` | The Great Basin and the Colorado Plateau | Salt Lake City, Reno, Boise, Moab, Flagstaff |
| 15 | `california` | California | San Francisco, Los Angeles, San Diego, Sacramento, Eureka, Yosemite |
| 16 | `pnw` | The Pacific Northwest (wet west side, Cascades, dry east) | Seattle, Portland OR, Eugene, Bend, Spokane, the Hoh |

## How we divide the work: build by system, check by region

- **Not by state.** Most work is shared: one raccoon or one oak serves thirty states. Building state
  by state would redo the same models over and over, and per-place lists break the rule that
  everything comes from data.
- **Build by system.** One body plan or tree family at a time (the oaks, the bird plan, the deer
  plan). Each package fills every region at once, through the regional mixes and range rules.
- **Check by region.** Each of the 16 regions has a row on the scorecard below. A region is done
  when every layer is green and its montage of reference towns has been reviewed against real
  photos (`tools/real-compare.mjs`, `tools/audit48.mjs`). The scorecard shows what's left and stops
  gaps slipping through (today, for example, the Midwest has no gulls).

## The tracks

Separate tracks touch different files, so each can run as its own session on its own branch without
collisions.

| Track | Work | Where it runs |
|---|---|---|
| **A. Regional life** | Packages 13–16: mammals, new animal plans, reptiles, small life | Cloud sessions (tests and the scratch studio; no long captures) |
| **B. Region pass** | Montages per region against the scorecard; fix what's wrong | Robby's PC or a session that can run captures (they're too slow in the cloud) |
| **C. People** | `people-with-purpose`: walkers on errands, homes only for those who live there, buildings with a capacity, smooth animation | Its own branch; mostly `sim/` and `life` files |
| **D. Leftovers** | Duckweed, smooth cordgrass, black oak and gray pine, inland gulls, moss on the ground and on boulders, `upstairs-over-shopfront` | Fill-in work between packages |
| **E. Needs keys** | The canopy layer (NLCD in R2), map species to tree kinds (`realTile.treeKindOf`), the Mapillary comparison and objects | When the Cloudflare and Mapillary keys are in the environment |

## Milestones to 1.0, in order

Each milestone closes with its evidence: tests passing, CI green, reviewed montages where visuals
changed, and `feature_list.json` updated.

1. **Regional life complete** (Track A, then D). Packages 13–16 and the leftovers. *Done when:* every
   region's Trees, Ground, Birds, Mammals, Reptiles and Small life cells are green.
2. **Green density** (Track E). `regional-greenery`: the game shows 24% vegetation where the photos
   show 35%. Needs the canopy layer, which needs the Cloudflare key. *Done when:* every region is
   within 5 points of its photos.
3. **The region pass** (Track B). Every region's montage reviewed and fixed: trees read as the
   region's own, towns look like themselves (`place-parity`). *Done when:* all 16 rows are green.
4. **People with purpose** (Track C). Errands, private homes, capacities, smooth blended animation.
   *Done when:* a 10-minute walk shows no crowding inside buildings and no aimless wandering, with
   tests in `tests/lifeSim.test.ts`.
5. **The rest of Tier 1.** Public places (airfields, fuel, campgrounds, marinas), street furniture
   where the map puts it, the night look, phone sharpness on real devices, GPU quality tiers,
   interiors at real scale, every front door opening, tall structures, steady ground when flying high.
6. **The game core** (Tier 2, `docs/GAMEPLAY_VISION.md` §15). In the vision's order, as far as the 1.0
   line below.
7. **Release.** Every data licence recorded in `docs/DATA_SOURCES.md` and a credits screen;
   performance holding on phones; saving that survives updates; the first ten minutes
   (`GAMEPLAY_VISION.md` §8) smooth from start to finish; a store build.

## What 1.0 is (agreed with Robby, 2026-10-06)

**In 1.0:** the lower 48 loading and looking like itself on PC and phone (milestones 1–5), and the
core loop — explore, collect, travel:

- **The bloom:** the world turns from pencil to colour as you look.
- **Pencil collecting:** tap to paint; the card goes into the sketchbook.
- **The van-home start and placing things at home.**
- **Moving is fun:** the hop, wading and swimming, the bike.
- **Regional rares,** with "today in your town" and the events calendar: reasons to wander and to
  come back.
- **Van travel across the country,** with the old sketchbook's riddle pages as the reason to go.

**After 1.0 (1.x updates):** placing things in the world, combining cards, things to do at real
places, growing the home, the yacht, plane and balloon, the portal gun, the dog, friends and visits,
"paint anything".

## Region scorecard

Updated as packages land. Key: **done**; **part** = built with a known gap (in the notes);
**none** = not built yet; **blocked** = waiting on Track E; **to do** = not reviewed yet.

| Region | Trees | Ground | Birds | Mammals | Reptiles | Small life | Density | Reviewed |
|---|---|---|---|---|---|---|---|---|
| new-england | done | part (a) | done | done | none | part | blocked | to do |
| upstate-ny | done | done | part (b) | done | none | part | blocked | to do |
| mid-atlantic | done | part (a) | done | done | none | part | blocked | to do |
| appalachia | done | done | part (b) | done | none | part | blocked | to do |
| southeast | done | part (a, c) | done | done | none | part | blocked | to do |
| florida | done | part (a, c) | done | done | none | part | blocked | to do |
| gulf | done | part (a, c) | done | done | none | part | blocked | to do |
| texas | done | part (a) | done | done | none | part | blocked | to do |
| plains | done | done | part (b) | done | none | part | blocked | to do |
| midwest | done | done | part (b) | done | none | part | blocked | to do |
| ozarks | done | done | part (b) | done | none | part | blocked | to do |
| rockies | done | done | part (b) | done | none | part | blocked | to do |
| desert-sw | done | done | done | done | none | part | blocked | to do |
| great-basin | done | done | done | done | none | part | blocked | to do |
| california | part (d) | done | done | done | none | part | blocked | to do |
| pnw | done | done | done | done | none | part | blocked | to do |

Notes:

- (a) No smooth cordgrass yet: the salt marsh.
- (b) No inland gulls yet: ring-billed and herring.
- (c) No duckweed on still swamp water yet.
- (d) No black oak or gray pine yet.
- **Mammals** are done everywhere (packages 13–14); the bison stand in for protected land until the
  map's protected areas reach the sim.
- **Small life** is part everywhere: generic butterflies and fireflies are in; package 16 adds the
  rest.

## How sessions pick work

- Read this doc, `docs/earth/HANDOFF.md` and the latest `docs/earth/LOG.md` entry. Take the next item
  on your track; keep one item `in_progress` in `feature_list.json`.
- **Every package:**
  - tests for every new system;
  - typecheck and the touched tests, then the full suite once before committing;
  - a reviewed studio montage when anything visual changed;
  - a LOG entry and the feature list's evidence;
  - commit, push, and check CI before starting the next package.
- **After anything on the boot path** (`main.ts`, the ground paint, `props.ts`, the tile builders), run
  the shore playtest: `node tools/playtest.mjs --region=shore --quick --swiftshader`. Unit tests don't
  start the game; package 10's crash was caught only by CI's playtest.
- Update this doc's scorecard when a package closes a cell.
