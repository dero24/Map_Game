# Real-world data: the sources, the feature catalogue, and how it scales

*The game re-creates the lower 48 in real time from open data, seeded procedure filling only what
the data leaves out. This is the map of that data: which sources are the best open ones for each
kind of thing, every neighbourhood feature we place (or will), the exact OSM tags that locate it,
what we do with it today, and how the whole pipeline scales from one town to the country.*

Legend for status: ✅ placed from real data today · 🟡 fetched but drawn generically (or only
partly used) · ❌ not yet fetched · 🧪 procedural stand-in (no real position yet).

Last reviewed 2026-09-28 (t). Licences are summarised, not legal advice — check each source's terms
before shipping a new one, and keep attribution in the HUD/credits (ODbL requires the
`© OpenStreetMap contributors` credit to stay visible).

---

## 1. The sources, ranked for the United States

| # | Source | What it gives us | Licence | Resolution / freshness | In use? |
|---|---|---|---|---|---|
| 1 | **OpenStreetMap** (Overpass today; planet extracts next) | Every street, path, building outline, land use, park, pitch, parking lot, tree, bench, hydrant, signal, shop… with names and rich tags | ODbL 1.0 (attribution + share-alike on the derived database) | Survey-grade in cities; minutes fresh | ✅ the backbone (`src/world/realTile.ts`, `overpassQuery`) |
| 1a | **OpenFreeMap** (the OpenMapTiles planet as z0–14 vector tiles, CDN, no key) | OSM already processed: the coastline closed into ocean polygons, water, land use and cover, parks, buildings with heights, streets with class/name/bridge/tunnel, POIs | ODbL data; © OpenMapTiles; free service | Weekly planet builds; a tile in ~0.2 s | ✅ water for every stand-in cell and every real cell's sea (`src/world/mvt.ts`, `tile.worker.ts mvtWater`) — and the natural fallback feeder for whole cells when Overpass is slow or down |
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
| 22 | **Open-Meteo** / **NWS api.weather.gov** | Today's real weather at the place | CC BY 4.0 (free API is non-commercial) / public domain | Live | ❌ (weather is simulated) |
| 23 | **Photon** (komoot, OSM geocoder) | Search: "Space Needle" → coordinates | ODbL data | Live | ✅ (`src/ui/geo.ts`) |

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
| Street surface | `surface=asphalt/concrete/paving_stones/sett/brick/cobblestone/gravel/unpaved` | Mapillary photos | ❌ all asphalt | brick & sett streets (Pike Place, Boston, Philly) — paint pattern per surface |
| Sidewalks | `sidewalk=both/left/right/no/separate`, `footway=sidewalk` ways | city sidewalk inventories | 🟡 mapped sidewalks drawn; unmapped inferred from road class | honour `sidewalk=no` (rural roads, many suburbs) |
| Crosswalks | `highway=crossing` nodes + `crossing=marked/zebra/uncontrolled/traffic_signals`, `crossing:markings=*` | Mapillary detections | 🧪 painted at every junction arm | paint exactly the mapped ones, zebra vs two-line |
| Kerbs, ramps | `barrier=kerb`, `kerb=lowered/flush/raised`, `tactile_paving` | — | 🧪 painted kerb line | curb ramps at crossings |
| Traffic signals, stop & yield | `highway=traffic_signals/stop/give_way`, `stop=all` | Mapillary signs | ✅ junction control (`src/sim/traffic.ts`) | — |
| Traffic calming | `traffic_calming=bump/hump/table/chicane/island` | — | ❌ | cars slow; speed-table paint |
| Bike lanes & tracks | `cycleway=lane/track/shared_lane`, `cycleway:left/right`, `highway=cycleway` | city bike maps | 🟡 separate cycleways painted | lane paint on the carriageway |
| Bus stops & shelters | `highway=bus_stop` (+ `shelter`, `bench`), `public_transport=platform` | **GTFS stops** | ✅ poles/shelters | buses that stop there on the GTFS timetable |
| Tram / rail | `railway=tram/light_rail/rail/subway`, `railway=level_crossing`, `railway=subway_entrance` | GTFS, NTAD rail | ✅ track, wires, entrances | trains on the timetable |
| Bridges | `bridge=yes/viaduct/movable`, `layer`, `bridge:structure` | NBI (National Bridge Inventory, public) for type/length | ✅ decks | truss/arch/suspension looks from `bridge:structure` / NBI |
| **Tunnels** | `tunnel=yes/culvert`, `layer<0`, `location=underground` | — | ✅ **new**: nothing drawn above ground; cars dive in at the portal and out of sight | portal faces |
| Building passages & covered streets | `tunnel=building_passage`, `covered=yes` | — | ✅ kept at street level | an arch cut in the ground floor |
| Steps & ramps | `highway=steps` (+ `incline`, `step_count`), `ramp=yes` | — | 🟡 walkable ways | step geometry on slopes |
| Street lamps | `highway=street_lamp` (+ `lamp_mount`, `light:colour`) | Mapillary; city streetlight layers | 🧪 spaced along kerbs | mapped poles first, spacing fill after |
| Utility poles & wires | `power=pole/tower/line/minor_line`, `man_made=utility_pole` | — | ✅ lines; 🧪 street poles | mapped poles |
| Hydrants | `emergency=fire_hydrant` (+ `fire_hydrant:type`, `colour`) | city hydrant layers | ✅ | colours by city practice from the tag |
| Bollards, gates, barriers | `barrier=bollard/gate/lift_gate/jersey_barrier/block` | — | ❌ | props + collision |
| Street name signs | `name` at junctions | TIGER | ✅ junction signs | — |
| House numbers, mailboxes | `addr:housenumber`, `addr:street` | OpenAddresses, NAD | 🟡 OSM only | number plaques on doors everywhere |

### 2.2 Parking

| Feature | OSM tags | Other | Game today | Next |
|---|---|---|---|---|
| Surface lots | `amenity=parking` + `parking=surface` (areas), `parking_space=*`, `capacity`, `access` | NAIP / NLCD impervious (unmapped lots) | ✅ striped, filled with cars (`src/world/lots.ts`) | **find unmapped lots**: blank impervious ground next to shops → a lot |
| Garages / decks | `parking=multi-storey/underground/rooftop`, `building=parking` | — | 🟡 as buildings | open-sided deck look |
| Street parking | `parking:left/right/both`, `parking:*:orientation` (and the older `parking:lane:*`) | city curb inventories | ✅ kerb cars (`src/world/kerbCars.ts`) | meters from `vending=parking_tickets` |
| Driveways, alleys, aisles | `highway=service` + `service=driveway/alley/parking_aisle` | — | ✅ | — |
| Bike racks | `amenity=bicycle_parking` (+ `bicycle_parking=stands/wall_loops`, `capacity`) | city rack layers | ❌ | rack prop with a bike or two |
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
| **Playgrounds** | `leisure=playground` (area) + equipment nodes/ways `playground=swing/slide/climbingframe/sandpit/seesaw/springy/roundabout/structure` | 🟡 generic paint (+ procedural pieces) | each mapped piece where it is; kids on them by day |
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
| **Individual trees** | `natural=tree` (+ `species`, `genus`, `leaf_type`, `leaf_cycle`, `height`, `circumference`, `diameter_crown`) | **city tree inventories, OpenTrees**; LiDAR crowns | ✅ positions; 🟡 species by region mix | species from the tag / the city inventory → the right foundry family per tree |
| Tree rows, hedges | `natural=tree_row`, `barrier=hedge` | — | ❌ / 🟡 | rows along the line; clipped hedges |
| Flower beds, planters | `landuse=flowerbed`, `man_made=planter` | — | ❌ | — |
| Farmland, orchards, vineyards | `landuse=farmland/orchard/vineyard/farmyard`, `crop=*` | USDA Cropland Data Layer (public, 30 m, yearly) | ✅ farmland | crop by field from the CDL |
| Cemeteries | `landuse=cemetery`, `amenity=grave_yard` | — | ✅ lawn | headstone rows |

### 2.5 Water

| Feature | OSM tags | Other | Game today | Next |
|---|---|---|---|---|
| Sea, bays, lakes, ponds | `natural=coastline`, `natural=water` + `water=*` | NHD waterbodies | ✅ | depth colour from NOAA charts / CUDEM |
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
| Markets | `amenity=marketplace` (area/building) | — | ❌ | stalls with awnings along the frontage |
| Schools, hospitals, stations | `amenity=school/hospital/…`, `railway=station` | NCES school locations (public) | 🟡 | school zones: crossing guards, buses at 3 pm |

### 2.7 Street furniture and small things

`amenity=bench` ✅ · `amenity=waste_basket` ❌ · `amenity=recycling` ❌ · `amenity=post_box` ❌ ·
`amenity=telephone` ❌ · `amenity=vending_machine` (+ `vending=parking_tickets` meters) ❌ ·
`amenity=drinking_water` ❌ · `amenity=toilets` ❌ · `amenity=clock` ❌ · `man_made=flagpole` ❌ ·
`advertising=billboard/column/board` ❌ · `man_made=street_cabinet` ❌ · `man_made=manhole` ❌ ·
`tourism=information` (+ `information=board/map`) ❌ · `tourism=artwork` / `historic=memorial` ❌ ·
`amenity=bicycle_rental` (**GBFS** docks) ❌ · `emergency=phone` ❌ · `highway=street_lamp` ❌ ·
`barrier=bollard` ❌. All are single nodes: one Overpass line each, one foundry prop each — the
cheapest big win for "a street that feels mapped".

### 2.8 People, traffic and time

| What | Source | Use |
|---|---|---|
| How busy a road is | **HPMS AADT** (major roads), OSM road class otherwise | car density per street, rush hours |
| Transit | **GTFS** | buses/trams/ferries on real routes and times; crowds at stops before arrivals |
| Who lives/works here | **Census blocks, ACS, LODES** | sidewalk crowds by hour: downtown fills 9–5, residential streets in the evening; kids near schools after 3 pm; age mix for walkers |
| Shops open | OSM `opening_hours` | lit interiors, shoppers in doorways only when open |
| Weather | Open-Meteo / NWS | rain in Seattle when it's raining in Seattle (opt-in) |
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

1. **Street furniture nodes** (§2.7) and **mapped crossings / lamps** — one query line and one
   foundry prop each; streets immediately read as surveyed.
2. **Pitches by sport + playground equipment** (§2.3) — the courts and diamonds in every park.
3. **Street-tree species** (OSM `species`/`genus`, then city inventories) — trees stop looking
   the same.
4. **Unmapped parking lots from imagery/impervious** (backlog R.4).
5. **GTFS buses and trams** — transit that runs.
6. **Overture footprints + Places** — the gaps in OSM filled.
7. **The offline cell pipeline** (§4) — no more waiting on Overpass.
