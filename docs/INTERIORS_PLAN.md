# Interiors v2 — rooms, cores and towers that scale with the map

Status: The kitchen and the table (review round 11: a whole kitchen, chairs spaced by the table, a WC's door shut) built 2026-10-01 — §5, before Slice 5. Slice 1 (rooms, not halls) built 2026-09-29 — `src/world/interior/{plan,layout,mesh,furnish}.ts`, tests `interiorLayout` and `interiorBudget`; results under the table in §1. Slice 3 (towers) built 2026-09-29 — `player/lift.ts`, `ui/lift.ts`, test `interiorTower`; results under Slice 3 in §5. The front door opens on a home (review round 10, must-fix 4: cottages open into their living room, halls show their stair and living room, the way in dressed, skirting, real sun pools) built 2026-10-01 — §5, before Slice 5. Slices 2, 4 and 5 planned (backlog R.31). Written 2026-09-28 from a read of `interiors.ts`, `buildings.ts`, `realTile.ts` and the numbers below.

Goal: real room scale and variety in every building, bungalow to 40-storey tower, derived from the map data we carry, on a phone budget.

## 1. Where today falls short

Measured by [`tools/bench-interiors.mts`](../tools/bench-interiors.mts) (`planInterior` + `Interiors.buildGen` on synthetic rectangles; Node 22, warm JIT; mid-range phones are roughly 2–4× slower):

| Footprint | Storeys built/real | Rooms per storey | Largest room | Vertices (MB) | Worst build step |
|---|---|---|---|---|---|
| House 12×8 m, 2 storeys | 2/2 | 1 | 96 m² | 41k (3.1) | 37 ms |
| Houses 9×7, 12×8 m (40 door spots each) | – | 1 in 80/80 | 63–96 m² | – | – |
| Apartments 45×16 m, 19.5 m | 4/6 | 5 | 195 m² | 340k (26) | 69 ms |
| Office 60×30 m, 31 m | 4/8 | 6 | 460 m² | 345k (26) | 75 ms |
| Tower 40×40 m, 150 m | 4/39 | 4 | 596 m² | 286k (22) | 57 ms |
| Untagged "hotel" 60×18 m | 4/7 | 3 (as a restaurant) | 449 m² | 370k (28) | 210 ms |
| Supermarket 60×40 m | 1/1 | 1 | 2,400 m² | 1.11 M (84) | 1,198 ms |

After Slice 1 (the same bench, 2026-09-29; the worst step is now CPU time, the median of five builds after a warm-up — the activation's layout, collision and mesh all as pump steps; the old code measured that way: 47–74 ms for the house, apartments, office and tower, 267 ms for the "hotel", 1,243 ms for the supermarket, in 2–3 draws):

| Footprint | Rooms per storey | Largest room | Vertices (MB) | Draws | Worst step |
|---|---|---|---|---|---|
| House 12×8 m, 2 storeys | 5, 4 (+ hall, landing) | 34 m² | 30k (2.3) | 17 | 1.0 ms |
| Houses 9–16 × 7–10 m (40 door spots each) | 3–6 in 320/320 | – | – | – | – |
| Apartments 45×16 m, 19.5 m | 39–41 (10–11 flats) | 33 m² | 60k (4.6) | 41 | 1.2 ms |
| Office 60×30 m, 31 m | 11–12 + open plan, 839 desks | 24 m² | 20k (1.5) | 19 | 0.9 ms |
| Tower 40×40 m, 150 m | 9–10 + open plan, 914 desks | 30 m² | 19k (1.4) | 19 | 0.9 ms |
| Untagged "hotel" 60×18 m | a shop, then 61 (flats) | 40 m² | 65k (4.9) | 47 | 0.9 ms |
| Supermarket 60×40 m | sales floor + 6 back rooms | 79 m² | 12k (0.9) | 12 | 0.8 ms |

Causes (`interiors.ts` line numbers unless noted):

1. **Full-depth slabs.** Partitions are only cross walls at a `u` position (`Plan.parts`, l.25, 153–178): no lengthwise walls, corridors, cores or units, so rooms are 16–40 m deep.
2. **Caps.** `bays ≤ 7` (l.163). The paint lookup allows 6 cuts and `uRoomA/B[56]` (8 storeys × 7 rooms; l.280–284, 1530–1539). Storeys stop at 4 (l.113), and the HUD calls storey 4 the "top floor" (`main.ts` l.824).
3. **Identical storeys.** Partitions repeat on every level (l.192–196, 641–655). `large` slabs cycle living, bedroom and kitchen (l.711), which yields a 9×16 m "bedroom".
4. **Stairs crowd out house walls.** Cross walls must clear the 4.7 m straight stair (0.31 m goings, l.118) by 1.2 m and the door by 1.3 m (l.168): every 9–12 m two-storey house tested gets one room per storey (14–16 m houses: 70%).
5. **Furniture is capped per building.** 12 desk pods per building (l.927, 1270) plus 3 wall desks per room ≈ 1 desk per 60 m², where real offices have one per 8–10 m². Gondolas have no cross aisles (l.1099–1109).
6. **Cost.** `piece()` copies each foundry part per vertex into one non-indexed mesh (l.838–847); furniture is 95–99% of vertices. Yielding once per room (l.929) gives the 3.5 ms pump (l.405) 37–1,198 ms steps.
7. **Facade and interior disagree.** The siding code is dropped (l.490–492), so curtain walls get punched windows; spandrels repeat every 3.9 m (`buildings.ts` l.1845) against 3.8 m storeys; sun pools assume 2.7 m house windows (l.1648–1664).
8. **Data lost.** `building=*` collapses to six kinds (`realTile.ts` l.770–776), and `tourism=hotel` is ignored (l.604–607). `Footprint` (`buildings.ts` l.1449) drops `fl`, `at`, siding and `building:part` tiers.
9. **Lens.** 62° vertical FOV (`controller.ts` l.5) ≈ a 20 mm real-estate wide angle, which inflates rooms.

## 2. Target proportions

**Homes**

| Item | Value | Source |
|---|---|---|
| Storey | 2.9 m; ceiling ≥ 2.3 m (use 2.6–2.7) | [NDSS](https://assets.publishing.service.gov.uk/media/6123c60e8fa8f53dd1f9b04d/160519_Nationally_Described_Space_Standard.pdf) |
| Stair | riser ≤ 0.196 m; going ≥ 0.254 m (use 0.26); width ≥ 0.914 m; headroom ≥ 2.03 m. Straight run 3.6 m; L or dogleg fits 2.0 × 2.9 m | [IRC R311.7](https://timnath.org/wp-content/uploads/2022/03/2018-RESIDENTIAL-STAIR-GUIDE.pdf) |
| Living | 17 m² (new UK), 20–30 m² (semi), > 30 m² (detached); width ≥ 3.0–3.5 m. Kitchen-living-dining 23–29 m² | [Homebuilding](https://www.homebuilding.co.uk/advice/average-living-room-size), [LPG](https://www.london.gov.uk/sites/default/files/2023-06/Housing%20design%20standards%20LPG.pdf) |
| Bedrooms | double ≥ 11.5 m², ≥ 2.75 m wide; single ≥ 7.5 m², ≥ 2.15 m wide; US primary 21 m², secondary 11 m² | NDSS, [HomeGuide](https://homeguide.com/articles/average-bedroom-size) |
| Bedroom count | largest b with NDSS area(b bedrooms, b+1 people, storeys) ≤ GIA ÷ f; f = 1.8 in North America (21 ÷ 11.5), 1.15 elsewhere | NDSS |
| Row house | 4.9–7.6 m wide; ≥ 6.7 m for rooms side by side | [APA PAS 164](https://www.planning.org/pas/reports/report164.htm) |

**Apartments**

| Item | Value | Source |
|---|---|---|
| Storey | 3.1 m; ceiling ≥ 2.5 m; ground floor ≥ 3.5 m | [CTBUH](https://allaboutconstruction.blogspot.com/2013/10/how-does-height-of-building-calculated.html), LPG |
| Corridor | 1.5 m; 1.8 m when a core serves more than 8 homes | LPG B2.1, B2.5 |
| Room depth | ≤ 9.1 m from a window | [NYC BC 1205](https://danielinocente.com/insights/how-wide-should-an-apartment-building-be-understanding-residential-floor-plate-efficiency) |
| Units | US new build: studio 41 m², 2-bed 102, 3-bed 125. UK: 1b2p 50 m², 2b4p 70, 3b5p 86 | [RentCafe](https://www.rentcafe.com/blog/rental-market/market-snapshots/national-average-apartment-size-2024-2/), NDSS |
| Lift | car 2.14 × 1.53 m; lobby ≥ 2.1 m | [dimensions.com](https://www.dimensions.com/element/one-single-elevator-lift), [BCO](https://gt-website.files.svdcdn.com/production/publications/1906_BCO-Spec-Concertina.pdf) |

**Offices and towers**

| Item | Value | Source |
|---|---|---|
| Storey | office 3.9 m (the game uses 3.8), residential 3.1 m | CTBUH |
| Lobby | office 2 storeys (7.8 m), residential 1.5 storeys (4.65 m) | CTBUH |
| Plant floors | every 20 storeys (office), 30 (residential); Hong Kong refuge floors every 20–25 | CTBUH, [IAFSS](https://publications.iafss.org/publications/fss/5/737/view/fss_5-737.pdf) |
| Window to core | 6–13.5 m; ceiling 2.6–2.8 m; 1.5 m grid | BCO 2019 |
| Core | 24–26% of gross floor area (range 12–36%); floor efficiency 85% at 10 storeys, 70% at 50 | [MDPI](https://www.mdpi.com/2075-5309/14/11/3345), [Skyline](https://buildingtheskyline.org/skyscraper-technology-3/) |
| Density | 8–10 m² per desk; main routes 1.5 m; a 4–6-person meeting room ≈ 3 × 3 m | BCO, [DesigningBuildings](https://www.designingbuildings.co.uk/wiki/Office_space_planning), [RoomSketcher](https://www.roomsketcher.com/blog/space-and-circulation-in-your-office-layout/) |
| Lifts | 8-car bank 10.9 × 8.5 m; 3.7 m between facing banks; sky lobbies in 90–110-storey towers (Willis 33/66, One WTC 64) | [dimensions.com](https://www.dimensions.com/element/eight-lift-elevator-bank-layout), [Wikipedia](https://en.wikipedia.org/wiki/Sky_lobby) |
| Core stair | riser ≤ 0.178 m; tread ≥ 0.279 m | [IBC 1011.5.2](https://codes.iccsafe.org/s/IBC2018/chapter-10-means-of-egress/IBC2018-Ch10-Sec1011.5.2) |

**Other types**

| Type | Value | Source |
|---|---|---|
| Supermarket | main aisles 2.4–3.0 m, secondary 1.5–1.8 m; shelves 0.30–0.45 m deep per side | [wzrack](https://wzrack.com/grocery-store-aisle-dimensions-how-wide-should-your-aisles-be/) |
| Restaurant | 1.1–1.4 m² per seat; kitchen 30–40% of the floor; bar zone 4.3 m deep | [Webstaurant](https://www.webstaurantstore.com/article/118/dining-room-design.html), [RestaurantHQ](https://www.therestauranthq.com/restaurants/restaurant-floor-plan/) |
| Hotel | room 25–35 m²; 4.0 m bay; 1.8 m corridor; guest rooms 65–75% of gross area | [FacilityPlanning](https://facilityplanning.wordpress.com/2011/04/16/hotel-design-and-space-allocation/), [ADA](https://archive.ada.gov/archive/NPRM2008/longdesc/plan1aaccessible.html) |
| School | classroom 50–62 m² per 30 pupils; corridor ≥ 1.8 m; hall 120–140 m² | [BB103](https://dera.ioe.ac.uk/id/eprint/20283/1/BB103_Area_Guidelines_for_Mainstream_Schools_FINAL_23_4_14.pdf) |
| Church | 1.4–1.6 m² per person; pew pitch 0.91 m; centre aisle 1.5 m | [Lifeway](https://s3.amazonaws.com/mychurchwebsite/c391/rules_of_thumb.pdf) |

## 3. The procedural approach

Planning is **two pure stages**, each a function of (footprint, door, seed):

- **Stage A, shell** (tile worker, every enterable building): archetype, storeys, core, stairs, spines, voids — all collision needs; ≤ 2 KB at today's 0.17–1.2 ms.
- **Stage B, layout** (on activation, build-window storeys only): units, rooms, doors, furniture; its walls enter an interior-owned `WalkWorld` scope first.

**Archetype**, taken from the best source available:

1. OSM [Simple Indoor Tagging](https://wiki.openstreetmap.org/wiki/Simple_Indoor_Tagging) rooms, used as they are.
2. A new `bt` field from `building`, `tourism` or `amenity` (hotel, school, office, supermarket…).
3. `use` and `gf` for the ground floor.
4. Priors: house ≤ 3 storeys and ≤ 250 m²; row if `at`; walk-up ≤ 5 storeys and ≤ 600 m² (US single-stair limit 4, Europe ~10: [Niskanen](https://www.niskanencenter.org/how-to-build-more-family-sized-apartments/)); slab 12–24 m deep; tower ≥ 12 storeys; big box one storey ≥ 1,500 m².

**Storeys.** n = floor((top − floor0) ÷ fH) with the facade's fH, so every window row is a floor; no cap. Where `fl` is mapped, Slice 2 sets fH = (top − floor0) ÷ `fl` for facade and plan alike.

- Plant floors every 20 (office) or 30 (residential) storeys; lifts skip them.
- Offices of 6 storeys or more get a double-height lobby: a level-1 `Hole` plus a slab cut.

**Cores.** Split the plate into rectangular wings (spans every 0.5 m, merged within 0.6 m); clip rooms to the outline; curved or >40-vertex outlines use today's planner.

- **House:** a straight, L or dogleg stair off the hall, 1–4 m from the door; on a party wall in row houses.
- **Walk-up:** a 5 × 5.5 m point core: a dogleg stair, plus a 2.1 × 2.4 m lift from 4 storeys.
- **Slab:** cores ≤ 60 m apart and within 8 m of each end.
- **Tower or deep plate (D > 24 m):** the bounding box inset by the lease depth (12 m office, 9 m residential).
  - Clamp to 18–30% of the plate, and to at least 8 × 10.9 m above 20 storeys; slim plates get a side core.
  - Lift cars = clamp(round(gross area ÷ 4,000 m²), 2, 24), in banks of up to 8.
- **Big box and food:** a rear back-of-house strip, 20–25% of the plate (retail) or 30–40% (kitchen).

**Spines, by wing depth D:**

| D | Loading | Corridor |
|---|---|---|
| ≤ 9.1 m | none; a hall runs door → stair | 1.0–1.2 m |
| 9.1–14 m | single-loaded on the least-exposed side | 1.2–1.5 m |
| 14–24 m | double-loaded on the centreline | 1.5 residential, 1.8 hotel, 2.4 school |
| > 24 m | ring round the core; offices are open plan to the glass | 1.5–1.8 m |

**Subdivision:**

- **Walls only on window-cell boundaries.** Invert the facade's `nWin = floor((len − 0.6)/spacing)` with spacing 2.7 m (house), 2.2 m (`large`), 3.4 m (shop) or 1.5 m (curtain wall).
- **Units:** a seeded mix fills each strip — slab studio 5.0 m, 1-bed 7.2 m, 2-bed 10.5 m; hotel room 4.0 m; classroom 7.2 m; cellular office 3.0 m — snapped to cells within ±0.6 m; corners take the largest.
- **Rooms:** guillotine recursion over a program of type, minimum, target area, zone and wet/dry:
  1. Peel a 2.4–2.8 m inboard strip for hall, bath and kitchen, so wet rooms stack.
  2. Split the facade side at cells, seeded toward the targets.
  3. Reject rooms under the NDSS/LPG minimums or over 1.6× target; drop the lowest-priority room and retry.
- **Doors:** 0.9 m into units, 0.8 m inside them, ≥ 0.3 m from corners.

**Worked examples.**

- **45×16 m slab:** units 7.25 m deep; studio 36 m², 1-bed 52, 2-bed 76 (NDSS 50/70); largest room 23–36 m² (today 195).
- **60×30 m office:** 36 × 9 m core (18%), 10.5 m to the glass, ~115 desks a floor (today ~110 in the whole 4-storey building).
- **12×8 m North American house:** 4 bedrooms.

**Room types:**

| Archetype | Entrance storey | Typical storey |
|---|---|---|
| house / row | hall, living, kitchen-dining, WC | bedrooms, bath; attic room if dormers |
| walk-up / slab | lobby (mail, lift) + units, or shops (`gf`) | ≤ 8 units per core; penthouse on top |
| office tower | lobby (desk, turnstiles, lifts), café if `use` | 60–80% open plan; meeting rooms inboard |
| hotel / school | lobby and bar / hall and office | rooms on 1.8 m / classrooms on 2.4 m corridors |

**Variety.** Seeds chain building → storey → unit → room, so units stay independent. Seeded: stair type, corridor side, unit mix, open or closed kitchen, office fit-out (1 floor in 10 vacant), `activeStyle()` palettes, `variantAt` pieces. Typical floors share walls, not furnishing.

**Furniture and rendering:**

- **Placement:** slot rules at §2 densities (beds on a solid wall away from the door, desks within 6 m of glass, kitchens inboard); new pieces are foundry families budgeted in `foundry.test.ts`.
- **Instancing:** pieces quantized to 0.1 m, tinted via `instanceColor`, cached, one `InstancedMesh` per key (`worldMat()` already instances).
- **Shell:** merged per storey. A per-vertex `aRoom` replaces `uRoomA/B` and `uCuts`, which lifts the 8 × 7 cap.
- **Glazing:** real `kindS`, so curtain walls are glazed floor to ceiling.

**Towers, without building every floor:**

- **Collision (Stage A):** `levels = n`; core walls on every storey; the lobby void as a level-1 hole; shafts via a new `Floors.shafts` (one ring, all levels); `building:part` tiers bound each storey's plate.
- **Build window:** ≤ 3 storeys are built whole. Otherwise the walker's storey k is built in full and k ± 1 as shell and walls (seen through the shafts), with dark caps beyond; climbing builds k + 2.
- **Lobby:** 7.6 m high; security desk, 2–6 turnstiles, lift banks 3.7 m apart, directory, seating.
- **Elevators:** doors with a call button and indicator; 2.14 × 1.53 m cars. E opens a floor chooser (▲▼, plant floors skipped); the doors close and the screen fades (1.1 s); the feet move by (target − k) × fH; Stage B builds under the fade, held until walls exist (≤ 150 ms phone); the doors open.
- **Stairs:** dogleg or scissor, in a 2.6 × 5.5 m shaft.
- **Implied floors:** inside, the real city fills the windows; outside, the facade's interior mapping (`room()`, `buildings.ts` l.1583) gains office light rows. HUD: "floor 23 of 39".

## 4. Performance budget

| Metric | Today | Budget |
|---|---|---|
| Unique vertices per interior | 41k–370k (1.11 M supermarket) | ≤ 120k; houses ≤ 40k |
| Draw calls / instances | 3 / ≤ 12 residents | ≤ 60 / ≤ 2,000 |
| GPU attributes (76 B per vertex) | 3–28 MB (84 MB) | ≤ 12 MB |
| Build memory | `number[]`, 152 B per vertex | `Float32Array` chunks, 76 B per vertex |
| Largest build step | 37–210 ms (1,198 ms) | ≤ 1 ms desktop (yield every ~25 placements) |
| Visible walls ready | after the full build, 58–1,414 ms | ≤ 40 ms desktop, ≤ 150 ms phone (collision first); furniture ≤ 1.5 s later |
| Stage A per building | 0.17–1.2 ms | ≤ 0.2 ms house, ≤ 1.5 ms large |
| Storeys built | all (≤ 4) | ≤ 3 |
| Piece geometry | rebuilt per interior | 64-key LRU (~100k vertices), shared |

Instanced: furniture, residents, lift doors; merged: shell, partitions, stairs. The pump follows auto-quality (3.5 ms, then 2 ms).

## 5. Phased plan

**Slice 1 — Rooms, not halls (the biggest visible win).** Houses get a hall and 3–5 rooms per storey; big plates get corridors, units and real-size rooms — at lower cost than today.

- **Files:** new `src/world/interior/{shell,layout,programs,furnish,mesh}.ts`; `tileBuild.ts` (`planShell`), `pack.ts`, `stream.ts`; `decor.ts` (piece keys, desk pod, meeting set); `interiors.ts` (instancing, `aRoom`, scope, cache-safe dispose).
- **Data:** `Shell` (today's `Plan` + `arch`, `n`, `core`, `spines`, `voids`); `Layout {rooms, walls}`; `Room {rect, type, unit, level, doors, paint}`; `WallSeg {a, b, gaps, level}`; `PieceInstance {key, m4, rgb}`.
- **Tests** (rewrite "big floorplates"; add `interiorLayout.test.ts`, and `interiorBudget.test.ts` from the bench):
  - slab: corridor ≥ 1.5 m, rooms ≤ 38 m², every room reachable through doors and walkable with `walkLine`;
  - office: core 15–30%, desks ≤ 13.5 m from glass, ≥ 1 desk per 12 m²;
  - houses 9–16 × 7–10 m at 40 door spots: ≥ 3 rooms per storey in ≥ 90%, bedrooms ≥ 7.5 m² and ≥ 2.15 m wide;
  - all: risers ≤ 0.196 m, deterministic, no wall on a window cell, ≤ 120k vertices, ≤ 60 draws, largest step ≤ 8 ms in Node.
- **Visual:** a `place-shots.js` helper, `insideArch(arch)`, shoots door, corridor and a room of the nearest house (Sea Bright spawn), apartment block, office and supermarket; compare with 6 real photos per type, framed alike at 1.6 m eye height, anchored on the 2.1 m door, 0.9 m counter, 0.75 m desk, 2.6–2.7 m ceiling.

**Slice 2 — Data in, archetypes out.**

- **Files:** `realTile.ts` (`bt`; indoor-tagging rooms in the Overpass query), `bake.mjs` in sync, `data.ts`, `buildings.ts` (`Footprint` gains `bt`, `fl`, `sid`, an `exposed` edge mask from the `solid` probes, and `tiers`; per-building fH reaches the facade shader). Bump the worker's `t/vN` with the client's `&v=N` together (AGENTS.md rule 10; 22 today).
- **Tests:** `tourism=hotel` → hotel; tiers attach to owners; attached houses flag party edges; a classifier table; an indoor-tagging fixture reproduces its layout.
- **Visual:** rowhouses in South Philadelphia (`?at=39.9265,-75.1660`) and Park Slope (`?at=40.6710,-73.9814`) — stair on the party wall, no windows there; a hotel corridor.

**Slice 3 — Towers.**

- **Files:** `interiors.ts` (build window, lifts); `collision.ts` (`Floors.shafts`); `controller.ts`, `main.ts` (lift key, fade, HUD); `buildings.ts` (curtain fH = `windowAt` fH, office facade); `decor.ts` (lift doors, turnstile, desk).
- **Tests** (40×40 m, 150 m tower): n = 39 with lobby and shaft holes; lift 0 → 23 lands feet at floor0 + 23 × fH; stair 23 → 24 walkable; ≤ 3 storeys, ≤ 120k vertices built; on a 60×60 m, 20 m podium, storey 10 has no floor outside the tower.
- **Visual:** Midtown (`?at=40.7536,-73.9832`) and the Loop (`?at=41.8789,-87.6359`): lobby, lift lobby, floor 20, stair shaft, and night.
- **Built 2026-09-29** (`interior/{plan,layout,mesh,furnish}.ts`, `interiors.ts`, `player/{collision,controller,lift}.ts`, `ui/lift.ts`, `main.ts`, `buildings.ts`, `decor.ts`; `tests/interiorTower.test.ts`):
  - **Storeys:** every one exists, n from the facade's fH (the 40×40 m, 150 m tower: 39); tall (≥ 5 storeys, or > 12,000 m² of floor) builds a window of ≤ 3 round the walker. Stage A stays one storey's worth: the stair is one stacked dogleg (`rep`), the tower's plan ≤ 2 KB.
  - **Cores and lifts:** an office tower's lift bank across its core's end nearer the door (a 3.2 m lift lobby open to the floor at both ends, the dogleg beyond; cars = clamp(round(gross ÷ 4,000 m²), 2, 8)); a block's lift beside its core stair; on an open plan (a ragged outline) a free-standing shaft 1.2 m clear of the facade. Offices of ≥ 6 storeys: a double-height lobby (a storey-1 hole from the door's wall to a 1.6 m gallery along the core, a rail round it, pendants).
  - **Podiums:** `Footprint.tiers` (lifted building parts, derived in `buildBuildings` — no TileJson change) → `Plan.plates`; `Floors.tiers` keeps a tier's storeys inside its outline, which is walled from its first storey up.
  - **The ride** is a real one rather than the fade (§6 left it open): the car's doors slide open, you step in and turn round, they shut, the display counts the floors while your feet go to floor0 + k × fH and the window re-centres there, the doors open, you step out (~6–8 s). L, not E (E is get in/out).
  - **Seeds by storey:** layout, paint, furniture and residents per storey, so re-centring on the stairs changes nothing you can see.
  - **Facade:** curtain slabs at `windowAt`'s fH; tall commercial blocks and curtain walls map offices behind the glass (ceiling light rows, desks, screens), lit floor by floor at night.
  - **Numbers** (`tools/bench-interiors.mts`, Node 22, CPU time, with another browser on the machine; a build is ≤ 3 storeys):

    | Case | Storeys built | Vertices | Draws | Worst step | Stage A |
    |---|---|---|---|---|---|
    | Tower 40×40 m, 150 m, at the door | 0–1 of 39 | 15.7k | 22 | 0.8 ms | 0.05 ms, 2.0 KB |
    | … on floor 24 | 22–24 | 14.9k | 18 | 0.6 ms | |
    | Flats tower 30×30 m, 90 m, floor 21 | 19–21 of 28 | 53.3k | 42 | 1.3 ms | 0.3 ms, 1.9 KB |
    | Podium 60×60 m + tower to 150 m, floor 11 | 9–11 of 39 | 12.1k | 16 | 1.1 ms | 0.4 ms, 2.5 KB |
    | Apartments 45×16 m (6 storeys: now tall) | 0–1 | 48.4k | 42 | 1.9 ms | 0.3 ms |
    | Office 60×30 m (8 storeys, atrium) | 0–1 | 16.2k | 21 | 1.6 ms | 0.1 ms |

    A ride's window builds under the car's shut doors (the pump at 14 ms a frame then); walking the stairs, it builds at 3.5 ms a frame behind the standing one and swaps in whole.
  - **Visual:** the container reaches neither Overpass nor the tile service, and the offline stand-ins are one to three storeys, so the check ran on a stand-in district of towers served as real-lite tiles through the whole pipeline (`scratch/tow/midtown-tiles.mjs`, `?at=40.7536,-73.9832&tiles=…`): lobby, the lift's doors on the car, riding, floor 20, the stair, the mezzanine, night inside and out, a glass tower's floor, the podium tower.
  - **Not done:** plant floors (and the lift skipping them), sky lobbies, scissor stairs; a lift in a 5–7-storey block over shops (a walk-up); the Loop shots; real-data shots.

**Slice 4 — Deeper archetypes.**

- **Files:** `furnish.ts` recipes; `decor.ts` families (gondola, checkout, cooler, hotel set, classroom, pews), each budgeted.
- **Tests:** supermarket aisles ≥ 1.5 m, a cross aisle every ≤ 15 m, checkouts at the door, 20–25% back of house, ≤ 90k vertices; restaurant kitchen 30–40%; 60×18 m hotel ≥ 24 rooms of 25–35 m² per storey; classrooms 50–65 m².
- **Visual:** a supermarket, hotel corridor, classroom and church.
- **Built 2026-10-01** (`uses.ts` `placeOf`; `interior/{plan,layout,furnish,mesh}.ts`; `decor.ts`; `tests/interiorArch.test.ts`, `interiorBudget.test.ts`, `foundry.test.ts`):
  - **What a building is:** its tag first (supermarket, hotel, school, library, bank, post office, pharmacy, gym), else its name in several languages; a mosque by name. Families `market`, `hotel`, `school`; a library, bank, post office, gym or pharmacy furnishes its shop floor (a big one: an office core round its hall); `P.place`, `P.pub` (a storefront's ground storey as a public floor under corridor storeys).
  - **Back of house:** `backStrip` — at the depth that makes the share (20–25% a supermarket's, 30–40% a restaurant's kitchen); the partition meets no facade across the middle and jogs at each side wall to its pier, the corner between a back room (a staff room, receiving, a WC). A storefront's side walls are glass between narrow piers, so a straight partition could only land a cell's depth (3.4–5 m) either way.
  - **Corridor rooms:** `bandCuts` chooses a band's party walls together (a DP on a 10 cm grid: rooms nearest the width wanted; out of range only where no pier allows better) — the greedy pick landed a wall on a pier's far edge and the next room had nowhere to end (a 60×18 m hotel's back band: 13 of 31 rooms too narrow for a bathroom).
  - **Fixtures** (`Layout.fix`): checkouts at the door, produce, gondola runs with 1.8 m aisles and cross aisles every 13.75 m, the cold cases along the back partition; pews and an altar. Numbers (60×40 m supermarket): 6 checkouts, 42 runs, 10 cold cases, 22.5% back of house, 27k vertices. 60×18 m hotel: 27–31 rooms of 25–35 m² a storey, each with its bathroom. Classrooms 51–64 m².
  - **Not done:** a chancel's dais (`Layout.dais`: the type is there, nothing raises it yet); the qibla from the real bearing (the mihrab is on the wall opposite the door); `tourism=hotel` and `leisure=*` in the tile's use tag (a cache bump: names find them meanwhile); a five-storey block's lift where its core slot has no pier for the shaft's wall.

**The front door opens on a home (review round 10, must-fix 4).** The reviewer: "every front door opens on nothing" — a bare peach hall, a coat rail that read as two cabinet doors, no stair, no lit lamp, no skirting, and "morning sun" in a hall with no window.

- **Built 2026-10-01** (`interior/{plan,layout,furnish,mesh,views}.ts`, `interiors.ts`, `decor.ts`, `tools/review-shots.js` pose 19; tests `interiorLayout` (`tests/helpers/homes.ts`), `interiorBudget` "the way in", `foundry`):
  - **Cottages** (`COTTAGE` ≤ 110 m² a storey — the shore's: 27% of its 32,275 houses): no hall. The strip from the front door is the living room, 3.2 m or more beside its stair, the kitchen at its back in the same space (one great room under 6.4 m deep), bedrooms and the bathroom off it; the stair up an inside wall; upstairs the landing is the stair's lane and a passage. Real-world sizing (§2): living rooms 17–30 m², width ≥ 3.0–3.5 m.
  - **Bigger houses** keep the hall: the stair's foot ≤ 40° off the door's axis (and ≤ 5 m away), the living room off the passage side through a 1.2–1.6 m cased opening within 30° of the axis.
  - **The way in:** a bordered runner, the console with its lamp lit and a mirror over it, coats on a rail (3–4 turned coats, 0.9–1.1 m), skirting (12 cm, trim white) round every room — one stretched instanced piece, so it costs one draw however many rooms — and ceiling domes lit after dark in rooms with windows, all day in rooms without.
  - **Sun pools** through the facade's real window cells and only in the room the light comes in by.
  - **The view in:** in the room the front door opens on, the armchair and the big plant keep off the line from the door to the far end (an armchair's back had hidden the kitchen table).
  - **Pose 19** (`views.ts` `sunniest`, `sunRoomView`): the room with the most east-to-south glass of the 'inside' house and its 24 nearest (a living room before a bedroom when they tie), framed where the most of the real sun's light on its floor is in the lens while no bare floor or wall takes over about a quarter of the frame — not standing in its furniture, not looking over a sofa back. On the review's own street (tile 0_-1 built in Node, frame 6's cottage and its neighbours): a dining room with 5 m² of that glass, sunlit floor ≈ 4.5% of the frame, the floor 28%, the biggest wall 21%.
  - **Frames 6 and 19** (the review's measures; an id pass of the frame in the browser, swiftshader, 960×540): frame 6, the cottage 0_-1:61 2.2 m in from its door — 8 furnishing pieces each ≥ 0.15% of the frame, the largest bare plane 16% (before the view-in change; the same frame cast as rays in Node after it: 10 pieces, 15.3%); 6 vs 19 mean ΔE76 25.2. Frame 19 shot from the earlier pose (a bedroom's single window): sunlit floor 0.9% — what the pose above was rebuilt for.
  - **Numbers** (seeded cases in `tests/helpers/homes.ts`): of 40 cottages, 40 open into the living room or great room (before: 0, all into a hall); of 40 houses over 150 m², 40 have the stair's foot in the door's view (before: 37) and 40 the living room's cased opening (≥ 1.2 m) within 30° of the door's axis (before: 0 — a 0.9 m door; 38 until a WC along the passage was kept from taking the hall's wall where that opening goes). Vertices (the bench's synthetic cases, before → after; budgets 40k a house, 120k a block): house 12×8 m 30.3k → 28.4k, 16×10 m three storeys 31.5k → 34.4k, the review's 11.1×7.7 m cottage 22.0k → 21.3k; flats 120×40 m 84.6k → 112.5k, shop + flats 80×40 m 67.0k → 87.1k (the skirting and the two ceiling domes take instancing slots, so more of a block's rarer pieces fall past the 44-draw cap and are baked: at a cap of 47 the flats are 97.1k in 49 draws, at 64 85.2k in 57 — the lever to pull should a block near 120k).

**The kitchen and the table (review round 11, "small fakes" 6).** The reviewer, frames 6 and 19: "the kitchen in view is a sink run, with no range, fridge or wall cabinets"; "three chairs crowd one side of the table, backs touching"; "a WC is in view through the living room's left door".

- **Built 2026-10-01** (`decor.ts` `kitchen`/`stove`/`fridge`, `interior/furnish.ts` `planKitchen`/`runLayouts`/`placesAlong`, `interior/mesh.ts` `LeafSpot.shut`, `interiors.ts` `swingDoors`; tests `interiorHome`, `foundry`, `interiorBudget`):
  - **The kitchen** is one piece along a wall (`KitchenSpec`): base units and the worktop, the sink under the window where the run passes one, a range set in with its chimney hood, the fridge at an end with a cabinet over it, wall cabinets wherever the wall above is solid (a low upstand under a window). The cooker and the fridge stand only on solid wall. `planKitchen` scores every wall stretch and length by what the run then holds (`runLayouts`, in the run's own x round its windows, memoized — so it stays well inside the 8 ms step); what it can't hold goes on a wall of its own round the corner (an L), else the living room's kitchen end. Real-world sizing: a 60 cm cooker and sink module, a 72 cm fridge, wall cabinets 72 cm tall from 1.45 m, ≥ 30 cm of worktop beside the cooker where the wall allows.
  - **Numbers** (`tests/interiorHome.test.ts`, the 40 cottages and 40 houses over 150 m² of `tests/helpers/homes.ts`, a 12 × 8 m house and an 18 × 8 m walk-up — 82 kitchens): 80 have a cooker under its hood, a fridge and ≥ 0.6 m of wall cabinets (the test asks ≥ 95%; before: a full run only where a wall between windows took it, else a sink run under a window alone); 79 hold both the cooker and the fridge in the run; the other two have their cooker and cabinets but no wall left for a fridge (a two-storey cottage's kitchen between its stair and two doorways; the walk-up flat's, a doorway's swing and the stair's landing behind its wall). No hood or fridge in a window's stretch; the sink under the window in all 71 runs that pass one.
  - **The table** seats a place per ~0.7 m of edge, never under 0.6 m (`placesAlong`: two a side at 1.2–2.0 m — before, three on a 1.8 m table — three from 2.1 m) and the ends of a table of 1.4 m or longer where there's room behind the chair to draw it out; the table is placed with that room first. On the seeded homes' 83 dining tables: every place ≥ 0.6 m, no side of three, no two chairs within 0.5 m, 53 of the 57 long tables with both ends.
  - **The WC's door**: a WC's or a bathroom's door off a living room, great room, kitchen or dining room stands shut (it swings open into its room as you step up to it, and shuts behind you); every other leaf stands open. Of the 82 seeded homes, 49 such doors on the ground storey, all 49 shut.
  - **Vertices**: the kitchen piece is 1,260 vertices (the old run 720); a block's kitchens are a few instanced pieces (runs in 60 cm steps, a windowless run's fridge always on its left). `MAX_INSTANCED` 44 → 47: the 120 × 40 m flats 115.6k vertices in 50 draws (before this change 112.5k in 47; at 44 with the new kitchens 128k).

**Slice 5 — Light and lens.**

- **Changes:** sun pools from each room's real window cells; daylight from window distance, not `uDims`; lit corridors; a 55° indoor FOV (≈ 24 mm), A/B behind a flag.
- **Tests:** L-shaped plates.
- **Visual:** Slice 1's shots at 9:00, 13:00 and 19:30.

## 6. Risks and open questions

- **Worker cost:** Stage A must stay near 0.17 ms a house; tiles hold thousands.
- **Trapping:** activation walls must never shut in a teleported walker; re-door any wall within 0.4 m, then re-check `touching()`.
- **Slice 2 cache bump:** every real-lite tile gets fetched again.
- **One door per building:** mixed use needs a lobby door, which touches `pickDoorWall`, the collision gap and `uOpenDoor`.
- **Residents:** `NPC_MAX = 12` empties office floors.
- **Owner's calls:** fade or a real ride; the default floor; hero towers; who curates reference photos.
