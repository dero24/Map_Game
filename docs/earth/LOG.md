# Earth expansion — session log

Newest first. One entry per work session: what changed, what was verified, what's next.

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
