# Neighbourhoods that look like themselves — research and plan (2026-09-30)

The problem (from play): cities and dense towns read as themselves, the baked shore (Sea Bright) is
the gold standard, but suburbs blur together — Rumson looks like Fair Haven, Little Silver and
Middletown once you're away from the water. This is the research (code read + open data survey)
and the plan. Status of each phase is at the end.

## 1. How a neighbourhood is built today

- **One style per session.** `styles.ts` `regionStyle(lat,lon)` picks a climate, a family
  (clapboard, brick, stucco, adobe…) and a North American sub-region from continental boxes, set
  once (`setActiveStyle`). Rumson, Fair Haven, Red Bank, Little Silver and Middletown all share
  `continental|temperate/clapboard/R/na/northeast` — nothing below that changes between them.
- Every style decision below that is a **per-building hash** from one regional table:

| Attribute | Data today | Guess when missing (keyed on) |
|---|---|---|
| Footprint | OSM building; OpenFreeMap MVT; LiDAR `detectBuildings` | hybrid fill (`realTile.ts` ~L1118): fixed 11–18 × 9–13 m boxes every 22–32 m, 5.5–9 m setback — a Levittown prior everywhere; synth `lotAt` similar |
| Height | `height`, `building:levels`, LiDAR, Overture (bake) | 6.5 + hash·3 m |
| Kind | `building`, shop/amenity, area | **bug:** `apartments || area > 700 → 'large'` (`realTile.ts` ~L773, `bake.mjs` L262): an estate house becomes a flat-roofed block — hits Rumson directly |
| Roof shape | `roof:shape`, LiDAR roofs | hash + OBB width |
| Facade / roof colour | `building:colour/material`, `roof:colour/material`, NAIP roofs per building (bake, and streamed US cells since 2026-09-30 — `aerial.ts`) | `recipe.ts` hash pick from the family palette; footprint size, lot size and era never used |
| Dormers, bay, chimney | — | hash × family constant |
| Drive | mapped `service=driveway` | 62% of houses, **only if footprint < 280 m²** (estates get none) |
| Hedges, fences, walls | OSM barrier fence/wall | per-door hash: 22% hedge, 14% picket; always 3.2 m runs by the walk; setback and lot line ignored |
| Trees | LiDAR crowns; OSM trees | real-lite: 0.05 per 9 m cell × `treeDensity` — uniform canopy per climate |

Not fetched: `barrier=hedge`, `natural=tree_row`, `wall=dry_stone`, `landuse=residential`,
`building=detached|bungalow|semidetached_house`.

**Diagnosis:** away from the water, only footprint geometry and LiDAR trees differ between Rumson
and Fair Haven. The two biggest real signals — lot size / setback and era — never reach the
recipe, the lot dressing or the fills.

## 2. Open data that tells neighbourhoods apart (by character signal per byte)

1. **Morphology measured from the footprints already in the tile** — footprint area, spacing,
   setback, frontage density, street pattern. Free, zero bytes; separates estate / old grid / tract.
2. **US Census ACS 5-year, per block group** (~240k in CONUS): year built (B25034/B25035), units in
   structure (B25024), rooms (B25018), value (B25077). Public domain; api.census.gov + TIGER points.
   ~30 B per block group — the national backbone (fall back to tract where margins are wide).
3. **NLCD Tree Canopy 2021 (USFS) + impervious (MRLC)**, 30 m, public domain: canopy % per block
   group where LiDAR hasn't covered the ground.
4. USGS 3DEP LiDAR (already used) — real heights, roofs, crowns.
5. USDA NAIP (already used in the bake) — a roof-colour palette per block group, baked offline.
6. Statewide parcels (NJ MOD-IV: year built, acres, storeys; NY, MA, UT, FL, VT, NC, MD, WI, TX…) —
   per-house truth; per-state adapters; the test references.
7. Overture buildings (ODbL) — massing; colours sparse.
8. Microsoft US footprints / FEMA USA Structures — footprints where OSM is thin (bake time).
9. OSM style tags — always honoured, but on well under 2% of US houses.
Excluded: Regrid (commercial, no redistribution), Zillow/ZTRAX (not open).

## 3. The model: a neighbourhood character layer

- **Morph** (`world/hood.ts`, pure): on a global 256 m grid (each cell inside one tile — no seams),
  from the tile's houses: median / p90 footprint, median setback, spacing, houses per km of
  frontage, uniformity (area CV), street-orientation entropy, dead ends, LiDAR tree share. ~8 B/cell.
- **Hood records** (national, Phase 2): ACS + TIGER + NLCD (+ NAIP palette) per 1° square
  (`hood/<lat>_<lon>.bin` via the worker, ~8 MB for CONUS), inverse-distance blended from the 3
  nearest block groups — deterministic, soft edges, no polygons. Attached to `TileJson.hood` so all
  four feeders agree (bump `t/vN` + `&v=N` together).
- **Consumption:** `hoodMix(hood?, morph, regionStyle)` → weights over a finite archetype vocabulary
  (cape, ranch, split-level, colonial, gambrel, Victorian, foursquare, Tudor, shingle estate,
  craftsman / brick bungalow, row / twin, neo-trad, Spanish / desert ranch…), a yard-edge mix (none,
  hedge, picket, stone wall, split rail, chain link, block wall), setback / lot priors and tree scales.
  Tables keyed on era × sub-region × morph class — never on places (constraint 5) — picked per house
  like `carMix` (`pickWeighted(mix, hash)`), conditioned on its own footprint; mapped tags, LiDAR and
  parcels always win.
- **Degradation:** tag / LiDAR → parcel → Hood + Morph → Morph only → today's regional table (the
  neutral path, which reproduces today's draws so the baked shore doesn't reshuffle).

## 4. Test framework — does it look like itself?

Reference set (frozen single-cell Overpass snapshots in `tests/fixtures/hoods/`; coordinates to be
confirmed on the block before freezing):

| id | place | lat, lon | signature |
|---|---|---|---|
| nj-estate | Rumson (Ridge Rd / Rumson Rd) | 40.3690, −74.0080 | big footprints, 20 m+ setbacks, hedges and walls, heavy canopy |
| nj-mixed | Fair Haven (the hard neighbour) | 40.3605, −74.0385 | mid lots, 1920–60 colonials and capes |
| nj-grid | Red Bank east side | 40.3510, −74.0660 | dense grid, Victorians, small setbacks |
| ny-tract | Levittown NY | 40.7270, −73.5140 | uniform capes / ranches, 1947–51 |
| az-xeri | Gilbert AZ | 33.3500, −111.7550 | stucco, tile roofs, block walls, 1990s |
| vt-village | Woodstock VT | 43.6245, −72.5180 | clapboard, steep roofs, maples, pre-1900 |
| il-bungalow | Chicago, Portage Park | 41.9550, −87.7640 | brick bungalows, narrow lots |
| wa-craftsman | Seattle, Wallingford | 47.6600, −122.3370 | craftsman, conifers, 1910–30 |
| tx-brick | Sugar Land TX | 29.5980, −95.6200 | 1980s brick two-storeys, culs-de-sac |

- **Tier A (vitest, seconds, CI):** each fixture → `osmToTile` → Morph / Hood → per-house archetype
  and recipe → lot dressing and tree plans → a scene-stat vector (footprint / setback distributions,
  roof / siding / archetype histograms, yard edge per 100 m, trees per ha, facade / roof colour
  histograms). Fidelity: Wasserstein distance per distribution against a reference JSON built once
  from ACS / NLCD / parcels. Distinctiveness: leave-one-out nearest-centroid classification of
  150 m patches from game stats only ≥ 0.85, nj-estate separable from nj-mixed and nj-grid. Realism:
  Spearman ≥ 0.7 between game-stat and reference distance matrices. Determinism and degradation
  (no hood data → the neutral path; the shore unchanged unless re-baselined).
- **Tier B (visual, per session):** in-page captures of each hood (a kerb view, a 30 m oblique, a
  150 m aerial) into one montage; canopy / openness / roof-hue metrics against the data; optional
  blind review (shuffled tiles, confusion matrix logged in REVIEWER.md).

## 5. Phases

- **Phase 1 (1–2 days, no new data):** fix the >700 m² house → large rule; fetch hedges, tree rows,
  dry-stone walls, residential landuse; Morph grid + morph-only `hoodMix`; 4–5 archetypes in
  `recipe.ts` (estate, grid Victorian, tract cape / ranch, bungalow, desert ranch); estate drives;
  frontage hedges / stone walls; morph lot parameters for fills; canopy multiplier; Tier A with the
  NJ fixtures + Levittown; bump cache keys.
- **Phase 2 (~1 week):** the national Hood layer (ACS + TIGER + NLCD), worker `/hood/` route and
  bake parity, era × sub tables, the full archetype set, gambrel / mansard roofs, Tudor detail, all
  nine fixtures and the Tier B harness.
- **Phase 3:** state parcel adapters (NJ MOD-IV first), NAIP roof palettes, Overture heights in the
  worker, MS / FEMA footprints for fills, an optional image classifier over Tier B captures.

## Sources

Overture buildings schema https://docs.overturemaps.org/schema/reference/buildings/building/ ·
NLCD Tree Canopy https://data.fs.usda.gov/geodata/rastergateway/treecanopycover/ · MRLC
https://www.mrlc.gov/data · NJ parcels / MOD-IV https://nj.gov/njgin/edata/parcels/ · NY parcels
https://gis.ny.gov/parcels · MassGIS parcels
https://www.mass.gov/info-details/massgis-data-property-tax-parcels · Census ACS
https://api.census.gov/data/2023/acs/acs5 · TIGER https://www2.census.gov/geo/tiger/ · MS footprints
https://github.com/microsoft/USBuildingFootprints · FEMA USA Structures
https://gis-fema.hub.arcgis.com/pages/usa-structures

## Status

**Phase 1, built (2026-09-30), client-side** — it needs no tile-service redeploy: styling runs in
the browser's tile worker (`buildTile`), for baked and streamed tiles alike.
- `src/world/hood.ts`: the morphology on 256 m cells (median footprint, p90, centroid spacing,
  area CV) from a tile's own measured homes (no fills, no margin context) → estate / grid / tract /
  suburb (`classify`). Within 800 m of the ocean only estate applies (the shore keeps its look).
- `recipe.ts` `recipeFor(bd, st, hood, cellSeed)`: estate (white / grey clapboard, cedar shingle,
  some render and brick, slate and shake, steep roofs, dormers, two chimneys, bays); grid, by the
  style's `sub` — the Northeast's painted Victorians (bays, steep roofs), the Midwest's brick
  bungalows (dark brick, low hips, the front bay), the Northwest's craftsman (stained shingle in
  deep greens and browns, low wide gables); tract, one model a cell — cape or ranch in a narrow
  pastel range, or in a stucco / adobe region low tile hips over sand-toned stucco. `suburb` is
  today's recipe exactly (a test pins it). Mapped colour and material win.
- `buildings.ts`: an estate's big footprint the map calls `large` stays a house (pitched, a door,
  a drive); estate drives on any size house. `props.ts`: estate frontage hedges (long privet runs
  8–16 m out) and 3.2× tree canopy (1.2× on old grids) where the survey hasn't placed trees.
- Tests: tests/hoods.test.ts — classification on synthetic streets, what counts, the neutral path,
  each archetype and its regional variants, and **real places read as themselves** (the Tier A
  check, no browser, well under a second):
  - the shore's towns from the baked pack (in the repo), 5×5 cells round each, home-weighted:
    Rumson west of the river bend → estate (45% of homes; every neighbour under 5%), Fair Haven →
    grid, Long Branch's north end → grid, Oceanport and Monmouth Beach → suburb (only the tiles the
    manifest lists: the folder also holds 72 files from an older, wider bake that nothing streams);
  - the country from frozen real-lite tiles (`tools/hood-fixtures.mjs` → `tests/fixtures/hoods/`,
    the tile a visitor streams there, only the fields the measure reads): Levittown NY → tract
    (732 of 787 homes), Chicago's Portage Park → grid (2,164 of 2,164), Seattle's Wallingford →
    grid (1,328 of 1,328). Red Bank NJ (grid; past the shore pack's edge, so it streams),
    Gilbert AZ (tract), Greenwich CT (estate) and Sugar Land TX (suburb) are
    in the list; the tile service answered 503 for them all day (its Overpass upstream was down) —
    re-run the tool and they join the test with no code change.
  - Scaling to the lower 48 is adding a line to `HOODS` (a point, what it should read as) and
    re-running the tool; a place too thinly mapped to measure (fills only) is skipped, since the
    game stays neutral there.
**Heights where nothing is measured (2026-10-03)** — `src/world/priors.ts`, applied in the builder's
own loop on every feeder. A house with no survey fit, no mapped `height`, `building:levels` or
`roof:levels` (now read too: `Building.rl`, tile cache v24) takes a measured neighbour's height — one
of the measured houses of about its size (½–2× its footprint) in its 256 m cell, drawn by its seed —
else its neighbourhood's storeys: estate 9–11.5 m and Northeast grid 8.6–11 m (two storeys and
more), a Midwest bungalow grid 6.4–7.8 m, a Northwest craftsman grid 7.2–8.8 m, a tract its cell's
one model as the recipe draws it (`recipe.ts` `tractCape`: cape 7.2–8 m, a storey and a half; ranch
5–5.8 m; desert stucco 4.8–5.6 m); a suburb keeps its own mix. The shore's unmeasured houses carried
Microsoft's ML heights (via Overture; median 4.9 m, 1.3 m under the survey): in three Monmouth Beach
cells the guessed houses at two storeys and up went 9% → 49%, their measured neighbours being 41%.
Tests: `tests/priors.test.ts`.

**Real roof colours (2026-09-30)** — per building rather than a per-block-group palette: every
US roof the NAIP photo shows wears the colour it shows, balanced against the cell's streets (the
baked shore's own samples balanced per tile). Mapped colours still win; the palette is the floor.
`docs/agent/world-data.md` "Building colours from real data". Walls have no such source yet
(the street-level plan is there).
- Found on the way: OSM maps almost none of Rumson's houses (one building in the reference
  square) — there the game has LiDAR-found footprints or the fixed-size fills, which is the
  deeper reason it read like everywhere else. Phase 2's footprints (Microsoft / Overture) and the
  ACS era data matter most there.
