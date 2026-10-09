# Matching a region to the real thing — the streamlined check

Robby, 2026-10-08: "soon we are going to focus on regions within the 16 regions so this research … will
be used in next session as reference for how to best ensure each region and sub region matches what they
actually look like in a super efficient streamlined way". This is that reference: one loop to run a region
(or a sub-region) against real photos, what to look at, where in the code each thing comes from, and the
first worked example — Rumson (NJ), Oak Park (IL) and Plano (TX), §6. (Robby, 2026-10-09: the region
pass isn't next — another agent assesses what is — "regions will happen and we will use that doc as
reference".)

It sits on what's already built — read with it: `docs/ROADMAP.md` (the 16 regions, the scorecard, Track
B), `docs/REGIONAL_LIFE.md` §3 (the green spots, vegetation share), `docs/NEIGHBOURHOODS.md` (estate,
grid, tract, suburb: `hood.ts`) and `docs/agent/debugging.md` "The real-world comparison".

## 1. The loop — one region in one sitting

1. **Spots** (§2): a region's place types × its sub-regions, ~8–12 spots. Survey Mapillary first; fill
   the gaps from public photo sources.
2. **Photos**: `node tools/real-spots.mjs --states=<its states>` picks one per spot (the spot's `since`,
   `months`, `unscored` where needed — §2).
3. **The game from the same place**: `node tools/real-compare.mjs --kind=<kind> [--group=region]` — the
   photo beside the game at the photo's position, heading, lens, date and hour, one montage a region,
   each pair scored by its class mix (sky, buildings, vegetation, ground, water, vehicles). Read only the
   montage (hard constraint 11).
4. **Read it with the checklist** (§3), layer by layer, top to bottom; write each mismatch as one line
   with a number wherever the game can say one (trees per lot, crown base height, lawn share, setback).
5. **Name the knob** (§4) behind each mismatch. Fix by system — one change serves every region with the
   same trait (an estate's canopy in New Jersey and in Lake Forest) — never a list of towns (hard
   constraints 5 and 9).
6. **Again, same spots**: the scores and the montage before and after go in the LOG; the region's
   "Reviewed" cell on the ROADMAP scorecard turns green when the montage reads as the place.

Cost: a region's spots run in 10–20 minutes on the PC (the GPU; too slow in the cloud). Most fixes are
one knob each and serve many regions at once, so the second region is faster than the first.

## 2. Picking the spots — place types × sub-regions

A region isn't one look. Sample it by **place type** (what people walk through) across its
**sub-regions** (EPA Level III ecoregions, `src/world/ecoGrid.ts`; the green spots' regions):

| Type | What it shows | Example |
|---|---|---|
| Main street / downtown | shopfronts, sidewalks, street trees, parking | Broad Street, Shrewsbury |
| Old grid | small lots, close houses, mature street trees | Red Bank east side |
| Estate / large lot | big houses set back across lawns, specimen trees, hedges | Rumson Road |
| Tract / newer suburb | alike houses, young trees, wide streets, culs-de-sac | Plano, Levittown |
| Rural road / farm | fields, hedgerows, farmsteads, ditches | the green spots' rural roads |
| Park, wood or shore | the region's own trees and ground at their fullest | the green spots' parks |

One spot per type in the region's main sub-region, plus the types whose look changes (trees, ground) in
each other sub-region: 8–12 spots a region, ~150 for the lower 48. Name them in `tools/real-spots.mjs`
(`NAMED`, `GREEN`, `SUBURBS`: a list per purpose, with its `kind`).

**Photos — what the Rumson run taught:**

- **Survey before choosing a point.** Mapillary's coverage is uneven: Rumson proper has *no* photos at
  all; its only ones are Rumson Road's west end (August 2018). A 1/100° grid of image counts over the
  town (the images API, a box a cell) shows in a minute where there are photos to stand at.
- **Older and leaf-on.** A spot may take older photos where there are no newer ones (`since: 2018`) and
  only its leaf-on months for a tree check (`months: [5…10]`): the picker's newest-first default gave
  Oak Park a December photo, which says nothing of summer canopy.
- **Unsegmented is fine for looking.** Older photos often carry no segmentation (no class mix to score):
  `unscored: true` shows them side by side, unscored.
- **Where Mapillary has nothing**, public photos for the eye (never in the repo, never shipped):
  municipal historic-preservation inventories (Rumson's has a photo of each listed house: the estates'
  character in six photos), Wikimedia Commons, state library collections; KartaView for street-level.
  **Never Google Street View**, not even for testing (its terms forbid it), and never Mapillary Vistas.
- **A photo with no pose can still be matched**: stand the game on the same street in the same month
  and hour, looking the way a passer-by would (the Rumson Road pose script in §6), and set them side by
  side as character references rather than pixel matches.

## 3. The checklist — what makes a place read as itself

Read the montage in this order (the eye's own: the biggest masses first). For each, the question and the
number the game can give:

| Layer | Look for | The game's number |
|---|---|---|
| Trees | spacing (lone specimens or a wall), height, **where the crown starts** (trunks showing under a high canopy, or crowns down to the lawn), crown shape, street vs yard vs wood | trees per 100 m of frontage, median height, median crown base, nearest-neighbour spacing (`ctx.instances('trees:')` + `treeMeta`) |
| Ground | open lawn share, its green by season and climate, beds, mulch, bare ground | vegetation/ground shares (real-compare), the ground paint's lawn share |
| Houses | size, setback, style (colonial, shingle, ranch, bungalow, Victorian), cladding and colour, roof shape and material, porches, dormers, shutters, garages | hood class and archetype (`hood.ts`, `recipe.ts`), footprint and setback |
| Lot edges | hedges (clipped, tall), fences, walls (stone, brick, block), open lawn to the street | yard edge per 100 m (NEIGHBOURHOODS §4 Tier A) |
| Street | width, lanes, kerb (granite, concrete, none), sidewalk and verge strip, street trees, poles and wires, mailboxes | the road's width and class, `vergeShare` |
| Life | parked and passing cars, walkers by the hour, animals | `lifeDensity.test.ts` target table, critter counts |
| Light | haze, sky, the palette's warmth | the look preset (`post.ts`) |

## 4. Where each comes from in the code — the knobs

| Layer | Knob | File |
|---|---|---|
| Trees, surveyed places (LiDAR) | crown detection from the canopy height model: local maxima, crown radius, thinning | `src/world/lidarCore.ts detectTrees` (bump `VER` in `lidar.ts`) |
| Trees, elsewhere | WorldCover's tree share × the region's `treeDensity` × the hood's canopy factor (estate 3.2, grid 1.2) | `src/world/props.ts` (the lot scan), `src/world/hood.ts` |
| Tree kinds | OSM species → kit kinds; the region's weights (`look.trees`); the woods' mix | `realTile.ts treeKindOf`, `styles.ts`, `farWoods.ts woodsMix` |
| Tree models | crown height, crown base, trunk, lobes; near-model leaf cards | `src/assets/flora.ts` (`treeMeta`), `nearTrees.ts` |
| Street trees | how many by region and hood, how tall | `flora.ts vergeShare`, `vergeHeight` |
| Ground | land cover and the ground paint (lawn, beds, bare) | `landcover.ts`, `groundPaint.ts`, `ground.ts` |
| Houses | the hood class, archetypes per region and hood, colours and materials | `hood.ts`, `recipe.ts`, `buildings.ts`, `styles.ts` |
| Lot edges | hedges, walls, fences from OSM barriers; estate drives and frontage | `props.ts`, `retaining.ts`, `buildings.ts` (`estate`) |
| Street | road widths and kerbs, sidewalks, the verge | `realTile.ts`, `kerbside.ts`, `styles.ts` |
| Life | the place and the hour | `lifeSim.ts` (LAND, cityNight), `critters.ts` |

## 5. Order of work for the region pass

1. Run every region's montage once (the baseline): the scores in `tools/real-scores.json`, the
   mismatches as lines per region.
2. Group the lines by knob across regions; fix the knob that serves the most regions first.
3. Re-run only the affected regions; update the scorecard.

## 6. Worked example — Rumson, Oak Park, Plano (2026-10-08)

Robby: "i feel like suburb towns like rumson have to much fluffy trees and it doesnt really look like
rumson road … compare to real photos online, also 2 other random towns". Three suburbs of three kinds: an
estate road (Rumson, NJ, mid-atlantic), an old leafy inner suburb (Oak Park, IL, midwest) and a newer
Sun Belt one (Plano, TX, texas). Montages (git-ignored): `shots/real/NJ-montage.jpg`, `IL-montage.jpg`,
`TX-montage.jpg` (Mapillary, same spot, lens, date and hour), `shots/fix/rumson-road-game.jpg` (the
game on Rumson Road's estate stretch, 20 August at 13:00) and `shots/fix/rumson-real-vs-game.jpg` (beside
the borough's own photos). The game's numbers are its trees in front within 45 m of each view
(`ctx.instances('trees:')` × `treeMeta`).

**What the photos show of Rumson Road** (its historic-preservation inventory, August 2013, and
Mapillary's west end, 2018): big pale houses — white, cream, yellow; Colonial Revival, Shingle,
Italianate; two and a half storeys, dormers, porches, shutters, brick chimneys — set back across deep
green, mown lawns on long drives; mature specimen trees (oaks, beeches — a copper beech — maples, a few
spruces and cedars) standing apart on the lawns, big trunks and wide crowns high over the grass, thicker
along the lot edges; tall clipped hedges along the frontage; the road two lanes with a double yellow line
and white edges, granite kerbs or a grass verge, sidewalks only toward the village; poles and wires
everywhere; mailboxes at the drives.

**What the game shows**: an open wood. 18–39 trees in front within 45 m (75–125 a hectare), their nearest
neighbours 4–6 m apart, median height 12–18 m, crowns from 4–6 m up and 3–5 m in radius; 40% of them pines
(14 of 35 on the middle stretch); lumpy, light yellow-green crowns, a few acid-yellow in August; pale
yellowish ground with grass tufts; small low houses half hidden behind the trunks; a concrete sidewalk
with tree pits the whole way; no hedges, walls or mailboxes; poles only here and there.

**Oak Park** (October 2015): 0.83 and 0.89 — the street, the lights, the buildings and the autumn colour
read right; a conifer drawn as stacked flat discs (a pagoda, not a spruce), the crowns lumpy, the morning
sky pale peach where the photo's is deep blue, and a black square floating in one view's sky (to look at).
**Plano** (November 2021): 0.51 and 0.58 — Lone Tree Drive's dense row of evergreens along a board fence
by the road (47% vegetation) is missing (6%: the apartments behind it show instead); on Forbes Drive the
lens landed off the arterial's lanes in a grove.

**Ranked improvements** (impact on "it looks like the place" over cost; each a knob from §4, serving
every region with the trait):

1. **Fewer, bigger trees on estate and park lots** — the survey's crowns split: a 25 m oak's wide crown
   makes several local maxima, so `detectTrees` plants a stand where there is one tree. Merge maxima
   inside one crown (the window by height, the crown's drop), keep the measured crown radius and scale
   the model to it; the result to check: 15–30 m between specimens on a lawn, 8–12 m crowns.
   (`lidarCore.ts detectTrees`, `VER` in `lidar.ts`.)
2. **The coastal plain's settled trees are broadleaves** — 40% pines on Rumson Road: the coast's
   pine-leaning weights put on the Navesink's estates (first find where the surveyed trees take their
   kinds). Weight the settled land of each sub-region to its yard and specimen trees (oaks, beech,
   maples, tulip tree, sycamore; spruce and cedar as accents) and keep the pines to their own ecoregion,
   the Pine Barrens. (`styles.ts` `look.trees`, the sub-region from `ecoGrid.ts`.)
3. **Crowns and their colour** — darker, deeper summer greens with shadowed hearts; irregular
   silhouettes with limbs showing; no yellow before the region's fall (August on the Jersey shore was
   showing yellow). (`flora.ts` lobes and palette, `fallOnset`; `nearTrees.ts` cards.)
4. **Lawns that read as mown and green** where people live — estates and suburbs a deep even green in
   summer (irrigated), not the field's pale straw with tufts. (`groundPaint.ts`, `grass.ts`.)
5. **The street's edge by its kind** — an estate road with grass verges and kerbs, no sidewalk or
   tree pits; poles and wires along it; mailboxes at the drives. (`kerbside.ts`, the road recipe in
   `styles.ts`, the micro layer.)
6. **Lot edges** — tall clipped frontage hedges and stone or brick walls with gate piers on estates;
   board fences and evergreen screens along a Sun Belt tract's arterials. (`props.ts`, `buildings.ts`
   estate frontage; NEIGHBOURHOODS phase 1.)
7. **Houses** — once the trees open up, the estate archetype must hold: big pale two-and-a-half-storey
   colonials and shingle houses with dormers and porches, set far back. Check `recipe.ts`'s estate
   heights and colours against the inventory. (`hood.ts`, `recipe.ts`.)
8. **Smaller things** — the pagoda conifer, the black square in Oak Park's sky, the peach morning sky.
9. **For the tools** — survey Mapillary first (Rumson has none in the middle); older and leaf-on photos
   for trees; a lens that lands off the road (Rumson's west end, Plano's Forbes Drive) is a pose to fix
   before it's a score to read.
