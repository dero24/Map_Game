# map_game — Concept & Sources

## The game

A first-person, watercolor-styled exploration game set in **real places on Earth**.
You arrive in a small town rendered like a living painting, walk its streets, watch the
light change, and fill in your own map of the place. No combat, no crafting, no meters.

**v1 fantasy:** pure cozy tourism. You are a visitor with a blank map.

**Long-term hook (parked, not v1):** the cartographer idea — every player's explored
map contributes to a shared atlas of Earth; humanity collectively explores the planet.
That needs a tiny shared backend (Cloudflare Workers free tier could do it) — real
possibility later, zero cost if designed carefully. Not required for the slice.

## Why Sea Bright, NJ for the vertical slice

A narrow barrier peninsula between the Atlantic Ocean (east) and the Shrewsbury
River (west). It is nearly the perfect first map:

- **Natural world borders:** ocean on one side, river on the other, exactly two
  bridges in/out (Highlands–Sea Bright Rt-36 north, Rumson CR-520 south). The map
  edge problem solves itself — the world literally ends in water.
- **Right size:** the strip is ~5.8 km long but only ~300–400 m wide. A ~2 km slice
  covers the dense downtown plus a landmark bridge.
- **Landmarks:** Rumson–Sea Bright bascule bridge, Borough Hall/beach pavilion,
  seven beach clubs, marinas. On the skyline (rendered beyond play bounds): Twin
  Lights lighthouse on the Navesink Highlands bluff (~2.5 km NW), the Highlands
  bridge, Sandy Hook lighthouse further north.
- **Vibe:** classic off-season Jersey Shore — quiet streets, gulls, sea fog rolling
  in, golden hour setting *over the river* (rare on the East Coast), nor'easter
  mood in winter.
- **You know it personally** — you'll instantly spot when generation is wrong.

**Recommended slice bbox:** `S 40.352, W -73.993, N 40.372, E -73.964`
(~2 km: downtown core + Rumson bridge + water on both sides).
Optional north extension to `N 40.404` adds North Beach + the Highlands bridge later.

Seattle stays on the later list — much bigger, needs the pipeline to be proven first.

## What the player does (v1)

1. Arrive in town (spawn at the bridge or the beach).
2. Walk. Ocean Ave is the spine; short cross streets run seawall-to-river.
3. Your map starts blank — walking **paints it in** (fog-of-war chart).
4. Discover named spots (POIs get stamped when found: the pavilion, a marina, a
   beach club, the bridge).
5. Find **vantage points** — postcard views (Twin Lights at dusk, sunrise over the
   ocean, the bridge at golden hour).
6. Watch the world change: real day/night cycle, drifting weather, sea fog, night
   as an indigo wash. The same street at 7am and 7pm are different paintings.
7. Your map, stamps, and postcards persist (IndexedDB). Come back tomorrow.

That's it. Enough loop to prove the tech and the mood without needing NPC dialogue,
interiors, or quests yet.

## Data sources (all verified free, 2026)

NOTE: YOU CAN ALWAYS RESEARCH ONLINE AND OVERRIDE ANY OF THIS IF YOU THINK IT WILL MAKE A BETTER GAME!

Everything is **download-once → bake offline → ship static files**. No runtime
API calls, no keys in the shipped game.

| Need | Source | License | Notes |
|---|---|---|---|
| Roads, paths, POIs, water | **OSM via Geofabrik** `new-jersey-latest.osm.pbf` (~156 MB, daily updates) | ODbL → "Produced Work": attribution only, **no share-alike on the game** | Extract our bbox with `osmium` (conda-forge win-64 build, or pure-JS `osm-read` parser) |
| Building footprints + heights | **Overture Maps** `theme=buildings` (GeoParquet, DuckDB bbox query) | CDLA-Permissive 2.0 | `height`, `num_floors`, `roof_shape`, `facade_color` fields where known; GERS UUIDs = stable building IDs. ⚠️ Only last ~2 monthly releases stay public — archive our pull. Fallback: OSM `building=*` footprints |
| Elevation | **AWS Terrain Tiles** Terrarium PNGs z0–15, no key; **USGS 3DEP 1 m lidar** for Monmouth County | Public domain-ish | Town is ~1 m elevation — lidar catches dunes + seawall. Terrarium for the Highlands backdrop |
| Landcover | **ESA WorldCover** 10 m | CC BY 4.0 | Drives vegetation/ground palette |
| Climate | **Open-Meteo ERA5 archive** | CC BY 4.0 | Bake monthly normals at build time → weather probabilities. Never call at runtime |
| Landmark metadata | **Wikidata SPARQL** | CC0 | Bake landmark facts (needs descriptive User-Agent) |
| Place names | **GeoNames dumps** / Overture `divisions` | CC BY / CDLA | Download dumps, skip API credit limits |
| Rivers/water (if OSM thin) | **HydroSHEDS v2** | CC BY 4.0 | Probably not needed — ocean + river come from OSM coastline |
| Facade color reference | **Mapillary API** | Free token | Sample street-photo color histograms offline to pick realistic siding palettes. Extract stats only, never ship images |
| Debug/UI basemap (optional) | **Protomaps PMTiles** extract | ODbL | `pmtiles` JS reader is BSD-3; handy for a real-map dev overlay |

### Licensing obligation (the only homework)

Ship a credits/attribution screen: `© OpenStreetMap contributors (ODbL) · Overture
Maps Foundation (CDLA-Permissive) · ESA WorldCover (CC BY) · Open-Meteo (CC BY) ·
USGS 3DEP (public domain) · Natural Earth (public domain)`. That's the entire cost
of free real-world data.

### Traps confirmed

- **Google Photorealistic 3D Tiles — banned for us.** ToS prohibits caching,
  bulk download, and deriving geometry; needs a billing card. Correctly avoided.
- **Mapbox** "free" tier now requires a card for production access. Not needed.
- **Netlify** free tier gutted (Sept 2025): ~15 GB/mo bandwidth equivalent.
- **OpenTopography API**: free but account-gated; use raw USGS files instead.

## Asset & audio sources (all free)

| Need | Source | License |
|---|---|---|
| Textures/materials base | **ambientCG**, **Poly Haven** | CC0 |
| Props, vegetation models | **Kenney**, **Quaternius**, Poly Pizza (filter CC0/CC-BY) | CC0 / CC-BY |
| HDRI skies (reference) | **Poly Haven** | CC0 |
| Sound effects | **Sonniss GDC packs** (best: royalty-free, no attribution, commercial OK), **Pixabay sounds**, Freesound | ⚠️ Freesound: only CC0/CC-BY — **never CC-BY-NC** |
| Fonts (journal/map UI) | **Google Fonts** self-hosted via `@fontsource` (Caveat etc.) | OFL |
| Excluded | BBC Sound Effects (personal/edu only), Sketchfab (license soup), Zapsplat (attribution + limits — usable fallback) | — |

## Toolchain (all free)

Vite + TypeScript + Three.js (r170+, WebGL2), `postprocessing` (pmndrs, zlib
license), `lil-gui` (dev panel, MIT), `three-mesh-bvh` (MIT, collision), `idb`
(IndexedDB saves), Vitest + Playwright (testing), Blender/Krita/GIMP/Audacity
(or Tenacity), `osmium-tool` via conda-forge for OSM extracts, DuckDB for
Overture GeoParquet queries, `pmtiles` for optional basemap.

## Hosting (free)

- **itch.io** — primary. Free forever, ≤200 MB/file, ≤500 MB extracted, where the
  audience is. Supports cross-origin isolation checkbox for SharedArrayBuffer.
- **Cloudflare Pages** — mirror. Unlimited bandwidth, 25 MiB/file cap (chunk baked
  data under that), custom headers allowed.
- **GitHub Pages** — mirror only; can't set COOP/COEP headers so no SAB there.

## Total cost: $0.00
