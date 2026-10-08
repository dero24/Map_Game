# Rolling out the lower 48 — plan and pass criteria

*2026-09-28. How the game goes from a few finished regions to every place in the contiguous US
without designing towns by hand. Companions: `DATA_SOURCES.md` (§4, the data pipeline) and
`IMMERSION_BACKLOG.md` (the long list). Sea Bright stays the gold standard.*

---

## 1. The bet, and what "works everywhere" means

The game's claim is that any place in the lower 48, built from real data plus seeded procedure,
reads as itself. Seattle was the first real test. Nobody designed it, and it came up as itself:
the Space Needle, Elliott Bay, Queen Anne's grid climbing its hill, Rainier from Kerry Park. The
reviewer scored it 7/10.

Three quality levels, and only one of them has to hold everywhere:

| Level | What it means | Where it applies |
|---|---|---|
| **Hero** | Reviewed by hand to ≥ 8/10; tunes the tables | 6–8 calibration regions (§3) |
| **Plausible** | The real layout, landmarks, terrain, water, clock and light; the right houses, trees and cars for the region. It may be plain. | Everywhere else — the launch bar |
| **Broken** | Roads through hills, cars through each other, floating trees, a wall in your face, the wrong clock, a black or empty frame, a town that won't load | Nowhere. This is what the sweep hunts. |

**The lesson from Seattle:** the failures didn't come from Seattle; they came from *patterns in
the data* the game hadn't met: a crosswalk mapped on every arm of every junction (it broke the
traffic), a street grid turned 32° (it broke the paving), steep grids (they kinked the graded
streets), tags missing from the fallback tiles. Each fix repaired every place with the same
pattern. So the rollout is a **hunt for patterns, run by machines at scale**, with the reviewer
on samples — not more hand-finished regions.

## 2. The gates

| Gate | What | Exit criteria |
|---|---|---|
| **A. Own the data** | Build our own cells for the lower 48 from the Geofabrik US extract + Overture (DATA_SOURCES §4: same `osmToTile`, run offline over the extract; sidecars for LiDAR, NAIP ground classes, tree species, GTFS, AADT), served from R2. Overpass leaves the player's path; OpenFreeMap vector tiles stay as the fallback. | Any cell in the lower 48 answers from R2 in < 1 s (p95); a nightly re-cut from OSM diffs; the cost of storage and serving is known. |
| **B. Calibration regions** | The hero set (§3) reviewed to ≥ 8/10. Each one tunes the tables the rest of its region reads. | Every hero ≥ 8/10, two consecutive rounds. |
| **C. The sweep** | The automated harness (§4) over the named spots (§5) and a random sample (§6); fix whatever systemic patterns it finds; repeat. | The pass criteria in §7. |
| **D. Soft launch** | Open the hero regions' states (WA, NJ, AZ first), with a **Report this place** button: it sends the coordinates, a frame, the check results and a short note, straight into the sweep's spot list. | Two weeks with no "broken" report left unfixed for more than a release. |
| **E. All 48** | Open the rest, state by state from the neighbours of open states outward, watching the report queue. | The report rate per hour of play stays flat as states open. |

## 3. The calibration regions

Each tunes a set of tables (architecture, flora, fauna, cars, day rhythm, sound) for its region.
The rest of that region inherits them.

| Region | Hero place | Status | Tunes |
|---|---|---|---|
| Mid-Atlantic shore | Sea Bright → Monmouth Beach, NJ | ✅ gold standard (baked) | the look itself; shore life |
| Pacific Northwest city | Seattle (Queen Anne, Pike Place) | 🟡 7/10 (round 8b) | hills, dense mapping, marine light, conifers |
| Desert Southwest | Tucson, AZ (or Taos, NM) | 🟡 streamed, reviewed once | adobe, xeriscape, saguaro, desert rhythm |
| Northeast metro | Midtown Manhattan | 🟡 reviewed (NYC rounds) | towers, canyon light, crowds, transit |
| Midwest farm town | Galena, IL + rural Story County, IA | ⬜ | main street, grain elevators, fields, section roads |
| Gulf coast | Savannah, GA or Galveston, TX | ⬜ | live oaks and moss, galleries, humid light |
| Mountain West | Jackson, WY or Estes Park, CO | ⬜ | A-frames, aspen, big relief, snow |
| Southern suburb | Marietta, GA or Plano, TX | ⬜ | sprawl, arterials, cul-de-sacs, big-box lots |

## 4. The sweep harness (`__SWEEP__`)

One run per spot, the same way every time:

1. Load `?at=lat,lon&capture=1` (snap to the nearest street if the point is off-network); wait for
   the real cells round the walker (timeout 60 s — a timeout is itself a failure).
2. Run the audits (all exist today except those marked *new*).
3. Shoot six poses: the street both ways at eye level, the nearest landmark or POI, 60 m up,
   the horizon, golden hour. The id-pass asserts stamp any miss on the sheet.
4. Write `sweep/<run>/<spot>.json` (every number) and `<spot>.jpg` (the contact sheet), then
   roll everything into one report: pass/fail by check × spot category, worst offenders first,
   each linked to its sheet.

| Check | Tool | Pass |
|---|---|---|
| Loads | page + worker errors, time to first real cell | no uncaught errors or worker crashes; first real cell ≤ 3 s median, ≤ 10 s p95 (own tiles) |
| Streets on the ground | `__GRADES__` | no untagged drivable way over 25% (tagged inclines: their own grade + 5%) |
| Traffic | `__CAROBB__` (20 s) + `__CARPROBE__` (150 s) | 0 overlapping cars; no car stopped longer than 90 s; ≤ 40% stopped (≤ 25% target, R.26) |
| Trees | `__TREES__` | none floating (> 3 m above ground), inside a building, or over 45 m |
| Buildings *(new)* | base vs ground under each footprint | none floating or buried by more than 1.5 m |
| Water *(new)* | map water vs ground and streets | no street or building under water; no sea plane over land |
| Frames | `__SPOTS__` id pass | subject ≥ 5% of the frame when there is one; nothing within 2.5 m over 5%, within 4 m over 15%; not inside, not on a roof |
| Exposure *(new)* | luminance histogram of each frame | ≤ 20% of pixels above L 0.9; ≤ 20% below L 0.05 |
| Identity *(new)* | arrival card, clock, season | the right town name; the place's time zone (`tz.ts`); season and foliage match the date and climate |
| Performance | frame time over the six poses | ≥ 30 fps at the default tier on the reference laptop |

**Where it runs.** It needs a real GPU: the cloud container's software renderer manages about one
frame every 100 s. Two options: Robby's PC overnight (Playwright driving Chrome with its GPU, the
`tools/capture.mjs` path), or a rented GPU box once the list is long. At a few minutes per spot,
300 spots is an overnight run.

## 5. The named spots (the first 57)

Coordinates are spot centres; the harness snaps each to the nearest street. `&date=` sets the
season where it matters.

**Dense cores and old cities**

| # | Place | lat, lon | Tests |
|---|---|---|---|
| 1 | Times Square, New York, NY | 40.758, -73.986 | towers, canyon light, crowds, subway entrances |
| 2 | State & Madison, Chicago, IL | 41.882, -87.628 | the elevated L, grid, river bridges |
| 3 | Pershing Square, Los Angeles, CA | 34.049, -118.252 | towers beside freeways, palms |
| 4 | Beacon Hill, Boston, MA | 42.359, -71.068 | brick, narrow old streets, hills |
| 5 | Rittenhouse Square, Philadelphia, PA | 39.950, -75.172 | row houses, a park square |
| 6 | Jackson Square, New Orleans, LA | 29.957, -90.063 | galleries and balconies, the levee |
| 7 | Pike Place Market, Seattle, WA | 47.609, -122.342 | hero: market, bluff, bay |
| 8 | Union Station, Denver, CO | 39.753, -105.000 | a plains city with mountains on the horizon |

**Hills**

| # | Place | lat, lon | Tests |
|---|---|---|---|
| 9 | Lombard Street, San Francisco, CA | 37.802, -122.419 | switchbacks, the steepest streets |
| 10 | Mount Washington, Pittsburgh, PA | 40.432, -80.012 | a bluff grid, inclines, rivers and bridges |
| 11 | Downtown Duluth, MN | 46.787, -92.101 | a steep grid down to Lake Superior |
| 12 | The Counterbalance, Seattle, WA | 47.629, -122.357 | hero: grades, retaining walls, traffic |

**Suburbs**

| # | Place | lat, lon | Tests |
|---|---|---|---|
| 13 | Plano, TX | 33.020, -96.699 | sprawl, arterials, big-box lots |
| 14 | Gilbert, AZ | 33.353, -111.789 | desert suburb, xeriscape, cul-de-sacs |
| 15 | Naperville, IL | 41.751, -88.154 | Midwest suburb, snow belt |
| 16 | Levittown, NY | 40.726, -73.514 | a post-war grid of small houses |
| 17 | Marietta, GA | 33.953, -84.550 | a Southern courthouse square, tree cover |

**Small towns and main streets**

| # | Place | lat, lon | Tests |
|---|---|---|---|
| 18 | Main Street, Galena, IL | 42.417, -90.429 | historic main street on a hillside |
| 19 | Stowe, VT (`&date=10-10`) | 44.465, -72.687 | New England village, autumn colour |
| 20 | Chippewa Square, Savannah, GA | 32.077, -81.091 | squares, live oaks with moss |
| 21 | Taos Plaza, NM | 36.407, -105.573 | adobe, high desert |
| 22 | Old Bisbee, AZ | 31.442, -109.916 | a mining town stacked on slopes |
| 23 | Marfa, TX | 30.309, -104.021 | a tiny desert town, a huge sky |
| 24 | Hannibal, MO | 39.708, -91.359 | a Mississippi river town |
| 25 | Duval Street, Key West, FL | 24.555, -81.800 | tropical, conch houses |
| 26 | Town Square, Jackson, WY | 43.480, -110.762 | mountain town, the Tetons on the horizon |
| 27 | Sea Bright, NJ | 40.361, -73.975 | hero: the gold standard, regression guard |

**Farms and open country**

| # | Place | lat, lon | Tests |
|---|---|---|---|
| 28 | Story County, IA (east of Nevada) | 42.000, -93.400 | cornfields, grain bins, section-line roads |
| 29 | Dodge City, KS | 37.753, -100.017 | grain elevators, feedlots, the plains |
| 30 | Intercourse, PA | 40.038, -76.104 | farms on rolling hills, buggies on the roads |
| 31 | Kerman, CA | 36.724, -120.060 | Central Valley orchards and canals |
| 32 | Clarksdale, MS | 34.200, -90.571 | Delta farmland, a small city |
| 33 | Welch, WV | 37.433, -81.585 | an Appalachian hollow |
| 34 | Thedford, NE | 41.978, -100.576 | Sandhills: almost nothing, done well |

**Coasts and water**

| # | Place | lat, lon | Tests |
|---|---|---|---|
| 35 | Nags Head, NC | 35.957, -75.624 | barrier island, dunes |
| 36 | Camden, ME | 44.210, -69.065 | harbour, rocky coast |
| 37 | Pleasure Pier, Galveston, TX | 29.286, -94.790 | the Gulf seawall |
| 38 | South Lake Tahoe, CA | 38.940, -119.977 | a mountain lake |
| 39 | Grand Haven, MI | 43.063, -86.228 | a Great Lakes beach and pier |
| 40 | Cannon Beach, OR | 45.892, -123.962 | Pacific coast, sea stacks |
| 41 | South Beach, Miami Beach, FL | 25.783, -80.134 | Art Deco, beach, palms |

**Mountains, deserts and parks**

| # | Place | lat, lon | Tests |
|---|---|---|---|
| 42 | Yosemite Valley, CA | 37.746, -119.594 | granite walls, a national park |
| 43 | Grand Canyon Village, AZ | 36.054, -112.140 | the rim, a 1,500 m drop |
| 44 | Moab, UT | 38.573, -109.550 | red rock |
| 45 | Estes Park, CO | 40.377, -105.522 | a Rockies town |
| 46 | Gatlinburg, TN | 35.714, -83.510 | the Smokies, forest to the horizon |
| 47 | The Strip, Las Vegas, NV | 36.113, -115.177 | desert megaresorts |
| 48 | Cedar Pass, Badlands, SD | 43.750, -101.941 | eroded badlands, open prairie |

**Structures**

| # | Place | lat, lon | Tests |
|---|---|---|---|
| 49 | Four Level Interchange, Los Angeles, CA | 34.062, -118.248 | stacked ramps, layers, trenches |
| 50 | Golden Gate Bridge (south end), CA | 37.807, -122.475 | a suspension bridge, the approach |
| 51 | Brooklyn Bridge (mid-span), NY | 40.706, -73.997 | a deck over water between two cities |
| 52 | The Diag, University of Michigan, MI | 42.277, -83.738 | a campus |
| 53 | Lambeau Field, Green Bay, WI | 44.501, -88.062 | a stadium in a sea of parking |
| 54 | Port of Long Beach, CA | 33.754, -118.217 | cranes, containers, industry |
| 55 | Seattle–Tacoma Airport, WA | 47.450, -122.309 | runways, terminals, huge flat ground |

**Seasons**

| # | Place | lat, lon | Tests |
|---|---|---|---|
| 56 | Nicollet Mall, Minneapolis, MN (`&date=01-15`) | 44.977, -93.272 | snow, bare trees, a winter city |
| 57 | Stowe, VT (`&date=01-20`) | 44.465, -72.687 | a snowbound village (pairs with #19) |

## 6. The random sample

- **300 spots**, seeded (the same list every run; a new seed each release so fixes don't overfit).
- **60% where people are** (weighted by 2020 Census block population), because that's where
  players go; **40% uniform over land** in the lower 48, so the empty places are tested too.
- A point that lands in open water is redrawn; a point with no street within 2 km keeps its
  place and tests the open land.

## 7. Pass criteria (Gate C)

- **Named spots:** every one passes every automatic check, or has a filed systemic issue with a
  fix in progress. The hero spots also hold their review scores.
- **Random 300:** ≥ 95% pass every automatic check; no crashes; loading within the §4 times.
- **Reviewer sample** (30 of the 300, drawn at random): none rated "broken", mean ≥ 6.5/10
  ("plausible"), and no single check failing in more than 3% of spots.
- **Performance:** ≥ 30 fps at the default tier on the reference laptop across every named spot;
  the boot benchmark (backlog 1.7) picks the tier, so the settings panel is never needed.

## 8. Patterns to hunt first

What earlier rounds and Seattle already point at:

| Pattern | Status |
|---|---|
| A crosswalk mapped on every junction arm (short stub edges) | ✅ fixed (v) |
| Street grids not north-up (paving in stair-steps) | ✅ fixed (v) |
| Steep grids (kinks just past junctions) | ✅ fixed (v); bridge ends and overpasses remain |
| Retaining walls as blank slabs | ✅ rockeries and concrete (v) |
| No summer time outside the bake | ✅ fixed (v) |
| Traffic that stands still (all-way stops everywhere, density near the walker) | 🟡 R.26 |
| Freeways: interchanges, stacked ramps, trenches, lids | ⬜ weak — spot #49 |
| Thin OSM in rural counties (missing buildings) | ⬜ Overture footprints |
| Rivers and creeks drawn only as areas | ⬜ NHD / line waterways |
| Open land read from landcover (forest, field, desert, wetland) where OSM is silent | ✅ WorldCover in every streamed cell and the far ring (tiles v28) |
| Tags lost on the fallback tiles (brick, lamps, crossings, species) | 🟡 goes away with Gate A |
| Snow country and winter light | 🟡 seasons exist; spots #56–57 |
| **Places that need care**: tribal lands, cemeteries, memorials, places of worship, schools | ⬜ the procedural crowds, commissions and (later) building must respect them — marked from OSM and PAD-US, never given invented cultural content |

## 9. Order of work

1. Commit session (v); redeploy the tile worker.
2. Build `__SWEEP__` and the named-spot list; the first report from Robby's PC overnight.
3. Fix what it finds, pattern by pattern; the reviewer checks the worst sheets each round.
4. Gate A: the offline cell pipeline, starting with WA, NJ and AZ, then the metros, then outward.
5. The calibration regions still missing (§3), one per round.
6. The random 300; iterate to Gate C.
7. Soft launch with Report this place (Gate D), then all 48 (Gate E).
