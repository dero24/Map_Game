# The lower-48 load audit

docs/GAMEPLAY_VISION.md §17, step 1: "Audit first, with evidence." A spread of real towns opened by
`?at=` on the dev server against the deployed tile service, with this PC's GPU (an RTX 4070 SUPER),
as a desktop (1280 × 720) and as a phone (a Pixel 7's screen and touch, the phone tier). Per town and
device: what loaded, land or water, the buildings and their heights, the trees, the frames, the
errors — and one montage per town, the desktop's frames beside the phone's.

- **The tool:** `node tools/audit48.mjs [--towns=…] [--devices=desktop,phone] [--realWait=240]`
  (the in-page half is `tools/audit48.js`; the towns are `tools/audit48-towns.json`, whose
  `mustLoad` ones are also `tests/mustLoad.test.ts`). Numbers: `shots/audit48/audit.json` and
  `summary.md`; montages `shots/audit48/<town>-montage.jpg` (git-ignored, re-made by the tool).
- **Frames:** each town's own streets (place-shots.js) — the main street, a residential street, the
  air, the horizon — and the ring straight down from 700 m.
- **The ring:** every 1024 m detail cell within 1.5 km of the spawn, each its real tile, the vector
  twin (OpenFreeMap's real streets and buildings, standing in while the full tile comes), the
  procedural stand-in, or baked.

## Round 1 — 2026-10-03, before our own OSM extract (Overpass down)

The public Overpass servers stopped answering during the run, from this PC and from Cloudflare (the
tile service's cold path: 503 after 60–90 s; overpass-api.de, kumi.systems and private.coffee all
timing out — the OSM community forum reports throttling and some instances shut down this autumn). So
round 1 measures the game as players met it that day: **nearly every new place was its vector twin**.

| Town | Kind | Desktop: real cells / 14 | Phone | Water round the spawn | Buildings (desktop ring) | Notes |
|---|---|---|---|---|---|---|
| Shrewsbury, NJ | suburb | 3–6 (two runs), the rest twins | 0 | 0% | 1,156–2,016, median 6–7 m | land everywhere at the centre; Robby's dark-blue ground not reproduced here — look across the ring and on a phone |
| Sea Bright, NJ | coast (baked) | 14 baked | 6 baked | 51% | 1,126, median 6.3 m | the gold standard: everything loads |
| Midtown Manhattan, NY | city | **0**, all twins | 0 | 0% | 6,814, median 19 m, max 426 m | the twins' towers stand; spawn on Bryant Park's lawn |
| Levittown, NY | suburb | 1 | 1 | 0.6% | 6,867, median 5.6 m | **spawn flagged in water** |
| Bar Harbor, ME | coast | 4 | 1 | 22% | 1,327 | **desktop spawned inside a restaurant's dining room**; sea, islands and Cadillac Mountain (362 m, 7 km) right |
| Intercourse, PA | rural | **0** | 0 | 0.3% | 338 | farmland twins |
| Asheville, NC | mountains | 2 | 0 | 0% | 3,554, max 50 m | hills on the horizon |
| Miami Beach, FL | coast | **0** (12 failed) | 2 | 19% | 2,115, max 183 m | |
| Chicago Loop, IL | city | **0** (14 failed) | 3 | 0.2% | 2,208, max 349 m | |
| German Village, Columbus, OH | inland | **0** (12 failed) | 1 | 0% | 6,478 | |
| Hays, KS … Seattle, WA | | not run | | | | the audit was stopped to give the extract the machine; round 2 covers all 18 |

Findings (each a `feature_list.json` item):
1. **The data, not the game, was the bottleneck** — cold cells waited on public Overpass and mostly
   never came (`own-osm-extract`, Tier 0 #1: Robby's call, our own extract in R2).
2. **A ?at= spawn inside a building** (Bar Harbor) **and one flagged in water** (Levittown)
   (`spawn-on-land-outside`).
3. **The vector twin held up**: no holes, no land drawn as water in any montage; streets, buildings,
   sea and lakes in place. It is a good fallback — but no lamps, crossings, trees or surfaces.
4. **Frames:** the desktop's medians were 13–35 ms standing where the machine was quiet; Sea Bright
   (109 ms) and Midtown (308 ms) were timed while a 1.8 M-name bake and DuckDB ran beside them —
   not a measurement. Round 2 re-times every town on a quiet machine.
5. **A phone loads a few cells** (its vertex budget: 1–3 detail cells near the spawn), as designed;
   its frames on this GPU were 4–50 ms medians (not a phone's GPU — the tier's budgets are what's
   checked here, a real phone is `phones`).
6. **The audit's own frames** fell back to the spawn where no shop or lived-on street was found
   (Bar Harbor's desktop, Midtown's twins): place-shots.js now counts the vector twin's buildings as
   the place and falls back to the nearest street.

## Round 2 — 2026-10-04, from our own extract

All 19 towns (round 1's 18 and Monmouth Executive Airport, where Robby's phone crashed), desktop and
phone, on a quiet machine, the day the extract went live — and the day the tile cache went to t/v25,
so every streamed cell was its first visit: built from the extract in R2 by the service, then here.
"Late": cells up but still owed their LiDAR measurement, roof colours or water (a relief rebuild).

| Town | Kind | Real cells (desktop · phone) | All real by | Water | Buildings (desktop) | Trees (d · p) | Frames p50 / p95 standing, ms (d · p) | Ready + settled, s (d · p) | Vertex MB (d · p) |
|---|---|---|---|---|---|---|---|---|---|
| Shrewsbury, NJ | suburb | 14/14 · 6/14 | 2 s | 0% | 2,411, median 5.7 m, max 20 m | 44,980 · 32,889 | 21.4 / 34.7 · 12.1 / 14.1 | 34 + 23 · 7 + 14 | 785 · 284 |
| Sea Bright, NJ | coast | 14/14 baked · 6/14 baked | 1 s | 51.3% | 1,123, median 6.3 m, max 15 m | 10,914 · 7,234 | 10.1 / 15.7 · 6.4 / 8.5 | 10 + 9 · 8 + 9 | 414 · 251 |
| Midtown Manhattan, NY | city | 14/14 · 2/14 | 32 s | 0% | 6,359, median 17.7 m, max 472 m | 8,970 · 2,070 | 27.7 / 34 · 5.3 / 7.4 | 25 + 81 · 16 + 18 | 1334 · 311 |
| Levittown, NY | suburb | 14/14 · 2/14 | 19 s | 1.5% | 7,017, median 3.9 m, max 19 m | 20,802 · 5,204 | 25.7 / 32 · 3.7 / 6 | 19 + 48 · 12 + 12 | 1381 · 220 |
| Bar Harbor, ME | coast | 14/14, 3 late · 6/14 | 8 s | 22.7% | 1,313, median 6.3 m, max 23 m | 27,146 · 26,764 | 19.6 / 34.5 · 9.1 / 11.9 | 8 + 23 · 7 + 11 | 393 · 209 |
| Intercourse, PA | rural | 14/14, 2 late · 8/14 | 7 s | 0.3% | 820, median 5.9 m, max 14 m | 5,359 · 7,045 | 19.7 / 34.6 · 4.5 / 6.9 | 7 + 22 · 6 + 12 | 606 · 220 |
| Asheville, NC | mountains | 14/14 · 3/14 | 22 s | 0% | 3,594, median 4.5 m, max 68 m | 42,022 · 16,280 | 21.7 / 34 · 7.1 / 9.3 | 16 + 65 · 13 + 12 | 1095 · 234 |
| Miami Beach, FL | coast | 12/12, 3 late · 3/12 | 12 s | 19.6% | 2,190, median 7.1 m, max 187 m | 8,801 · 5,684 | 13.2 / 17.4 · 4.6 / 7.2 | 13 + 31 · 10 + 9 | 439 · 197 |
| Chicago Loop, IL | city | 14/14, 10 late · 4/14 | — | 0.2% | 1,788, median 12.4 m, max 307 m | 16,201 · 9,665 | 12.9 / 17.7 · 7.4 / 10.2 | 17 + 244 · 14 + 76 | 389 · 230 |
| German Village, Columbus, OH | inland | 12/12 · 1/12 | 15 s | 0% | 6,596, median 6.3 m, max 192 m | 10,862 · 1,484 | 24 / 30.4 · 3.4 / 5.4 | 16 + 50 · 14 + 12 | 994 · 204 |
| Monmouth Executive Airport, NJ | airfield | 14/14, 2 late · 4/14 | 6 s | 0% | 264, median 5.8 m, max 13 m | 43,169 · 29,573 | 19.2 / 34.6 · 8.8 / 14.2 | 7 + 26 · 5 + 12 | 529 · 139 |
| Hays, KS | plains | 13/13 · 2/13 | 15 s | 0% | 5,433, median 3.8 m, max 20 m | 16,441 · 5,393 | 23.1 / 29.1 · 3.9 / 5.2 | 15 + 45 · 12 + 11 | 876 · 219 |
| Duluth, MN | coast | 10/10, 3 late · 4/10 | 141 s | 4.9% | 2,436, median 5.9 m, max 75 m | 19,983 · 12,829 | 8.3 / 10 · 4.8 / 7.1 | 13 + 207 · 11 + 31 | 465 · 267 |
| Aspen, CO | mountains | 12/12 · 4/12 | 14 s | 2.3% | 2,103, median 6.9 m, max 14 m | 3,293 · 1,409 | 21.9 / 27.2 · 4.4 / 5.9 | 13 + 50 · 11 + 16 | 762 · 259 |
| Moab, UT | desert | 12/12 · 5/12 | 7 s | 0% | 2,468, median 4.1 m, max 25 m | 17,318 · 13,505 | 18.4 / 34.3 · 4.8 / 6.2 | 10 + 39 · 8 + 12 | 665 · 239 |
| Tucson, AZ | desert | 10/10 · 3/10 | 19 s | 0% | 4,661, median 4 m, max 101 m | 16,031 · 6,528 | 19.7 / 34.6 · 4.1 / 5.8 | 15 + 53 · 14 + 14 | 800 · 225 |
| Ely, NV | rural | 14/14 · 7/14 | 8 s | 0% | 1,620, median 4.1 m, max 14 m | 29,862 · 25,050 | 15.1 / 32.7 · 7.7 / 9.9 | 9 + 34 · 8 + 11 | 632 · 296 |
| Santa Monica, CA | coast | 14/14, 4 late · 3/14 | 15 s | 3.4% | 3,669, median 6.8 m, max 94 m | 6,983 · 4,145 | 10.1 / 14.4 · 4.5 / 6.9 | 20 + 62 · 13 + 14 | 840 · 227 |
| Pike Place, Seattle, WA | city | 14/14, 2 late · 4/14 | 16 s | 25.7% | 1,652, median 11.1 m, max 259 m | 5,492 · 2,904 | 17.1 / 34.8 · 5.8 / 7.4 | 18 + 58 · 10 + 15 | 734 · 213 |

(Phones keep 1–8 detail cells round the spawn — their vertex budget, as designed; the rest of a phone's
ring is silhouettes. Frames are this PC's GPU, an RTX 4070 SUPER, headless: the desktop's standing
p95s sit at 27–35 ms, about two frames of a 60 Hz display, wherever the median is.)

Findings:
1. **Every cell real.** All 249 desktop cells were real or baked when the run settled (round 1: most
   new places stayed vector twins, Midtown and Intercourse 0 of 14); no stand-ins, no failed cells, in
   any town. All real by a median 15 s after ready; the slow ones were the big-water cities (4).
2. **Every arrival outside, on land:** 38 of 38 runs (round 1's Bar Harbor dining room and Levittown's
   water fixed in ff84f22 and by moving Levittown's town point off a recharge basin;
   `spawn-on-land-outside` passes).
3. **The blue ground** (Robby's, at the airport and Shrewsbury): gone everywhere — a wetland is land
   (eb7dcc2, tests/realExtras.test.ts).
4. **Slow big-water cities — fixed (9283adf).** Chicago's last real cell came after the 240 s wait,
   Duluth's at 141 s, and their reliefs ran 110 s and stalled out ("tile service stalled"), though
   the service answers every cell in under 0.4 s. Two causes on the one tile builder: a Lake
   Michigan cell carries the lake's whole outline (47,000 vertices) and every ground quad was tested
   against all of it — 8.8 s a cell; now its edges are bucketed by row (`ringTester`, the same
   answers), 0.24 s. And every mounted cell asked for its relief at once — fourteen whole rebuilds
   sharing the builder with the cells not up yet; now they queue, nearest first, two at a time (one
   on a phone), a real cell's once the ring's first builds are done. Re-run (desktop · phone):

   | Town | All real by | Late | Settled | Round 2 |
   |---|---|---|---|---|
   | Chicago Loop | 1 s | 0 · 0 | 38 s · 27 s | after 240 s, 10 late, 244 s · 76 s |
   | Duluth | 23 s | 0 · 0 | 57 s · 22 s | 141 s, 3 late, 207 s · 31 s |
   | Pike Place, Seattle | 17 s | 0 · 0 | 48 s · 12 s | 16 s, 2 late, 58 s · 15 s |

5. **No mountains on a desktop's horizon — fixed (ceb0588).** The far ring's first build races the
   town's own DEM reads; one tile late and it gave up until a 5 km walk. It retries on a backoff now:
   Aspen's ring 35 s after ready; Bar Harbor's montage has Cadillac Mountain again (round 1's had it).
6. **A tower's chimney at minus infinity** (Ely, Santa Monica: "computeBoundingSphere … NaN") — a
   triangle footprint asked for a gable roof got three gable walls and no peak; it gets a hip now, and
   a non-finite corner is left out (9d364c0, tests/roof.test.ts over 1,000 random footprints).
7. **Browser Overpass asked though the service answers** (Chicago, Duluth: the water fallback) —
   only without a service now (9d364c0).
8. **The one console error in every run** is the dev server's own: it asks for a local tile worker
   (`wrangler dev`, not running), gets 503, and uses the deployed service. Not in a player's game.
   A direct aerial-photo read refused once (Aspen, Chicago) fell back to the service's relay.
9. **Looks-right leads** (Tier 1, from the montages): Aspen's slopes are lawn-green to the top — no
   conifer or aspen forest on the mountain; Duluth's "North 1st Avenue East" frame stands on a lawn
   with no street in sight (a steep street in a cut — to look at); a kerb car parked on Bar Harbor's
   Main Street crossing; the cars are blocky.
