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
| Facade / roof colour | `building:colour/material`, `roof:colour/material`, NAIP (bake) | `recipe.ts` hash pick from the family palette; footprint size, lot size and era never used |
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

See docs/earth/LOG.md for what has been built.
