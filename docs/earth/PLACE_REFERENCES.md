# Place references — does it feel like home?

The test for scaling to the whole world: someone walks down their own hometown's main street in the
game and recognises it. This doc holds reference photos of real places (Wikimedia Commons; links
below for attribution) and, for each place, the things a local would expect to see. Every trait
names the **data signal and system** that produces it, so a fix applies everywhere with the same
signal. It is never a patch for one town.

- Capture: `tools/place-shots.js` → `shots/place-<tag>.jpg` for any `?at=lat,lon` (add
  `&tiles=direct` to stream straight from Overpass).
- Local copies of the reference photos are kept out of git (licensing). Re-fetch them from the
  links.
- Status: ✅ reads right · 🟡 partly · ⬜ missing.

---

## Sea Bright, NJ — Ocean Avenue (NJ 36) downtown

References:
- [Downtown Sea Bright, NJ](https://commons.wikimedia.org/wiki/File:Downtown_Sea_Bright,_NJ.jpg)
- [View south at New Street (2018)](https://commons.wikimedia.org/wiki/File:2018-05-25_16_16_08_View_south_along_New_Jersey_State_Route_36_(Ocean_Avenue)_at_New_Street_in_Sea_Bright,_Monmouth_County,_New_Jersey.jpg)
- [View north at Surf Street (2025)](https://commons.wikimedia.org/wiki/File:2025-04-23_10_10_50_View_north_along_New_Jersey_State_Route_36_(Ocean_Avenue)_at_Surf_Street_in_Sea_Bright,_Monmouth_County,_New_Jersey.jpg)

| Trait a local expects | Signal → system | Status |
|---|---|---|
| A continuous row of 2–4-storey storefronts at the sidewalk: clapboard (pale blue, grey, white), tan brick, a white church steeple | OSM footprints + tags, region style → buildings.ts | 🟡 |
| Dark navy awnings, hanging signs, shop names | `name`, Building.u → per-building fascia/awning shader, signs.ts | 🟡 |
| Black acorn lampposts lining the downtown sidewalk; US-flag banners on the lamps in summer | commercial frontage density → main-street lamp family; calendar → banners | ⬜ |
| Wooden utility poles with crossarms, transformer cans, **dense overhead wires crossing the street**; cobra-head lights on the poles | road class + region → poles/wires (props) | 🟡 |
| Continuous parallel parking on both sides | commercial frontage → curbside parking | 🟡 |
| Crosswalk ladder bars, a "yield to pedestrians" sign in the centre line, red hydrants, yellow kerbs | intersections + downtown → ground paint + street furniture | ⬜ |
| Double-yellow centre line; wide shoulders | road class → ground paint | ✅ |

## Monmouth Beach, NJ — Ocean Avenue and residential streets

References:
- [NJ 36 southbound at Seacrest Road (2026)](https://commons.wikimedia.org/wiki/File:NJ_Route_36_sb_at_Seacrest_Road,_Monmouth_Beach,_Sept._2026.jpg)
- [Seaview Avenue southbound (2026)](https://commons.wikimedia.org/wiki/File:Seaview_Avenue_sb,_Monmouth_Beach,_NJ,_Sept._2026.jpg)

| Trait | Signal → system | Status |
|---|---|---|
| **The seawall**: a 3–4 m rock revetment along the ocean side of Ocean Ave with wooden walkover stairs; you can't see the beach from the road | OSM `wall=seawall` → structures.ts (streamed tiles now carry it too) | 🟡 (height reads low) |
| White clapboard houses behind low concrete garden walls; the lifesaving-station tower | footprints + style; `barrier=wall` | 🟡 |
| Mown lawns to the kerb, rows of small street trees | land cover + street-tree rule | 🟡 |
| A transmission line of tall wooden poles with many wires | OSM `power=line` → pole/wire family | ⬜ (lines now streamed, not drawn) |
| Long Branch condo towers on the horizon | footprints with heights beyond the load ring | 🟡 |

## Tucson, AZ — 4th Avenue and Barrio Viejo

References:
- [Fourth Avenue, Tucson](https://commons.wikimedia.org/wiki/File:Fourth_Avenue,_Tucson_(8390673869).jpg)
- [Convent Avenue and Simpson Street, Barrio Viejo](https://commons.wikimedia.org/wiki/File:Convent_Avenue_and_Simpson_Street,_Barrio_Viejo,_Tucson,_AZ.jpg)
- [Kennedy Street, Barrio Viejo](https://commons.wikimedia.org/wiki/File:Kennedy_Street,_Barrio_Viejo,_Tucson,_AZ.jpg)

| Trait | Signal → system | Status |
|---|---|---|
| **Mountains on every horizon** (the Santa Catalinas, the Rincons, the Tucson Mountains) | Terrarium DEM, low zoom, ±40 km → far-terrain ring | ⬜ |
| Flat roofs with parapets; stucco and adobe in bright colours (salmon, turquoise, pink, yellow); painted brick | arid climate + adobe family → roofs/palettes | 🟡 |
| Barrio row houses **at the sidewalk** with no setback, tall narrow dark-framed windows, stone foundation band | footprint position against the road + style | 🟡 |
| Mesquite and palo verde (feathery, yellow-green), agave and yucca, gravel yards, **no lawns** | climate → tree species + xeriscape ground | 🟡 (palms and tufts, no mesquite) |
| Low block or stucco garden walls and wrought iron, **not picket fences** | style family → fence type | ⬜ (picket fences appear) |
| Wooden utility poles and overhead wires; sun-bleached, cracked asphalt | region → poles; climate → asphalt tone | 🟡 |
| Downtown towers on the skyline (One South Church, the UniSource building) | footprint heights | 🟡 |
| 4th Ave: storefronts, murals, streetcar tracks with overhead wire, neon at the bars at night | OSM `railway=tram` (⬜), use=bar → neon at night (⬜) | 🟡 |

## New York, NY — Midtown avenues

References:
- [6th Avenue from 49th Street](https://commons.wikimedia.org/wiki/File:6th_Avenue_from_49th.jpg)
- [57th Street and Madison Avenue](https://commons.wikimedia.org/wiki/File:57th_St_Madison_Av_td_(2018-08-27)_34.jpg)

| Trait | Signal → system | Status |
|---|---|---|
| **Street canyon**: 150–300 m towers both sides, sky a narrow slot | OSM `height` / `building:levels`, **`building:part`** setbacks | ⬜ (40 m clamp) |
| Dark glass curtain walls with vertical mullion stripes; limestone / granite / brick towers with punched windows | height + material (`building:material`, era) → tower facade | ⬜ |
| Yellow taxis in most of the traffic; buses | region + density → car mix | ⬜ |
| Zebra crosswalks, signal mast arms, bishop's-crook lamps, street trees in pits, trash cans | intersections + density → street furniture | ⬜ |
| Ground-floor retail glass, lit signs and screens | Building.u + density | 🟡 |
| Sound: traffic roar, horns, sirens, crowds | building density → city soundscape | ⬜ |

## Seattle, WA — downtown

Reference: [Downtown Seattle street scene](https://commons.wikimedia.org/wiki/File:Downtown_Seattle10_22_13_449000.jpeg)

| Trait | Signal → system | Status |
|---|---|---|
| Red-brick high-rises with fire escapes; white terracotta storefront blocks; glass towers behind | heights, materials, era | ⬜ |
| Trolleybus overhead wires over the streets | OSM `trolley_wire=yes` / `railway=tram` | ⬜ |
| Steep hills, water (Elliott Bay), Mount Rainier on clear days | DEM near + far ring, water | 🟡 near / ⬜ far |
| Neon signs; painted wall ads | use=shop/bar + era | ⬜ |

## Miami Beach, FL — Ocean Drive

Reference: [Ocean Drive, Art Deco Historic District](https://commons.wikimedia.org/wiki/File:Ocean_Drive_in_the_Miami_Beach_Art_Deco_Historic_District.jpg)

| Trait | Signal → system | Status |
|---|---|---|
| White and pastel Art Deco hotels (3–4 storeys, rounded corners, "eyebrow" ledges, turquoise / yellow trim) | tropical climate + style family → deco facade vocabulary | ⬜ |
| Café terraces along the whole block: bright umbrellas and awnings | Building.u (restaurants) → terraces | 🟡 |
| Lines of tall coconut palms; yellow kerbs; green bike lane; condo towers beyond | tropical trees; road paint; heights | 🟡 |

---

## What the comparisons say (cross-place, ranked by how many hometowns they fix)

1. **Horizons** (DEM far ring): every town with mountains or hills in view.
2. **Heights and building parts** (skyscrapers, setbacks): every city.
3. **Overhead wires and poles** from OSM power lines plus street defaults: nearly every US street.
4. **Main-street furniture** (lamps, crosswalks, hydrants, parking, street trees): every downtown.
5. **Regional ground and trees** (xeriscape, mesquite, palms, lawns): every climate.
6. **Fence and wall vocabulary by style family**: every residential street.
7. **City sound** by density: every city.
