# World data — regions, fetch, bake, deep links

Read this when the task touches region definitions, the data pipeline, baking, or `?at=` links.

## Regions

- The game ships a single baked region, `shore` (Sea Bright → Monmouth Beach, Sea Bright's
  origin/spawn); everything past its backdrop streams real-lite tiles (see `streaming.md`).
- `seabright`/`monmouthbeach` are `hidden` merge sources: `node scripts/merge-raw.mjs
  --region=shore` unions their raw fetches (coverage asserted), then `npm run bake --
  --region=shore`. Unknown `?region=` values land in the listed world.
- Adding a region = one `REGIONS` entry in `scripts/config.mjs` + fetch + bake. Spec fields
  (slice/backdrop/origin/tz/oceanEdge/spawn/roads/shoreLabel/landmarks/mergeFrom/hidden/detail)
  are documented there.
- Region gate: `npm run verify:region -- --region=<id>` checks raw inputs → baked pack →
  manifest fields → `regions.json` listing; `--soak=90`/`--shots=a,b` add runtime gates.
  Track state in `feature_list.json` `regions[]` (planned → fetched → baked → verified →
  live). A region is live only when verify-region exits 0.
- Region identity (name/tz/spawn/labels/style) travels in `world.json`/`manifest` `meta` —
  runtime code must not hardcode place names. Virtual manifests must emit `meta.style` too
  (derive from `?at=` via the same LUT — see `docs/ASSET_FIDELITY.md` §4).

## Detail zone

- The bake keeps full detail across the whole backdrop; builders gate on `detailBox(json)`
  (= `json.detail ?? json.slice`). The slice only sets the 2 m terrain lattice and the
  lamp-map compositor box.
- `manifest.bakeId` (tile content hash) is part of the IDB cache key — rebaking self-invalidates
  cached tiles.

## Data pipeline

- `npm run fetch -- --region=<id>` — osm/terrain/worldcover/overture/imagery, raw →
  `raw/<region>/`, archived.
- `npm run bake -- --region=<id>` → `public/data/<region>/{world.json,terrain.bin,manifest.json,paint.json,
  tiles/*.json}` + `public/data/regions.json`. Debug masks land in `raw/<region>/debug/`.
- `fetch-imagery.mjs` samples USDA NAIP aerial photos (public domain, US only) inside every
  footprint → `raw/<region>/roofs.json` (real roof colours; tags/materials still win). Neither
  town has mapped facade/roof colours in OSM/Overture.

## Deep links

- `?at=lat,lon` picks the region whose slice (then backdrop, then nearest origin) contains the
  point and spawns there — on a doorstep it places you 2.2 m outside the nearest building's
  front door.
