# Interiors v2 — rooms, cores and towers that scale with the map

Status: planned, on the back burner (backlog R.31). Written 2026-09-28 from a read of `interiors.ts`, `buildings.ts`, `realTile.ts` and the numbers below.

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

**Slice 4 — Deeper archetypes.**

- **Files:** `furnish.ts` recipes; `decor.ts` families (gondola, checkout, cooler, hotel set, classroom, pews), each budgeted.
- **Tests:** supermarket aisles ≥ 1.5 m, a cross aisle every ≤ 15 m, checkouts at the door, 20–25% back of house, ≤ 90k vertices; restaurant kitchen 30–40%; 60×18 m hotel ≥ 24 rooms of 25–35 m² per storey; classrooms 50–65 m².
- **Visual:** a supermarket, hotel corridor, classroom and church.

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
