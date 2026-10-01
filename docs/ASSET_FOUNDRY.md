# The asset foundry — variety for everything

How map_game makes its things: trees, garden plants, animals, mailboxes, beach gear, cars, boats,
planes and rocks. Everything is made by one foundry, in the browser, from recipes. This doc gives
the reasoning; `docs/agent/gameplay.md` has the working rules.

Code:
- `src/assets/core.ts` — the shared workshop.
- Families: `kit.ts` (vehicles, rocks), `flora.ts`, `fauna.ts`, `furniture.ts`.
- Systems: `src/sim/critters.ts` (wildlife), `src/ui/garden.ts` (the Grow verb).
- Workbench: `/kit.html`.

## What "the best asset creator for this game" means

The constraints decide the design:

1. **The whole world is procedural and streamed.**
   - Any spot in the lower 48 must look populated seconds after it loads.
   - A tile holds thousands of trees, hundreds of plants, cars and mailboxes, and there are dozens of tiles.
   - Assets are therefore *generated*, never downloaded. They are *instanced* (one draw call per model), and they must be cheap in vertices.
2. **Deterministic.**
   - Every visitor sees the same street.
   - Variety is chosen by hashing positions or data ids, never by `Math.random`.
   - Neighbouring tiles must agree, so choices are keyed by position, not by the order an RNG was called in.
3. **Watercolor.**
   - The painted look forgives low-poly forms and punishes noise.
   - Silhouette, proportion and colour matter. Surface detail doesn't.
   - The budget goes into shape, not triangles.
4. **Real data first.**
   - The foundry never overrides what data says (LiDAR tree heights, mapped buildings).
   - It fills in what data can't say: which tree species, what's in the garden, what's on the car roof.
5. **Every region.**
   - Choices come from region and climate tables (`carMix`, `boatMix`, `plantMix`, tree species by climate). There are no per-town lists.
6. **Nothing may look broken.** Every recipe passes validation (finite, sized, grounded, within budget) before it reaches the world. The tests enforce this for every family.

## The pattern: recipe → genome → geometry

```
type + seed ──► recipe (validated proportions, counts, colours)
            ──► geometry (non-indexed, color + aPart [+ aPivot]) ──► cached per key ──► InstancedMesh
```

Each family is one tested skeleton plus a small genome. This is how Spore's creature editor made
arbitrary animals animate on one pipeline (Hecker et al., SIGGRAPH 2008), and how botanical
modelling builds plants from a handful of growth rules (Prusinkiewicz & Lindenmayer, *The
Algorithmic Beauty of Plants*).

The genome decides counts and placement:
- **Organ counts are Fibonacci numbers** (`fibCount` → 3, 5, 8, 13, 21).
- **Organs sit at the golden angle** (137.5°; Vogel's phyllotaxis model).
- **Organs taper toward the tip** (`taper`).

These are tendencies, not a theme. They are why a seeded hydrangea or palm reads as *grown*
rather than assembled.

**Considered and rejected at runtime:**
- *Full L-systems / space colonization per tree* (Runions et al. 2007). Beautiful, but thousands of instances per tile each need their own geometry. They fight instancing and the vertex budget, and the watercolor pass would blur the branch detail anyway.
- *Skinned rigs for animals.* One skeleton per species plus bone textures is heavy for ~40 small animals, and joint rotation in the vertex shader gives the same read (see Fauna).
- *Runtime glTF.* Our materials don't survive the round trip. The packed tile format *is* the asset format; GLB export exists only for sharing and Blender.

## The variety budget

What makes a street feel alive is the number of *distinct-looking* things. Draw calls and
vertices are what it costs. There are four axes, cheapest first:

| Axis | Cost | Used for |
|---|---|---|
| **Per-instance continuous** — scale (non-uniform ±3–8%), yaw, instance colour, fade | free (same draw) | every car breathes within its type; faded old paint; foliage greens; umbrella and towel colours |
| **Discrete grown variants** — `TREE_VARIANTS = 3` per species, 2 per garden plant | +1 draw each per tile | trees (7 species × 3), garden beds |
| **Add-ons as model keys** — `parked-cars:suv:surf` | +1 draw per used combo | surfboards, kayaks, roof racks, roof boxes, hitch bikes |
| **State / time** — growth stage, bloom season | a rebuild when the state changes | gardens bloom by the real calendar; your plants grow |

Vertex budgets (checked by `tests/foundry.test.ts`): trees < 1,500 (most around 800–1,200), and
a tree's near model (its limbs and leaf cards, the nearest 160 on a desktop, 40 on a phone) ≤ 2,500;
garden plants in the world use a `lite` genome under 900 (usually 250–840; the full version is
for plants you grow and the workbench); animals < 1,600; cars about 1,800.

## Families

- **Trees** (`flora.ts`): round, oak, shrub, pine, spruce, palm, birch, mesquite, fan palm, maple, willow, elm, poplar, magnolia, cherry.
  - Trunk, forks at the golden angle, then crown lobes on a Fibonacci sphere (or conical whorls, or fronds).
  - `treeMeta` reports height, crown radius, crown bottom and trunk radius, so LiDAR-measured trees scale to their real size and the building clearance uses the real crown.
  - Regional reading: palms where it's warm by the sea, birches up north.
  - **Two models per tree.** The recipe grows a *plan* (`TreePlan`: every bough from → to with its radii and bark, every crown lobe's middle, radius and squash). The far model is drawn from it as before — solid lobes, under 1,500 vertices, thousands a tile. Within ~30 m the **near model** (`nearTreeGeometry`, round 11's must-fix 4) is grown from the *same* plan, so it stands where the far tree stands with the same crown:
    - the trunk a smooth tube (`core.ts` `tube`: rings carried along the path without twist, normals leaning with the taper — no crease at a knee) that flares at the root to half again its girth and tapers to its fork, the base ≥ 1.3× where it meets the crown;
    - the recipe's scaffold limbs as tubes, and a **second order** of branches: one from the nearest limb out into each leaf cluster, arching up, ending inside it — so ≥ 3 pieces of wood go up into a street tree's crown;
    - the crown as **8–20 leaf-cluster cards**, one per far lobe (where it was, as big, as squashed; a shrub's few split until there are 8), each card showing one of 8 painted leaf pictures (`leafAtlas`: sprays of almond leaves on twigs, alternating along them, a darker heart, a ragged rim with gaps between the leaves — or needle tufts for the conifers), drawn by `render/leafCards.ts`;
    - **≤ 2,500 vertices** a tree (wood + four corners a card; most 1,000–1,900), checked with validation, determinism, the taper, the limbs and the crown's fit to the far one in `tests/foundry.test.ts`.
    - Palms and the willow keep their far model at every distance (fronds and tresses already). `NEAR_KINDS` lists the rest.
  - The leaf pictures are painted in JS, deterministic, a picture a frame while the world boots (`leafAtlasJob`): 4 × 2 cells of 256 px (128 on a weak phone), A coverage, R the leaf's shade, G leaf/twig, B a number per leaf for autumn.
- **Garden plants** (`flora.ts`): twelve species in six growth forms — mound, clipped, rosette, spike, clump and stem.
  - Each species has a climate weighting (`plantMix`) and a bloom season (`inBloom`, flipped in the southern hemisphere).
  - Growth stages 0–7 go from sprout, to leafing out, to blossoms opening from about 60% grown.
  - World beds line the house fronts on open ground only.
- **Fauna** (`fauna.ts` + `sim/critters.ts`): 17 species on two body plans. Four-legged species are rows in `QUAD` over four base builds (squirrel, rabbit, deer, fox) — scale, coat / belly / stocking / tail-tip colours, ear size, tail fullness: coyote, black-tailed jackrabbit, snowshoe hare (TINT coat: brown in summer, white in winter), ground squirrel, mule deer. Birds are rows in `BIRD` over `birdGeometry` — colours, legs, bill length and curve, crest, tail, wing plan, scale: songbird, sandpiper, red-tailed hawk (3.3×, broad fingered wings, soars via `uFlap`), greater roadrunner, quail, white ibis. **A new species is a table row.**
  - **Roles and the regional cast.** Behaviour belongs to a role (`ROLE`: climber, burrower, grazer, songbird, shorebird, browser, predator, raptor, butterfly, firefly); `faunaMix(region, climate)` says which species fill each role in a place — the same key the plant and car mixes use. Temperate: squirrel, rabbit, songbird, sandpiper, white-tailed deer, red fox. Arid: ground squirrel, jackrabbit + roadrunner, quail, mule deer, coyote, no fireflies. Boreal: snowshoe hare. Tropical: + white ibis. Other continents fall back to their climate's North American cast until they get rows.
  - Limbs, tail, head and wings carry `aPart` plus an `aPivot` joint.
  - `critterMaterial` swings them in the vertex shader from a per-instance `aAnim` (gait phase, amount, pose), with per-species gait offsets (bound vs walk) and limb amplitude.
  - Behaviour comes from habitat:
    - squirrels at trees (they bolt up the trunk);
    - rabbits on lawns at dawn and dusk;
    - songbirds on grass by day (they flush);
    - sandpipers on the surf line;
    - deer in woods at dawn and dusk;
    - butterflies over gardens in summer;
    - fireflies on summer nights;
    - a fox on lawns and wood edges at dusk and night;
    - a hawk circling a thermal by day.
  - They form one ecosystem: the fox stalks (a slow creep) and pounces; the hawk stoops on animals in the open; prey freeze a beat (shorter for the watchful — per-animal vigilance) then flee the fox, the stoop, the walker or a moving car (the faster it comes, the sooner they go); an alarm spreads through a flock or warren and to other small prey nearby. Tested in `tests/critters.test.ts`.
  - Budgets: every species < 1600 verts (`tests/foundry.test.ts` walks `CRITTERS`).
  - Small animals are drawn 1.3–2× life size, an illustrator's licence: at painting scale a true-size squirrel dissolves into the grass.
- **People** (`people.ts`): one jointed body for every walker and resident (hips, knees,
  shoulders; ~1.4k vertices), varied per instance on the GPU: skin, hair and trouser palettes,
  five hairstyles (the unworn ones collapse), shorts and short sleeves by the region's warmth
  (climate × season). Gait: thighs swing about the hip, the knee folds on the forward swing, arms
  counter-swing; standing people shift their weight. A whole crowd is one instanced draw. A lite
  twin (`personLiteGeometry`, < 300 vertices, the same joints, parts and markers) draws a beach
  crowd past ~40 m; the `BEACH` shader poses either from the standing body — in a beach chair, lying
  on a towel, sitting on the sand, a kid jumping the waves, a lifeguard on the stand
  (`world/crowd.ts`, `docs/agent/gameplay.md` "The shore's calendar").
- **Furniture** (`furniture.ts`):
  - five mailbox styles, North American curbs only;
  - summer beaches (umbrellas, towels, chairs) around the lifeguard stands;
  - picnic tables;
  - car gear, chosen by `gearFor` (coastal → surfboards and kayaks).
- **Micro things** (`micro.ts`): the small made objects of a lived-in place — trash and
  recycling carts, A-frames, planters, newspaper boxes, kerb pedestals, signs, Adirondack chairs,
  grills, fire rings, AC units, birdbaths, house flags, lawn and realtor signs, hoops, bikes,
  kayaks, surfboards, coolers, cleats, dock boxes, life rings, crab traps, mooring balls, pot
  floats, channel buoys and markers, and the map's picnic tables, boards, cabinets, recycling,
  vending machines and clocks. Placed per tile by `world/micro.ts` (real data first, then a fill
  keyed by position, house, shop, beach, pier); drawn by the micro layer — 3D close up,
  hemi-octahedral impostor cards beyond 25–60 m, two draws for all of them.
- **Vehicles and rocks** (`kit.ts`), unchanged in shape. Cars now carry gear keys and per-car proportions and fade, both for driveway cars and for moving traffic.

## Time: the Grow verb

`src/ui/garden.ts` is stage 1 of `docs/CONSTRUCTION.md`. **R** plants a seed from the region's
packet (**Shift+R** picks another) on open ground a step ahead:
- It sprouts at once and blooms after about 20 minutes of play.
- It keeps growing while you're away: a day away counts as a full season.
- It is saved with real lat/lon and pinned on the map (❀).
- Once grown, it offers a commission ("Paint the hydrangea you grew").
- Its bed is solid and clears the wild grass.

## Adding a family (the checklist)

1. **Genome.** A `…Geometry(type, seed[, state])` in `src/assets/<family>.ts` built from `core.ts` primitives:
   - front toward −z, origin on the ground;
   - `TINT` (white) wherever colour should vary per instance;
   - `aPart` for any channel a material reads.
2. **Validation + budget.** Add it to `tests/foundry.test.ts`: finite, grounded, deterministic, vertex budget.
3. **Library.** A `…Lib(type, v)` through `cached()`. Tile builders `.clone()` it, because pack transfers the buffers.
4. **Placement.** Keyed on real data or habitat. The variant comes from `variantAt(x, z, n)` and the mix from a region/climate table. Name the InstancedMesh `family:type[:variant]`, so the spotting log, commissions and hints can find it.
5. **Workbench.** Add a row to `src/tools/kitViewer.ts` and check it at `/kit.html` (painted toggle, seeds, growth slider).

## Almanac cards

Every family doubles as a page of the Almanac (`src/ui/commissions.ts`, `cardArt.ts`): the same
recipe that builds a model in the world renders its field-guide card, so a new family is
collectible the moment it exists.

## Next

- More families: docks and piers from the same recipe, playgrounds, fences and gates, lifeguard stands, porch furniture, laundry lines, flags.
- Per-instance vertex AO (ASSET_FIDELITY §3).
- Impostor LOD for trees beyond ~1 km and people beyond ~60 m: the micro layer's `ImpostorAtlas` + card shader (`render/impostor.ts`) take any foundry geometry.
- Near trees: per-species leaf shapes (lobed oak, palmate maple, the magnolia's big glossy leaf), a third order of twigs for the bare winter form, the willow's tresses and the palms on the near layer.
- Seasonal foliage colour (autumn crowns from the same calendar that drives bloom).
- More animals by region: pelicans and herons on southern coasts, moose up north, lizards in the desert.
- Construction tiers 2–4 (dock/boat, structures, sketch-to-build) on the same recipe vocabulary.
