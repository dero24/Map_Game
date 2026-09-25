# Can this become "explore all of Earth as a painting"?

**Short answer: yes, it's a good idea.** It's also a realistic one, but only if the
architecture changes from "bake one town offline" to "stream tiles of the planet, painted on demand".
The Sea Bright demo already proves the hardest *artistic* question: real, messy open data can be
turned into something that looks like a watercolor instead of a broken GIS viewer. The remaining
work is mostly engineering, and the ingredients are all free.

## Why it's a good idea

- **The style hides the data's flaws.** Photoreal Earth (Google 3D Tiles, MSFS) needs perfect
  data and huge budgets. A watercolor only needs *plausible* shapes. ML building footprints, rough
  heights, 10 m land cover: that's all a painting needs. The Kuwahara/wash look forgives errors that
  would be glaring in a realistic renderer.
- **The data exists globally and is free.** OSM (roads, water, POIs) and Overture buildings
  (~2.5 billion footprints incl. Microsoft/Google ML, most with height estimates) cover the
  planet. So do ESA WorldCover (10 m land cover) and Terrarium/Copernicus DEM (elevation). Every
  source used here scales to the planet with the same code paths.
- **The cozy-cartographer hook scales naturally.** "Paint in your map" works for one town and for
  a planet. The shared atlas idea (every player's explored cells merge into humanity's map) becomes
  more compelling the bigger the world is.
- **Nobody owns this niche.** GeoGuessr, MSFS and Google Earth are photo/realism-driven. A calm,
  painterly "walk anywhere real" game is distinctive.

## What has to change (the honest part)

The demo bakes a 2.5 km slice + 10 km backdrop into ~25 MB of static files. That approach does
**not** scale to Earth as-is. The planet version needs:

1. **Tiled pipeline instead of one bake.** Cut the world into a quadtree (e.g. z14 web-mercator
   tiles ≈ 2.4 km at the equator). Each tile = a small binary (buildings, roads, areas, terrain,
   cover), same content as `world.json` + `terrain.bin` today but per tile, quantized and gzipped.
   Rough budget: 50–300 KB per populated tile; oceans/deserts nearly free.
2. **Two ways to produce tiles:**
   - *Pre-baked hot spots* (famous towns, where players actually go), stored on Cloudflare R2/Pages.
   - *On-demand generation* for everywhere else: a Cloudflare Worker, or a small container, that
     fetches OSM (via a planet PMTiles/vector-tile source such as Protomaps) and Overture
     (GeoParquet via DuckDB, or Overture's own PMTiles) for the tile and runs this same bake code,
     then caches the result forever. Tiles are immutable per data release, so caching is trivial and
     cheap.
   - Using **existing vector tiles** (Protomaps planet PMTiles for OSM, Overture buildings PMTiles)
     as the input format is the big shortcut. They're already tiled, clipped and simplified, and you
     can read them with HTTP range requests from static hosting. That could make the whole
     pipeline client-side, with no backend at all.
3. **Streaming + LOD in the client.** Load a ring of detailed tiles around the walker, coarser
   tiles further out, a global low-res terrain/landcover for the horizon. The current
   "slice + backdrop" split is already a 2-level version of this; generalize it to N levels.
   Move tile decoding + mesh building into a Web Worker (the reference `sim.worker` pattern of
   typed arrays + transferable buffers fits exactly).
4. **Coordinate precision.** Use a local tangent frame per tile or a floating origin that
   re-centres as you walk (float32 breaks down past a few km from the origin). The demo's local
   ENU projection is the right idea; it just needs re-anchoring per region.
5. **Procedural fill-in where data is thin.** Many places have roads but few buildings, or no
   heights. The demo already does roof/height/colour heuristics. Globally you'd add regional
   style presets (roof pitch, materials, palettes, vegetation types) driven by climate zone and
   country, e.g. terracotta roofs in the Mediterranean, snow-steep roofs in Scandinavia, adobe in
   the desert Southwest. That's also where the art direction gets really fun.
6. **Hand-authored landmarks as an overlay.** Keep a small registry of special models
   (lighthouses, bridges, towers) keyed by OSM/Wikidata IDs, like the Twin Lights / bascule bridge
   handling here. The procedural base covers 99.9 %; landmarks make places *feel* recognized.

## Risks to watch

- **Licensing:** OSM is ODbL. Tiles you serve that are derived databases may count as a
  "Derivative Database", so publish them under ODbL, not just as a "Produced Work". Keep
  attribution on screen. Overture is CDLA-Permissive (easy). Never touch Google 3D Tiles.
- **Cost of on-demand baking:** fine at hobby scale on free tiers. If it goes viral, pre-bake
  popular regions and rate-limit generation.
- **Data weirdness at scale:** broken coastlines, missing water polygons, huge relations. The
  demo's coastline→raster→flood-fill land mask is robust, but you'll want the OSM-derived
  land polygons (osmdata.openstreetmap.de) for global coastlines rather than re-deriving them.
- **Scope creep:** "all of Earth" is a pipeline problem first. The best path is to prove 5–10
  hand-picked towns with the tile format, then open the floodgates.

## Suggested path from here

1. Refactor the bake into `bakeTile(z, x, y)` producing the same data per tile (1–2 weeks).
2. Client: tile streaming ring + worker-side mesh building + floating origin.
3. Swap raw Overpass/DuckDB inputs for Protomaps + Overture PMTiles (range requests, no keys).
4. Regional style presets + a landmark registry.
5. Then the shared atlas backend (Cloudflare Worker + D1/KV holding explored-cell bitsets).

**Verdict:** worth doing. The demo is the right stepping stone, because it already answers
"will it look good?" What's left is a well-understood streaming problem, not a research one.
