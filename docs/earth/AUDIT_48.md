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

## Round 2 — after the extract

(to come: all 18 towns, desktop and phone, on a quiet machine, every cell from our own extract)
