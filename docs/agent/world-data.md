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
  town has mapped facade/roof colours in OSM/Overture. See "Building colours from real data".

## Building colours from real data

What Microsoft Flight Simulator does, honestly: its ground is the aerial photo itself (Bing), and
Blackshark.ai's ML traced ~1.5 B footprints and guessed heights off it; autogen facades come from
regional texture sets, and only the photogrammetry cities (a few hundred, Bing/Vexcel oblique
flights) have real walls. Roofs over the photo read right because the photo is right there. We
can do the roof half with open data; the wall half has no open, global source.

**Sources and licences**

| What | Source | Licence / access | Status |
|---|---|---|---|
| Roofs, lower 48 | USDA NAIP (0.6 m, some states 0.3 m, leaf-on, ~2–3 yr cycle) via the USGS National Map ImageServer `imagery.nationalmap.gov/arcgis/rest/services/USGSNAIPImagery/ImageServer/exportImage` | Public domain ("USGS, USDA, The National Map: Orthoimagery"); keyless; ArcGIS Server's CORS default is all origins (Esri docs) — not testable from the agents' sandbox, so the tile service relays it too (`/naip`) | **built** (bake + streamed cells) |
| Roofs, lower 48 (other doors) | NAIP COGs: AWS `naip-visualization` (requester-pays — no browser), Planetary Computer (SAS-token API + a GeoTIFF decoder); `basemap.nationalmap.gov` USGSImageryOnly tiles (NAIP-based, but cached only to z16 ≈ 1.8 m/px) | public domain | not used |
| Roofs, elsewhere | National orthophotos: France IGN Géoplateforme WMTS (Licence Ouverte 2.0, keyless), Netherlands PDOK Luchtfoto (CC BY 4.0), Spain PNOA (CC BY 4.0), Switzerland SWISSIMAGE (free OGD), Austria basemap.at (CC BY 4.0), Japan GSI seamlessphoto (attribution); never Esri World Imagery, Bing or Google (their terms forbid extraction) | per country | next: one adapter each behind `naipRequest`'s shape |
| Facade colour / material | OSM `building:colour`, `building:material` (well under 2% of US houses); Overture `facade_color`/`facade_material` (its docs name no source; OSM is its top-priority input and the ML footprint sources carry no colours, so in practice OSM's tags) | ODbL | read (`realTile.ts`, bake) |
| Facades from the street | Mapillary (CC BY-SA 4.0 imagery, free client token), Panoramax (CC BY-SA 4.0 by default, no key, mostly France/Europe), KartaView (CC BY-SA, Grab) | see plan below | next |

**What's built (2026-09-30)**

- `src/world/aerial.ts` (pure, `tests/aerial.test.ts`): reading a roof off a photo — the
  footprint eroded 0.7–1.5 m, the cell's footprints registered to the photo (±6 px, then ±1 px a
  house: survey offsets, a house leaning from the camera; nothing over 16 m is read — a tall
  building leans off its footprint further than that), greenery (excess green) and no-data
  dropped, the darkest 35% (shaded slope, tree and chimney shadow) and brightest 15% (glints,
  vents, trim) left out, the per-channel median of the rest. The photo's cast is fitted per cell as
  a line in brightness (NAIP leans green; haze turns dark roofs cyan, light ones yellow) against
  the cell's streets (asphalt and concrete are grey everywhere), else against its roofs with a
  small warm target (`ROOF_WARMTH`: North American roofing leans brown), leaning on NAIP's usual
  cast (`NAIP_CAST`, measured over the shore's 25,770 roofs) when a cell has little to say.
  `aerialRoof` → the painter's colour: hue and lightness kept, chroma held to what roofing comes in.
- **The baked shore** (`tileRoofs`, nothing re-baked): its `rc` are NAIP samples the bake lifted
  for paint (`paintFromAerial`) and never balanced — the recipe used to fold every green and blue
  to one warm grey, keeping only lightness. A region whose manifest `sources.roofColours` says so
  has them unlifted and balanced per tile as it builds; mapped colours (exact tag-table values)
  are left alone. Shore roofs went from 97% one warm grey to greys, browns, charcoal, blue-greys
  and the odd clay roof, each its own measurement.
- **Streamed US cells** (`aerialFetch.ts`, tile worker): the photo is fetched from the start of a
  real cell's build (one exportImage: the cell + 48 m margin in EPSG:4326, ~0.9 m/px, JPEG,
  ~0.3–0.6 MB), read after the LiDAR enrichment, written to `Building.ar`, cached per cell in
  IndexedDB (`aerial|v1|<lat,lon>`: a revisit never fetches it). Up to 1.5 s is waited on a first
  visit, else the cell is built with palette roofs and rebuilt when the photo lands (`late`).
  Direct from USGS; if the browser is refused, the tile service's `/naip` relay for the session.
  Only US cells ask (the bundled 3DEP index answers "is this the US"; the photo's no-data the rest).
- **The recipe**: a seen roof colour beats the palette and the neighbourhood's roofs (estate,
  tract); a mapped `roof:colour` still beats it. A clay-red seen roof is clay tile, a blue or green
  one painted metal, wherever the region's habit says otherwise.
- `?aerial=0`: the roofs as they were (for comparing). No TileJson change: no `t/vN` bump. Bump
  `VER` in `aerialFetch.ts` when sampling, the cast or the request changes.

**Known limits.** A green metal roof reads as a tree (RGB only; NAIP's fourth band, near-infrared,
would separate them — a second exportImage with `bandIds=3`). NAIP is flown leaf-on: roofs under
old canopy are skipped (palette roof). Building parts and towers keep palette roofs. JPEG decoders
differ by a level between browsers (well under what the eye or the paint sees).

**Verifying on the deploy.** `https://dero24.github.io/Map_Game/?at=40.3597,-73.9750` (Center
Street, Sea Bright, baked) against `…&aerial=0`, and against a satellite view of the same blocks;
from the air (fly up ~80 m) the street's roofs should read as their real mix of charcoal, brown and
grey rather than one grey. Streamed: `?at=40.7270,-73.5140` (Levittown NY — the tracts' own greys
and browns) and `?at=33.3500,-111.7550` (Gilbert AZ — clay and concrete tile in warm browns); the
console shows `[aerial <cell>] N roofs read off NAIP (cast from the streets…)`. A `naip … refused`
note means the browser was refused CORS and the relay took over (needs the worker redeployed).

**What's next — facade colours from the street (Mapillary).**
- API: Mapillary Graph API v4, `GET https://graph.mapillary.com/images?bbox=<w,s,e,n>` (each bbox
  under 0.01°; `limit` up to 2000) with `fields=id,computed_geometry,computed_compass_angle,
  camera_type,camera_parameters,captured_at,thumb_1024_url`, and `GET /<image_id>/detections?
  fields=value,geometry` (base64 polygons, 4096 extent) for the building / sky / vegetation masks.
- Token: Robby registers a free app at https://www.mapillary.com/dashboard/developers (a Mapillary
  or Meta login) and copies its **client token** (`MLY|…`). Keep it out of the page: `cd worker &&
  npx wrangler secret put MAPILLARY_TOKEN`, and add a `/facades/<cx>_<cz>.json` route that does
  the reading once per cell and caches it in R2 (like `/tile`).
- Cost: free. Limits per app: 10,000 search and 60,000 entity requests a minute, 50,000 vector
  tile requests a day — one cell is ~1–3 searches plus a thumbnail per facade seen.
- Coverage: in the US, most arterials and many suburban streets (Meta's own capture plus
  contributors), thin on cul-de-sacs; denser in Europe, where Panoramax (no key) adds France.
  How many houses get a real wall colour where there is coverage is unmeasured — count it on the
  first cells before building further (the palette stays the floor).
- Method: per street-facing footprint edge, the 2–4 images 8–40 m off it whose heading covers it
  (`computed_compass_angle` ± half the field of view from `camera_parameters`), the wall rectangle
  (edge × eave height) projected into each, the building-mask pixels inside it, balanced against
  the image's own road pixels, the median across images and dates → `fc`.
- Licence: imagery CC BY-SA 4.0 — credit "© Mapillary contributors, CC BY-SA" next to the OSM
  credit; treat the per-building colours derived from it as share-alike.
- Grounding the wall palettes meanwhile: EIA RECS 2024 table HC2.7 (housing units by outside wall,
  millions) — Middle Atlantic siding 7.48 / brick 5.78 / wood 1.68 (brick ≈ 35% of units, much of
  it apartments and row houses, which `rowStyle` and the block rules already brick); New England
  brick ≈ 15%; East North Central ≈ 33%; West North Central ≈ 18%. `recipe.ts` `BRICK_SHARE` (0 in
  the Northeast) is a choice to keep the shore's look, not data — and a regional share is the
  wrong scale anyway (a beach town is far below its region's): the per-neighbourhood answer is the
  Phase 2 hood layer (`docs/NEIGHBOURHOODS.md`).
- The bake could read its roofs the way streamed cells do (registration, street balance:
  `scripts/fetch-imagery.mjs` calling `aerial.ts` `readCell` on its tiles) on the next re-bake.
- Cheaper first steps: batch with the next `t/vN` bump — read `building:color`,
  `building:facade:colour` and `roof:color` (common misspellings that carry real colours) in
  `realTile.ts`; and LiDAR RGB — many 3DEP point clouds carry colour from their project's own
  orthos: the LiDAR worker already reads every roof point, so its median is a second roof colour
  for free (a `VER` bump in `lidar.ts`).

## Deep links

- `?at=lat,lon` picks the region whose slice (then backdrop, then nearest origin) contains the
  point and spawns there — on a doorstep it places you 2.2 m outside the nearest building's
  front door.
