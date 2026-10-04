# Real-world data: the sources, the feature catalogue, and how it scales

*The game re-creates the lower 48 in real time from open data, seeded procedure filling only what
the data leaves out. This is the map of that data: which sources are the best open ones for each
kind of thing, every neighbourhood feature we place (or will), the exact OSM tags that locate it,
what we do with it today, and how the whole pipeline scales from one town to the country.*

Legend for status: ✅ placed from real data today · 🟡 fetched but drawn generically (or only
partly used) · ❌ not yet fetched · 🧪 procedural stand-in (no real position yet).

Last reviewed 2026-10-03 (foundation first: the commercial-use check, §0). Licences are summarised,
not legal advice — check each source's terms before shipping a new one, and keep attribution in the
HUD/credits (ODbL requires the `© OpenStreetMap contributors` credit to stay visible).

---

## 0. Licences and services: commercial use, checked 2026-10-03

Robby's rule (2026-10-03): get it right at the start, not before launch. Every source and service
the game or its tile service uses, whether a paid game may use it, and the credit it needs. Not legal
advice — the terms are summarised and quoted; re-check a source's terms before relying on it for
something new. The credits screen (`src/ui/credits.ts`) shows every row's credit;
`tests/licences.test.ts` fails if the code names an outside host that has no row here and no credit,
and if Photon or Open-Meteo ever come back.

| Source / service | Host(s) | Used for | Licence / terms | Commercial game? | Credit | Share-alike | Status |
|---|---|---|---|---|---|---|---|
| OpenStreetMap data | `www.openstreetmap.org` (credit link) | streets, buildings, land use, trees, everything mapped | ODbL 1.0 | Yes | "© OpenStreetMap contributors" visible (the HUD line, always) | **Yes, on the derived database**: our TileJson cells (R2 `t/vN`) are a derivative database — if the game is public, the derived data (or how to rebuild it: the repo's `realTile.ts`) must be offered under ODbL. The rendered game is a Produced Work under any licence | in use |
| Overpass API, public instances | `overpass-api.de`, `overpass.kumi.systems`, `overpass.private.coffee` | the tile service's cold path; the browser's direct fallback | overpass-api.de's usage policy: "a maximum of about 10000 requests per day … below about 1 GB per day"; and "setting up an app for more than just OSM mappers and relying on the public instances as backend" is named as the case where "only running your own instance sustainably serves your mission". kumi.systems and private.coffee publish no commercial terms | **No, not as a game's backend** | as OSM | — | **to replace** (Tier 0, "every tile loads"): our own OSM extract cut into R2, or our own Overpass. Until then the R2 cache keeps each cell to one query per origin, the vector twin covers what Overpass can't answer, and the audit (`docs/earth/AUDIT_48.md`) shows the cost: most cold cells don't arrive |
| OpenFreeMap vector tiles | `tiles.openfreemap.org`, `openfreemap.org` | the sea and lakes of every streamed cell; the vector twin (real streets and buildings while a cell loads) | free public instance: commercial use "Yes", "no limits on the number of map views or requests" | Yes | "OpenFreeMap © OpenMapTiles Data from OpenStreetMap" | ODbL data | in use |
| OpenMapTiles schema | `www.openmaptiles.org`, `openmaptiles.org` | the vector tiles' layers | design CC BY 4.0, code BSD-3 | Yes | "© OpenMapTiles © OpenStreetMap contributors" | — | in use (credited with OpenFreeMap) |
| Terrain Tiles (Mapzen/Tilezen terrarium, AWS Open Data) | `s3.amazonaws.com` (`elevation-tiles-prod`), via the tile service's `/dem` | ground heights | US sources public domain (3DEP/NED, SRTM, GMTED2010, ETOPO1); some non-US sources CC BY; tile code MIT | Yes | "3DEP, SRTM, GMTED2010 data courtesy of the U.S. Geological Survey; ETOPO1: NOAA NCEI" (Tilezen joerd `attribution.md`) | — | in use |
| USGS 3DEP LiDAR (EPT on AWS) | `s3-us-west-2.amazonaws.com` (`usgs-lidar-public`) | measured building heights, tree crowns | public domain (US government) | Yes | courtesy USGS (not required; credited) | — | in use |
| 3DEP EPT boundaries index | `raw.githubusercontent.com` (hobuinc/usgs-lidar `resources.geojson`, bake time only) | which survey covers a cell (`src/world/lidar-index.json`) | the repo has no licence file; the facts in it (each USGS project's name and outline) are USGS's own, public domain | Yes (low risk) | — | — | in use; can be rebuilt from each EPT's own `ept.json` if ever needed |
| USDA NAIP aerial photos via the USGS National Map | `imagery.nationalmap.gov` | roof colours | public domain | Yes | "USDA NAIP via the USGS National Map" | — | in use |
| ESA WorldCover 2021 | `esa-worldcover.s3.eu-central-1.amazonaws.com` | land cover (the baked shore only) | CC BY 4.0 | Yes | "© ESA WorldCover project 2021 / Contains modified Copernicus Sentinel data (2021) processed by ESA WorldCover consortium" | — | in use (bake) |
| Overture Maps buildings | `overturemaps.org` (bake: GeoParquet via DuckDB) | the baked shore's footprints | ODbL (buildings theme: OSM, Microsoft ML Buildings, Esri Community Maps) | Yes | "© OpenStreetMap contributors, Overture Maps Foundation" | ODbL | in use (bake) |
| USGS GNIS (Domestic Names, and the 2021 archive's public places) | `prd-tnm.s3.amazonaws.com` (bake time) | the place index: towns, hamlets, parks, peaks, lakes, landmarks | public domain | Yes | credited | — | **new**: replaces Photon |
| US Census Bureau: 2026 gazetteer, 2025 cartographic boundaries, 2024 population estimates | `www2.census.gov` (bake time) | the place index: towns, townships, counties; reverse lookups (a point's town, county and state) | public domain | Yes | credited | — | **new**: replaces Photon |
| Our place index (R2 `places/vN`, the tile service's `/places/*`) | `map-game-tiles.map-game-tiles.workers.dev` | map search, arrival cards, sketchbook captions | ours, from the two rows above | Yes | — | — | **new** |
| Cloudflare Workers + R2 | `map-game-tiles.map-game-tiles.workers.dev` | the tile service, the measured heights, the place index | Workers Paid (Robby, 2026-10-03) | Yes | — | — | in use |
| GitHub Pages | `dero24.github.io` | hosting the game | GitHub's terms: Pages is "not intended for or allowed to be used as a free web-hosting service to run your online business, e-commerce site, or any other website that is primarily directed at either facilitating commercial transactions or providing commercial software as a service (SaaS)" | Fine while the game is free; **not for a paid game** | — | — | in use; **move before charging** (e.g. Cloudflare Pages or Workers static assets on the paid plan) — Robby's call |
| Photon (komoot) | (removed) | was: search and reverse lookups | public server: "please be fair - extensive usage will be throttled", no commercial terms | No | — | — | **removed 2026-10-03** (`src/ui/geo.ts` now reads our own index) |
| Open-Meteo | (never used) | — | the free API is non-commercial | No | — | — | never used: weather is seeded per day and region. A real-weather option later would use the NWS API (`api.weather.gov`, public domain), fetched by the tile service once per area per hour |
| Mapillary (images, detected objects) | (not yet) | Tier 1: the photo comparison loop (development only); street objects behind a switch | images CC BY-SA 4.0; commercial use for "development of … applications"; API apps must "materially supplement"; no real-time navigation; logo linked to mapillary.com for data via the API or tiles (docs/GAMEPLAY_VISION.md §17 "Mapillary licence") | Comparison loop: yes. Shipped objects: Robby's decision — yes, behind a switch | Mapillary logo + link in the HUD | images, and probably derived positions | not yet; **never** Mapillary Vistas or other research datasets |
| KartaView | (not yet) | the photo loop's fallback | CC BY-SA 4.0 | as Mapillary | credit | yes | not yet |
| Google Street View, Google/Apple/Bing imagery, Esri World Imagery | — | — | terms forbid this use | No | — | — | **never** |
| Code: three.js, lil-gui, idb, laz-perf | bundled | rendering, settings panel, IndexedDB, LAZ decoding | MIT, MIT, ISC, Apache 2.0 | Yes | their notices with the build (credits screen) | — | in use |
| Fonts | — | — | system fonts only (Georgia and the platform's serifs) | — | — | — | nothing to license |

**Still to check when they're added** (none is in use): per-agency GTFS feeds (each agency's own
terms), per-city tree inventories (each city's), Recreation.gov RIDB (its API terms), FAA airport
data and OurAirports (public domain / public domain-like), DOE AFDC chargers (public, API key),
PAD-US and NPS boundaries (public domain), NOAA charts (public domain), Wikidata (CC0).

**Place names** (the index, 2026-10-03): `scripts/build-places.mjs` bakes 1.85 M names of the lower
48 and DC — the Census's 31,540 places, 16,153 active county subdivisions (New England towns,
townships), 3,109 counties and the states, ranked by 2024 population; GNIS's populated places
(neighbourhoods, hamlets) and natural features (summits, lakes, islands, beaches, falls…) from the
current file; and the public places GNIS retired in 2021 (parks, forests, airports, trails,
bridges, dams, towers, hospitals, schools, places of worship, cemeteries, post offices) from its
2021 archive. No street addresses, no ranches or farms named for their owners (GNIS "Locale" is
left out), no mines or wells. Each name is filed under each word's first three letters (8,026
gzipped shards in one 95 MB R2 object, read by range); reverse lookups read 0.25° tiles of the
Census boundaries simplified to ~25 m (13,737 tiles, 19 MB). Search ranks by standing, how well the
name matches, and nearness; a national park outranks the hamlet named for it. The game's own
search of the loaded world finds streets and named buildings, never a house by its address.

---

## 1. The sources, ranked for the United States

| # | Source | What it gives us | Licence | Resolution / freshness | In use? |
|---|---|---|---|---|---|
| 1 | **OpenStreetMap** (Overpass today; planet extracts next) | Every street, path, building outline, land use, park, pitch, parking lot, tree, bench, hydrant, signal, shop… with names and rich tags | ODbL 1.0 (attribution + share-alike on the derived database) | Survey-grade in cities; minutes fresh | ✅ the backbone (`src/world/realTile.ts`, `overpassQuery`) |
| 1a | **OpenFreeMap** (the OpenMapTiles planet as z0–14 vector tiles, CDN, no key) | OSM already processed: the coastline closed into ocean polygons, water, land use and cover, parks, buildings with heights, streets with class/name/bridge/tunnel, POIs | ODbL data; © OpenMapTiles; free service | Weekly planet builds; a tile in ~0.2 s | ✅ water for every stand-in cell and every real cell's sea (`src/world/mvt.ts`, `tile.worker.ts mvtWater`), and the **vector twin**: a whole cell translated back to OSM tags (`src/world/vectorTile.ts`) when Overpass is slow or down — streets, buildings with heights, land use, water, named shops, bins, post boxes, racks, bollards; not street surfaces, parking or crossing tags, trees |
| 2 | **USGS 3DEP LiDAR** (EPT point clouds on AWS `usgs-lidar-public`) | Measured building heights and roof shapes, tree positions and canopy heights, ground truth under trees | Public domain | ~8+ points/m², most of the US; years vary by county | ✅ heights/trees (`src/world/lidar.ts`, `scripts/lidar-index.mjs`) |
| 3 | **USGS 3DEP DEM** (1 m and 1/3″ bare earth) | The ground itself: hills, bluffs, river banks | Public domain | 1 m where LiDAR flown, 10 m everywhere | 🟡 via AWS Terrain Tiles (Terrarium PNG, z≤14 ≈ 7–10 m, mixes SRTM/NED/3DEP) — **use z11+ in cities; z9–10 are surface models that include buildings** |
| 4 | **Overture Maps** (GeoParquet, monthly) | Buildings (OSM + Microsoft ML + Esri community), Places (~60 M POIs from Meta/Microsoft/etc.), transportation, land use/cover, water, addresses, divisions | Buildings/transport/base: ODbL; Places: CDLA-Permissive-2.0; others vary | Monthly releases, global | ❌ — the best way to fill footprints and shops OSM lacks, and the natural source for the planet-scale pipeline (§4) |
| 5 | **USDA NAIP aerial imagery** | Roof colours; ground truth for what a blank space *is* (asphalt lot, lawn, pool, court); 4-band (with near-infrared) | Public domain | 60 cm (30 cm in newer states), every 2–3 years | 🟡 roof colours in the bake (`scripts/fetch-imagery.mjs`) — not yet classifying ground |
| 6 | **ESA WorldCover** | Land cover (tree, grass, crop, built, water, wetland…) where OSM is silent | CC BY 4.0 | 10 m, 2020/2021 | 🟡 bake only (`scripts/fetch-worldcover.mjs`) |
| 7 | **NLCD / Annual NLCD** (USGS MRLC) + **USFS Tree Canopy Cover** | Impervious-surface % and canopy % per 30 m cell — how built-up and how leafy a block is | Public domain | 30 m, annual series | ❌ |
| 8 | **Meta & WRI High-Resolution Canopy Height** (AWS `dataforgood-fb-data`) | Tree height per metre where LiDAR is missing or old | CC BY 4.0 | 1 m, circa 2018–2020 imagery | ❌ |
| 9 | **City street-tree inventories** (NYC 2015 Tree Census, Seattle SDOT Trees, DataSF Street Tree List, …) and the **OpenTrees.org** aggregation | Every street tree's position, species and trunk size | Mostly public domain / open (per city) | Per city, updated yearly-ish | ❌ — the fix for "all the trees look the same": species by the actual tree |
| 10 | **GTFS feeds** (catalogued by the **Mobility Database**) | Real bus/tram/train routes, stops and timetables | Per agency; the vast majority open | Weekly-ish | ❌ — buses that run the real route on the real schedule |
| 11 | **GBFS** (bike/scooter share, MobilityData catalogue) | Dock positions, live bike counts | Per operator, mostly open | Live | ❌ |
| 12 | **FHWA HPMS / BTS NTAD** | Annual average daily traffic (AADT) on major roads; rail network; ports | Public domain | Yearly | ❌ — how busy each road really is |
| 13 | **US Census**: TIGER/Line, ACS, 2020 blocks, **LEHD LODES** | Street names/address ranges; population, age, commute mode, jobs per block (daytime population) | Public domain | Yearly (ACS), decennial | ❌ — who is on the sidewalk, and when |
| 14 | **OpenAddresses** / **USDOT National Address Database** | Address points (house numbers on doors, mailboxes) | Mixed open / public domain | Varies | ❌ (OSM `addr:*` only today) |
| 15 | **Who's On First** + OSM `place=neighbourhood` | Neighbourhood names and polygons (arrival cards, map labels) | CC BY 4.0 (WOF) / ODbL | Stable | ❌ |
| 16 | **USGS NHD / NHDPlus HR** | Every river, creek and ditch with flow direction and width class | Public domain | 1:24k | ❌ (OSM water only) |
| 17 | **MarineCadastre AIS** (NOAA/BOEM) + **NOAA ENC charts** | Where boats actually go (ferry lanes, channels, marinas), vessel types; water depths, buoys | Public domain | Yearly AIS; ENC continuous | ❌ — real boat traffic |
| 18 | **PAD-US** (USGS protected areas) | Every park and public land, with manager and access | Public domain | Yearly | ❌ |
| 19 | **Mapillary** (street-level photos + detected map features) | Reference photos for reviews; detected traffic signs, street lights, benches, hydrants, crosswalks, manholes *with positions* | CC BY-SA 4.0 (free API token) | Crowd-sourced, dense in cities | ❌ — fills OSM's street-furniture gaps |
| 20 | **All the Places** | Brand store locations scraped from store finders (a chain's real storefronts) | CC0 | Weekly | ❌ |
| 21 | **Wikidata / Wikimedia Commons** | Landmark facts (heights, dates, architects), photos for reference | CC0 / per image | Live | ❌ |
| 22 | **NWS api.weather.gov** (never Open-Meteo's free API: non-commercial) | Today's real weather at the place | public domain | Live | ❌ (weather is seeded; a later option, §0) |
| 23 | **Our own place index** (USGS GNIS + US Census, §0) — replaced Photon 2026-10-03 | Search: "Space Needle" → coordinates; reverse: the town and county at a point | public domain | GNIS every other month; Census yearly | ✅ (`src/ui/geo.ts`, `src/ui/placeIndex.ts`, `worker/src/places.js`, `scripts/build-places.mjs`) |
| 24 | **ESA Ocean Colour CCI** (Forel-Ule index climatology) | The colour of the water on every coast: the scale from indigo ocean to green sounds to brown estuaries | CC BY 4.0 | 4 km monthly composites | 🟡 read by hand into coarse per-climate/per-subregion palettes (`styles.ts WaterLook`: Puget Sound green-steel, the Keys' turquoise, the Gulf's olive) — next: a baked byte grid per coast |
| 25 | **NOAA CUDEM** (Continuously Updated DEM, topobathy) | Land *and* sea floor at 1/9″ (~3 m) along the coasts: seawalls, beaches, harbour depths | Public domain | Most of the US coast | ❌ — the fix for DEM smears at the waterline and for real shallows under the water shader |

**Not open, so not used:** Google/Apple/Bing imagery and 3D tiles, SafeGraph, Strava Metro,
Zillow's current data, Esri basemaps. (Google Open Buildings doesn't cover the US.)

---

## 2. The neighbourhood feature catalogue

Everything a player can walk past, where it comes from, and how the game places it. "Fallback" is
what fills the gap when the map says nothing — always deterministic (seeded by position).

### 2.1 Streets and getting around

| Feature | OSM tags (where it is) | Other sources | Game today | Next |
|---|---|---|---|---|
| Streets, lanes, widths | `highway=*`, `lanes`, `width`, `oneway`, `turn:lanes` | TIGER names; HPMS lanes | ✅ painted near, ribbons far; car graph | turn arrows from `turn:lanes` |
| Street surface | `surface=asphalt/concrete/paving_stones/sett/brick/cobblestone/gravel/unpaved` | Mapillary photos | ✅ each surface its colour; brick and sett courses painted across the street (`roadPalette.ts streetSurface`) | the vector twin only knows paved/unpaved |
| Sidewalks | `sidewalk=both/left/right/no/separate`, `footway=sidewalk` ways | city sidewalk inventories | 🟡 mapped sidewalks drawn; unmapped inferred from road class | honour `sidewalk=no` (rural roads, many suburbs) |
| Crosswalks | `highway=crossing` nodes + `crossing=marked/zebra/uncontrolled/traffic_signals`, `crossing:markings=*` | Mapillary detections | ✅ mapped ones painted where they are, ladder or two lines by their markings, none where unmarked (`kerbside.ts crossingPaint`); the junction's inferred crosswalk steps aside; 🧪 inferred at unmapped junction arms | curb ramps |
| Kerbs, ramps | `barrier=kerb`, `kerb=lowered/flush/raised`, `tactile_paving` | — | 🧪 painted kerb line | curb ramps at crossings |
| Traffic signals, stop & yield | `highway=traffic_signals/stop/give_way`, `stop=all` | Mapillary signs | ✅ junction control (`src/sim/traffic.ts`) | — |
| Traffic calming | `traffic_calming=bump/hump/table/chicane/island` | — | ❌ | cars slow; speed-table paint |
| Bike lanes & tracks | `cycleway=lane/track/shared_lane`, `cycleway:left/right`, `highway=cycleway` | city bike maps | 🟡 separate cycleways painted | lane paint on the carriageway |
| Bus stops & shelters | `highway=bus_stop` (+ `shelter`, `bench`), `public_transport=platform` | **GTFS stops** | ✅ poles/shelters | buses that stop there on the GTFS timetable |
| Tram / rail | `railway=tram/light_rail/rail/subway`, `railway=level_crossing`, `railway=subway_entrance` | GTFS, NTAD rail | ✅ track, wires, entrances | trains on the timetable |
| Bridges | `bridge=yes/viaduct/movable`, `layer`, `bridge:structure` | NBI (National Bridge Inventory, public) for type/length | ✅ decks | truss/arch/suspension looks from `bridge:structure` / NBI |
| **Tunnels** | `tunnel=yes/culvert`, `layer<0`, `location=underground` | — | ✅ nothing drawn above ground; a concrete portal face round a dark mouth where the street goes under (`portals.ts`) | a cut trench on the approach |
| Building passages & covered streets | `tunnel=building_passage`, `covered=yes` | — | ✅ kept at street level | an arch cut in the ground floor |
| Steps & ramps | `highway=steps` (+ `incline`, `step_count`), `ramp=yes` | — | ✅ a flight of even risers between the ground at its ends (the mapped `step_count` where there is one), handrails, a deck the walkers climb (`stairs.ts`) | landings on long flights; `ramp=yes` beside them |
| Street lamps | `highway=street_lamp` (+ `lamp_mount`, `light:colour`) | Mapillary; city streetlight layers | ✅ a mast at each mapped lamp, its arm over the nearest street, its pool of light at night; 🧪 the spacing fill steps aside within 18 m | lamp styles from `lamp_mount`/`support` |
| Utility poles & wires | `power=pole/tower/line/minor_line`, `man_made=utility_pole` | — | ✅ lines; 🧪 street poles | mapped poles |
| Hydrants | `emergency=fire_hydrant` (+ `fire_hydrant:type`, `colour`) | city hydrant layers | ✅ (and 15 ft of kerb kept clear) | colours by city practice from the tag |
| Bollards, gates, barriers | `barrier=bollard/gate/lift_gate/jersey_barrier/block` | — | ✅ bollards (prop + collision); ❌ gates, blocks | gates that open |
| Street name signs | `name` at junctions | TIGER | ✅ junction signs | — |
| House numbers, mailboxes | `addr:housenumber`, `addr:street` | OpenAddresses, NAD | 🟡 OSM only | number plaques on doors everywhere |

### 2.2 Parking

| Feature | OSM tags | Other | Game today | Next |
|---|---|---|---|---|
| Surface lots | `amenity=parking` + `parking=surface` (areas), `parking_space=*`, `capacity`, `access` | NAIP / NLCD impervious (unmapped lots) | ✅ striped, filled with cars (`src/world/lots.ts`) | **find unmapped lots**: blank impervious ground next to shops → a lot |
| Garages / decks | `parking=multi-storey/underground/rooftop`, `building=parking` | — | 🟡 as buildings | open-sided deck look |
| Street parking | `parking:left/right/both`, `parking:*:orientation` (and the older `parking:lane:*`) | city curb inventories | ✅ kerb cars, ~80 % of spaces taken downtown, kept clear of corners, driveways and alley mouths, crosswalks, hydrants and bus zones where the map puts them (`kerbside.ts`, drawn by `kerbCars.ts`); pay stations at `vending=parking_tickets` | time of day: kerbs empty at night downtown, full in the evening on residential streets |
| Driveways, alleys, aisles | `highway=service` + `service=driveway/alley/parking_aisle` | — | ✅ | — |
| Bike racks | `amenity=bicycle_parking` (+ `bicycle_parking=stands/wall_loops`, `capacity`) | city rack layers | ✅ three Sheffield hoops square to the kerb, a bike or two locked on (`assets/street.ts`) | the rack's length from `capacity` |
| EV chargers | `amenity=charging_station` | AFDC (DOE, public) | ❌ | charger posts at the bays |

### 2.3 Sports, play and recreation

| Feature | OSM tags | Game today | Next |
|---|---|---|---|
| **Basketball courts** | `leisure=pitch` + `sport=basketball` (+ `hoops=1/2`, `surface`) | 🟡 painted as generic "pitch" | court paint (key, arc, centre circle) + hoops on posts |
| Tennis / pickleball | `sport=tennis`, `sport=pickleball` (+ `surface=clay/hard/grass`) | 🟡 generic | lines, net, fence round the court |
| Baseball / softball | `sport=baseball/softball` (+ `leisure=pitch` area, often the whole diamond) | 🟡 generic | infield dirt, bases, backstop, dugouts |
| Soccer / football | `sport=soccer/american_football/rugby` | 🟡 generic | lines, goals / uprights |
| Volleyball, skate parks | `sport=volleyball/beachvolleyball/skateboard` | 🟡 generic | net; skate ramps |
| Multi-sport, school fields | `sport=multi`, `amenity=school` grounds | 🟡 generic | the lines of each sport listed (`sport=a;b`) |
| Running tracks | `leisure=track` (+ `sport=running/athletics`) | ❌ | red oval with lanes |
| Stadiums, grandstands | `leisure=stadium`, `building=grandstand`, `leisure=bleachers` | 🟡 as buildings | stands facing the field |
| **Playgrounds** | `leisure=playground` (area) + equipment nodes/ways `playground=swing/slide/climbingframe/sandpit/seesaw/springy/roundabout/structure` | ✅ each mapped piece where it is (`assets/play.ts`); an empty mapped playground fitted with a tower, swings and the rest | kids on them by day |
| Fitness stations | `leisure=fitness_station` (+ `fitness_station=*`) | ❌ | outdoor gym props |
| Dog parks | `leisure=dog_park` | ❌ | fenced, dogs off the lead |
| Pools | `leisure=swimming_pool` (+ `access=private` for back yards), `leisure=water_park` | ✅ painted blue | swim in them (backlog R.9) |
| Golf | `leisure=golf_course` + `golf=tee/fairway/green/bunker/rough/hole` | 🟡 course paint | greens, bunkers, flags |
| Mini golf, ice rinks | `leisure=miniature_golf`, `leisure=ice_rink` | ❌ | — |
| Picnic spots | `leisure=picnic_table`, `amenity=bbq`, `leisure=firepit`, `amenity=shelter` | ❌ | tables, grills, families at weekends |
| Marinas, slipways, piers | `leisure=marina`, `leisure=slipway`, `man_made=pier` | ✅ piers; 🟡 marinas | boats berthed on mapped `seamark` / AIS evidence |

### 2.4 Green and growing

| Feature | OSM tags | Other | Game today | Next |
|---|---|---|---|---|
| Parks, lawns, gardens | `leisure=park/garden`, `landuse=grass/recreation_ground/village_green` | PAD-US | ✅ | paths, benches, a bandstand from the park's own tags |
| Community gardens | `landuse=allotments`, `leisure=garden` + `garden:type=community` | — | ❌ | raised beds |
| Woods, scrub, meadow | `natural=wood`, `landuse=forest`, `natural=scrub/heath/grassland`, `landuse=meadow` | WorldCover, NLCD | ✅ | canopy height from LiDAR / Meta-WRI |
| **Individual trees** | `natural=tree` (+ `species`, `genus`, `leaf_type`, `leaf_cycle`, `height`, `circumference`, `diameter_crown`) | **city tree inventories, OpenTrees**; LiDAR crowns | ✅ positions; ✅ species from `genus`/`species`/`taxon`/common names → the foundry family (`realTile.ts treeKindOf`), mapped `height`; a LiDAR crown takes the species of the mapped tree under it; 🟡 unnamed trees by region mix | city inventories where OSM has no species |
| Tree rows, hedges | `natural=tree_row`, `barrier=hedge` | — | ❌ / 🟡 | rows along the line; clipped hedges |
| Flower beds, planters | `landuse=flowerbed`, `man_made=planter` | — | ❌ | — |
| Farmland, orchards, vineyards | `landuse=farmland/orchard/vineyard/farmyard`, `crop=*` | USDA Cropland Data Layer (public, 30 m, yearly) | ✅ farmland | crop by field from the CDL |
| Cemeteries | `landuse=cemetery`, `amenity=grave_yard` | — | ✅ lawn | headstone rows |

### 2.5 Water

| Feature | OSM tags | Other | Game today | Next |
|---|---|---|---|---|
| Sea, bays, lakes, ponds | `natural=coastline`, `natural=water` + `water=*` | NHD waterbodies; ESA OC-CCI colour | ✅ the sea from the vector tiles' ocean, never the DEM; lakes laid flat at their level and drawn with the water shader (ripples, the sky in them); each coast's own water colour; foam along every streamed coast (`shore.ts`) | depth colour from NOAA charts / CUDEM |
| Rivers, creeks, ditches | `waterway=river/stream/canal/ditch/drain` (lines, `width`) | **NHDPlus HR** | 🟡 areas only | line waterways at their width, flowing downhill |
| Fountains | `amenity=fountain` | — | ❌ | animated fountain |
| Breakwaters, groynes, seawalls | `man_made=breakwater/groyne`, `wall=seawall` | — | ✅ | — |
| Boats | `seamark:*`, `leisure=marina`, `mooring=*` | **AIS tracks** (where boats go), ferry GTFS | 🧪 random boats | ferries on their routes, moorings in marinas |

### 2.6 Buildings and what's in them

| Feature | OSM tags | Other | Game today | Next |
|---|---|---|---|---|
| Footprints | `building=*`, `building:part=*` | **Overture / Microsoft footprints** where OSM is thin | ✅ OSM (+ LiDAR-found in the bake) | Overture footprints fill the gaps |
| Heights, floors, roofs | `height`, `building:levels`, `min_height`, `roof:shape/height/colour/material` | **3DEP LiDAR**; NAIP roof colour | ✅ | — |
| **Canopies** | `building=roof`, `building=carport` (gas stations, market walks, platforms) | — | ✅ **new**: an open roof on posts at the right clearance | fuel pumps under a station's canopy (`amenity=fuel`) |
| Shops, restaurants, offices | `shop=*`, `amenity=*`, `office=*`, `craft=*` nodes and building tags; `opening_hours` | **Overture Places**, All the Places | ✅ signs and interiors by use | open/closed by `opening_hours` and the clock |
| Entrances | `entrance=main/service/yes` nodes on the outline | — | 🟡 inferred from the street | doors exactly where mapped |
| Landmarks | `tourism=attraction`, `historic=*`, `man_made=tower/water_tower/chimney/silo/storage_tank/mast/lighthouse`, `amenity=place_of_worship` | Wikidata (heights, dates) | 🟡 lighthouses, churches, towers | water towers, silos, tanks as their own shapes |
| Viewpoints and the peaks they look at | `tourism=viewpoint` (+ `direction`); `natural=peak/volcano` + `name`, `ele` (OpenMapTiles `mountain_peak`) | Wikidata | ✅ a coin-op viewer facing the view; the summit named with its distance and direction, P turns you to it (`peaks.ts`) | peak labels on the horizon ring; golden-hour "paint this" commissions |
| Markets | `amenity=marketplace` (area/building) | — | ✅ stalls under awnings along the street faces, vendors and shoppers (`assets/market.ts`, props.ts) | stalls that sell what you can carry |
| Schools, hospitals, stations | `amenity=school/hospital/…`, `railway=station` | NCES school locations (public) | 🟡 | school zones: crossing guards, buses at 3 pm |

### 2.7 Street furniture and small things

`amenity=bench` ✅ · `amenity=waste_basket` ✅ · `amenity=recycling` ❌ · `amenity=post_box` ✅
(the US Mail's blue box; a red pillar where they drive on the left) · `amenity=telephone` ❌ ·
`amenity=vending_machine` + `vending=parking_tickets` ✅ (pay stations) · `amenity=drinking_water` ✅ ·
`amenity=toilets` ❌ · `amenity=clock` ❌ · `man_made=flagpole` ✅ · `advertising=billboard/column/board` ❌ ·
`man_made=street_cabinet` ❌ · `man_made=manhole` ❌ · `tourism=information` (+ `information=board/map`) ❌ ·
`tourism=artwork` / `historic=memorial` ❌ · `amenity=bicycle_rental` (**GBFS** docks) ❌ ·
`emergency=phone` ❌ · `highway=street_lamp` ✅ · `barrier=bollard` ✅. All are single nodes: one
Overpass line each, one foundry prop each (`realTile.ts furnitureClass`, `assets/street.ts`) — the
cheapest big win for "a street that feels mapped".

### 2.8 People, traffic and time

| What | Source | Use |
|---|---|---|
| How busy a road is | **HPMS AADT** (major roads), OSM road class otherwise | car density per street, rush hours |
| Transit | **GTFS** | buses/trams/ferries on real routes and times; crowds at stops before arrivals |
| Who lives/works here | **Census blocks, ACS, LODES** | sidewalk crowds by hour: downtown fills 9–5, residential streets in the evening; kids near schools after 3 pm; age mix for walkers |
| Shops open | OSM `opening_hours` | lit interiors, shoppers in doorways only when open |
| Weather | seeded; NWS later (never Open-Meteo's free API) | rain in Seattle when it's raining in Seattle (opt-in) |
| Neighbourhood names | Who's On First, OSM `place=neighbourhood/suburb/quarter` | arrival cards, map labels, "you're in Queen Anne" |

---

## 3. Where a thing goes when the map is silent (the fallback ladder)

1. **Mapped** — the OSM (or Overture/city) object at its surveyed position. Always wins.
2. **Measured** — LiDAR/imagery tells us it's there: a crown in the canopy model is a tree; a flat
   impervious patch next to a store in NAIP/NLCD is a parking lot; a bright blue rectangle in a
   back yard is a pool; hoops' shadows are too small, so a court needs a map or a Mapillary sighting.
3. **Inferred** — rules from context that real towns follow: a lamp every ~35 m on a lit
   residential street, crosswalks at signalised junctions, sidewalks on urban streets unless
   `sidewalk=no`, a stop sign facing the minor road at an uncontrolled T.
4. **Procedural** — seeded by the cell's position (never a per-town list): the foundry picks the
   variety (`carMix`, `plantMix`, `variantAt`) so the same street is the same for every visitor.

Every placed thing records which rung it came from, so a reviewer can see "real" vs "guessed".

---

## 4. Scaling from one town to the lower 48

**Today.** Each 1024 m cell is one Overpass query (`overpassQuery`), turned into `TileJson` by the
same `osmToTile` in the Cloudflare tile service (cached in R2 under `t/vN`) or in the browser
(`?tiles=direct`, cached in IndexedDB). DEM tiles come from AWS Terrain Tiles through the same
service; LiDAR is measured per building at bake time. This works for exploring, but Overpass is
a shared public service (a couple of concurrent queries per client, daily quotas), and a dense
downtown cell takes 10–30 s to answer — the "pencilled streets" wait (backlog R.3).

**Next: our own extract, cell by cell, offline.**

1. **Ingest** the Geofabrik US extract (daily OSM, ~10 GB PBF) *and* the monthly Overture release
   (GeoParquet: query only the columns and bounding boxes needed with DuckDB, no full download).
2. **Cut** it into the game's 1024 m cells with the *same* `osmToTile` logic (run in Node over
   the extract instead of Overpass JSON) — one pipeline, four feeders stays true.
3. **Enrich** each cell once, offline, into a sidecar layer next to the tile: LiDAR building
   heights and tree crowns (3DEP EPT), NAIP ground classes (lots, pools, courts' surfaces), street
   trees with species (city inventories / OpenTrees), GTFS stops and route shapes, AADT per road,
   Overture Places for unmapped shops. Stored as `t/vN/<cell>.json` + `l/vN/<cell>.bin` in R2.
4. **Serve** both from the tile worker; the client never talks to Overpass unless a cell is
   missing (then the direct path is the graceful fallback, as now).
5. **Refresh** incrementally: OSM minutely/daily diffs touch a small set of cells; re-cut only
   those. Version keys bump together (`t/vN` + client `&v=N`; `VER` in `lidar.ts`).

**Size.** The lower 48 is ~8 M km²; most of it is fields and forest whose cells are a few KB.
Built-up land (Census urban areas) is roughly 0.25 M km² at tens to hundreds of KB per cell compressed — on the order of
10–50 GB of tiles plus sidecars, which R2 serves without egress fees. Precomputation is the
expensive part (LiDAR is terabytes); run it where players go first (metros), then outward.

**Determinism.** Every source is pinned to a release (OSM date, Overture release, LiDAR project,
NAIP year) and every procedural choice is seeded by position, so everyone sees the same world and
a re-cut changes only what the data changed.

---

## 5. Order of work (impact per effort)

1. ~~**Street furniture nodes** (§2.7) and **mapped crossings / lamps**~~ — done (u): crossings,
   lamps, bins, post boxes, racks, fountains, bollards, pay stations; parking clearances from them.
2. ~~**Pitches by sport + playground equipment** (§2.3)~~ — done ((s) courts, (u) playgrounds).
3. ~~**Street-tree species** (OSM `species`/`genus`)~~ — done (u); city inventories next where OSM
   has none.
4. **Unmapped parking lots from imagery/impervious** (backlog R.4).
5. **GTFS buses and trams** — transit that runs.
6. **Overture footprints + Places** — the gaps in OSM filled.
7. **The offline cell pipeline** (§4) — no more waiting on Overpass.
