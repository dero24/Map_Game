# Handoff: the lower 48, alive — part 2 (2026-10-05)

Robby: "i want to make sure all these places look alive lower 48 look alive with correct
vegetatation and animals and all that". Then: "you should just create all the 3d models for
everywhere based on our procedural 3d asset generator foundry". Then: "ensure animation like for
spanish moss and other things are really good too and we want alot of variety even per species,
color, all that". At the wrap-up: **"make things detailed, and variety and variation matter"**, and
**"rapid but great development"**.

Read this first. Then read `docs/regional-life/models.md` (the build list) and the rows of the
package you're on. `docs/REGIONAL_LIFE.md` and the latest `docs/earth/LOG.md` entry are background.

## How to work in this cloud session (Robby's call)

The game was smooth and rendering before this work started. Work fast, and keep the work great.

- **No slow captures.**
  - Don't run in-game captures: no `capture.mjs`, `light-shots`, `spot-shots`, soak or audit
    tools. Under the box's software GL they take tens of minutes.
  - Don't run the full test suite or `npm run init` as routine.
- **Review the fast way.**
  - **Read your own code carefully**: the geometry, the GLSL, the placement rules.
  - Run `npm run typecheck`.
  - Run only the test files you touched or added, e.g.
    `npx vitest run tests/foundry.test.ts tests/streetTrees.test.ts`.
  - **A quick picture when it helps**, if it works:
    `node tools/tree-studio.mjs --tag=<tag> --kinds=a,b,c` → `shots/trees-<tag>.jpg`. That's the
    foundry's trees side by side, no game boot. Read the montage. If it's slow or fails, skip it
    and rely on reading the code.
  - **After a GLSL change**, run the shader compile check if it works: on a dev page,
    `await import('/tools/shader-check.js'); await __SHADERS__()`. Drive it with Playwright plus
    `tools/pw-proxy.mjs proxyArgs()`, as `tree-studio.mjs` does. A shader that doesn't compile
    blanks the trees, so at minimum re-read every `#if` path you touched.
- **CI does the heavy checking.** A push to `feature/*` runs typecheck, the full `npm test`, the
  build and a playtest (`.github/workflows/playtest.yml`), and publishes Pages (`pages.yml`).
  - After pushing, check that the run went green: `mcp__github__actions_list` on `dero24/map_game`,
    branch `feature/lower48-alive`.
  - If it went red, fix it before the next package.
- **Missing keys: skip it, don't chase it.** The cloud box has no Cloudflare or Mapillary keys and
  Robby knows. That parks three things; leave them alone:
  - the canopy layer;
  - the R2 uploads and worker deploys;
  - the Mapillary photo comparison.

  Everything in the foundry runs without keys, and that's the work.

## Where things stand

- **Branch `feature/lower48-alive`** (off `feature/foundation-first`). Work and push here. `main`
  is for PRs; don't open one unless Robby asks.
- The last commit before this handoff was 4b87a07; the tree was clean and CI was green.
- **Built** (`models.md` build order):
  - **#1, the Northwest:** Douglas fir, western hemlock, Sitka spruce, western redcedar, red alder,
    vine maple; moss on bark; the forest floor.
  - **Regions as data:** `world/ecoregions.ts ecoAt(lat, lon)` gives the region (`REGIONAL_LIFE.md`
    §2), the EPA Level III code and the state.
    - These ride the style key (`…/<region>.<l3>.<state>`).
    - `castOf(style)` hands every mix a `CastPlace` `{ climate, sub, eco, l3, west, state }`.
    - **Every new mix takes a `CastPlace`, never a place name.**
  - **#2, live oaks and their hangers:**
    - `flora.ts OAKS`: southern, plateau and coast live oak, three forms each.
    - `assets/hangers.ts`: Spanish moss, resurrection fern, ball moss and lace lichen, in two loads,
      each tree its own tone.
    - The motion is `propMaterial`'s `hang`, a pendulum per strand, out of step with its
      neighbours. The fern greens after wet spells (`U.uWet`).
  - **#3, the northern and mountain forests:**
    - `PINES`: white pine, ponderosa, lodgepole.
    - `SPIRES` rows: red spruce, balsam fir, Engelmann spruce, subalpine fir, eastern hemlock.
    - Aspen, whose leaves tremble (`propMaterial` `MOTION` 1); willow thickets; snags.
    - Placed by `coniferMix` by elevation band, with aspen groves, willow thickets and snags.
  - **#4, the eastern hardwoods, the flowering understory, the southern pines** (2026-10-05; LOG
    "Regional life (4)"):
    - `LEADERS`: tulip tree, sweetgum, shagbark hickory, yellow buckeye. `OAKS` rows: sycamore, bur
      oak. `CLUMPS`: redbud, crape myrtle, rosebay. The dogwood's tiers. `PINES` rows: loblolly,
      longleaf (grass stage, bottlebrush, old), slash pine. The redcedar.
    - `render/treeSeasons.ts`: blossom types 1–5, fall hues 0–7, the bloom windows as data on
      `U.uSpring` / `U.uSummer`. `MOTION` 1 tremble, 2 tiers bobbing, 3 needles tossing. The cards'
      flags: `falls 1 + 2·hue + 16·bloom + 128·motion` (`flora.ts packCardFlags`).
    - 24 leaf pictures. Rhododendron and azalea in the gardens.
    - Placement: `broadMix` + `rangeIn`, `coniferMix`'s southern pines, `bankMix`, `redcedarShare`,
      `rosebayShare`, `understoryTrees`, `treeHeight4`, `SMALL_TREE`.
  - **#5, the swamps and the rivers** (2026-10-05; LOG "Regional life (5)"), all but duckweed:
    - `CYPRESSES` (the `cypress†` genome): bald cypress and pond cypress, a fluted foot shell
      (`flaredFoot`) and knees. Water tupelo on `LEADERS` with `foot`. Cottonwood and Fremont as `OAKS`
      rows, `MOTION` 1.
    - Placement: `swampMix`, `swampForm`, `bankMix` (cottonwoods, Fremont's, cypress).
  - **#6, California** (2026-10-05; LOG "Regional life (6)"):
    - Valley oak and blue oak as `OAKS` rows; coast redwood and giant sequoia as `SPIRES` rows (`foot`,
      `burls`, `scar`, the `round` and `reit` tops); manzanita as a `CLUMPS` row (`dead` stems) with
      blossom 6 on `U.uWinter` (`season.ts winter`).
    - The golden hills: `season.ts hay` → `U.uHay` (the grass, `grass.ts`; the ground's `uBiome.x`
      scaled in `main.ts`). Mind the name: `uGolden` is the golden hour's.
    - Placement: `broadMix` + `rangeIn`, `redwoodCountry` (EPA 1 + `ecoregions.ts caRedwoodBelt` on EPA
      6), `sequoiaBand` + `SEQUOIA_GROVE` (props.ts groves by 600 m patch), `manzanitaShare`, `westForm`;
      the LiDAR's giants kept to 116 m there.
  - **#7, the desert** (2026-10-05; LOG "Regional life (7)"):
    - Far-only builders (`DESERT_FAR`): saguaro (`fluted`), prickly pear, cholla, ocotillo, Joshua
      tree; their flowers and fruit as `BLOOM_PART` parts (blossom 7–10, `DESERT_BLOOM`, `fruitNow`);
      the ocotillo's rain leaves (FALL_HUE 8, `rainLeaves`, `uWet` now in the shared GLSL); `STIFF`.
    - `CLUMPS` rows creosote, Utah and Ashe juniper, big sagebrush; `PINES` row piñon.
    - Placement: `desertMix`, `desertTrees`, `pjBand` (props.ts `dryShrub`, `dryTree`).
  - **#8, the palms** (2026-10-05; LOG "Regional life (8)"):
    - `fanFrond` (sabal, saw palmetto), `featherFrond` (royal, queen, Canary), `keepUp`; MOTION 4 (far
      only) for every palm, the old coconut and fan palms too.
    - Placement: `broadMix` + `rangeIn`, `palmMix` (props.ts `palmsGrow`: January's mean > 3.5 °C),
      `palmettoShare`.
  - **#9, the ground layers** (2026-10-05; LOG "Regional life (9)"), all but smooth cordgrass:
    - The forest floor's bracken (`frond` form) and cinnamon fern, their autumn and dormancy as data.
    - The grass field's tuft kinds (`aKind`, `wildTuft`): the prairie's bluestems (`prairieMix`) and
      wildflower drifts (`WILDFLOWERS` on `U.uYear`, `wildflowerMix`).
    - Kudzu, a tree kind on the South's wood edges (`kudzuShare`, props.ts `woodEdge`).
  - **#10, the fields** (2026-10-05; LOG "Regional life (10)"): `world/fields.ts` (`cropMix`, `fieldAt`,
    `CROP_CAL`, `cropStage`, `cropWash`, `GLSL_CROPS`); the crops grown in the grass field's cropland
    cells (`grass.ts` `crops`, `cropMaterial`); the fields' wash in `groundPaint.ts`.

## The bar: detail, variety, variation

This is Robby's priority for every model. "alot of variety even per species, color, all that".

- **At least three grown forms per species:** open-grown, forest and old, or the species' own (the
  live oak's alley, the longleaf's grass stage, the pollarded crape myrtle). Two trees of one kind
  side by side must never look stamped.
- **Per-tree variation from the seed:**
  - lean, crown asymmetry, a broken limb;
  - height across the real range;
  - bark tone, and leaf green: each species its own green, then a shift per tree.
  - Fall colour and bloom colour vary per tree; for the sweetgum, per lobe.

  Use `variantAt`/`hashf` and the instance seed, carried in flat varyings (rule 7). Never add
  `rng.float()` calls to `props.ts`'s scans: that reshuffles every region.
- **Silhouette first.** A tulip tree, a sycamore and a white oak must tell apart at 100 m by shape
  alone.
- **Detail where you stand:** bark character (shaggy hickory, mottled sycamore and crape myrtle,
  corky sweetgum), and leaf pictures matched to the leaf.
- **Motion that belongs to the plant.** We have:
  - the aspen's tremble;
  - the moss's pendulum;
  - the fern curling dry.

  Add more like these: the dogwood's tiers bobbing, the willow's whips streaming, palm fronds
  thrashing in a gust, the longleaf grass stage shivering.
- **Seasons are variation too:** bloom windows, early and late turners, evergreens that bronze in
  winter.
- **Within budget:**
  - far model under 1,500 vertices;
  - near model at most 2,500 vertices, with 8–20 cards;
  - the near trunk at the ground at least 1.3× its width where it meets the crown;
  - built under 14 m and scaled to the real tree.

  Detail comes from smarter geometry (sprays, ribbons, card pictures), not more vertices.

## Package #4, the eastern hardwoods, flowering understory and southern pines — built

Built 2026-10-05 as designed below (kept as the record of the design; LOG "Regional life (4)" says
what changed from it: the tree studio found hollow crowns and umbrella sycamores, both fixed).

**The trees.** Append these to the end of `TREE_KINDS`. There are 35 kinds today; the last is
`snag`, index 34. Each needs three forms, with far and near models.

| kind | the shape that makes it read | colour and season |
|---|---|---|
| `tuliptree` | ramrod trunk, a high narrow crown, bare below | yellow in fall |
| `sweetgum` | pyramidal young, rounder later | autumn a *jewel mix* per lobe: purple, red, orange, yellow |
| `hickory` | tall oval crown; shaggy bark in curling strips (reuse `plan.hang` strips) | golden-bronze fall |
| `buckeye` | rounded, low-branched | first to turn: early orange, bare by October |
| `sycamore` | an `OAKS`-style row: massive limbs, mottled bark, white upper limbs | tan-brown fall |
| `buroak` | an `OAKS` row: savanna-wide, thick corky limbs | russet fall |
| `dogwood` | small, layered horizontal tiers | white bracts in April; red in fall |
| `redbud` | multi-trunk, flat-topped spread | magenta along bare limbs, Mar–Apr |
| `crapemyrtle` | multi-trunk vase, mottled bark; v2 pollarded with knuckles | summer cones, a colour per tree: pink, watermelon red, lavender, white |
| `loblolly` | a `PINES` row: tall bare bole, small high crown | none |
| `longleaf` | a `PINES` row: grass stage, bottlebrush sapling, old flat-topped | none |
| `slashpine` | a `PINES` row: a rounder open crown | none |
| `redcedar` | dark columnar spire, on old fields and fence lines | bronze-green in winter |
| `rosebay` | rhododendron thicket by Appalachian streams | white-pink trusses, early summer |

Garden `SPECIES`:
- rhododendron, blooming in May;
- azalea, blooming Mar–May, coloured per plant: hot pink, coral, white or magenta.

Add them to `REGION_GARDEN` for the Southeast, Appalachia and the Mid-Atlantic.

**The materials.**
- **`BLOSSOM` becomes a type, not a boolean.**
  - The types: 1 cherry, 2 dogwood, 3 redbud, 4 crape myrtle, 5 rosebay.
  - Put shared GLSL helpers (bloom colour and timing) in `GLSL_SHARED` (`src/render/shared.ts`,
    around line 108) for `propMaterial` and `leafCards` to share.
  - Crape myrtle and rosebay bloom in summer. Add `U.uSummer` from `season.ts`, high when the air
    is about 20–24 °C or warmer; set it in `main.ts` beside `uWet`.
- **New `FALL_HUE` values:** 4 jewel, 5 orange (early), 6 russet. Today there are only 1–3.
- **Re-lay the leaf-card flags** in `nearTrees.ts` and the decode in `leafCards.ts`, both together.
  The aspen's flutter must still work.
  - Today: `falls 1 + 2·hue (2 bits) + 8·bloom + 16·flutter`.
  - New: `falls 1 + 2·hue (3 bits) + 16·bloom type (3 bits) + 128·flutter`.
- **`pack.ts`:** the `PMat` prop's `blossom` becomes a number.
- **Kind sets:** update every set that a new kind belongs in:
  - `NEEDLED`, `DECIDUOUS`, `FALL_HUE`, `NEAR_KINDS`, `FLUTTER`, `LEAFLESS`;
  - in `props.ts`, the kind constants and heights.

**Placement.**
- **`REGION_BROAD`:**
  - tulip tree, hickory and buckeye in Appalachia and the Midwest woods;
  - sweetgum in the Southeast and the Mid-Atlantic;
  - sycamore along streams;
  - bur oak on the Midwest and Plains edges;
  - dogwood and redbud as understory and yard trees, from the Mid-Atlantic south and in the
    Midwest;
  - crape myrtle on streets and in yards in Texas, the Southeast, the Gulf and Florida;
  - redcedar on old fields east of the Plains.
- **`coniferMix`**, the southern pines in the southeast, gulf and florida regions and Texas's L3 35:
  - loblolly in the Piedmont and in plantations;
  - longleaf on the sandhills and the coastal plain;
  - slash pine in Florida and on the Gulf.
- **`rosebay`** near streams in Appalachia.

**Tests**, small and targeted:
- **`foundry.test.ts`:** the budgets and shape of each new kind.
- **`streetTrees.test.ts`**, the range rules:
  - no crape myrtle in the North;
  - longleaf only on the southern coastal plain;
  - rosebay only in Appalachia;
  - no sweetgum in the West.
- **The flags:** a round-trip test of the new layout.

**Close out:**
- mark #4 built in `models.md`;
- add the blossom types and flags to `docs/agent/rendering.md`;
- update `LOG.md` and `feature_list.json`;
- commit, push and check CI.

## After #4

Robby, 2026-10-05: "continue on what you were originally doing … just make note of person thing" and
"you can keep doing trees and vegetation if unfinished … just ensure that is maintained". So the
vegetation packages go on in order (#5 next); the people work is noted as `people-with-purpose` in
`feature_list.json` (rank 11.45: walkers on errands, homes private, buildings with a capacity, smooth
blended animation, a built-in rig and clip maker — its notes say what the code does now and the plan).
In a cloud session that work is tested headless (`tests/lifeSim.test.ts`) and on the kit page; the
in-game look is checked on Robby's PC.

- **#5:** built (2026-10-05) but for **duckweed** on the swamps' still water — a water-surface paint
  (`world/water.ts`), not a tree: a lime carpet in summer, gone in winter, parting in a wake.
- **#6:** built (2026-10-05) but for the black oak (the Sierra's mixed-conifer oak, gold in the fall)
  and the gray pine of the blue oak's foothills — both could ride a later package.
- **#7:** built (2026-10-05). Rarer desert rows (organ pipe, barrels, chain-fruit cholla, bursage)
  can ride a later package on the same genomes.
- **#8:** built (2026-10-05).
- **#9:** built (2026-10-05) but for smooth cordgrass (the salt marsh: the grass keeps off the shore
  today — a marsh layer of its own by the water).
- **#10:** built (2026-10-05). Cotton, peanuts, rice, orchards, vineyards and hay could follow on the
  same field system (a crop each: a calendar row and a geometry).
- **#11–#16:** the wildlife packages (`regional-wildlife`).
  - The casts go in `faunaMix`, by `CastPlace`.
  - A range-rules test, from `docs/regional-life/ranges.md`.
  - Robby asked for "amazing animation"; each `models.md` row says how its animal moves.
- **Also queued, no keys needed:**
  - the ground under a wood as duff and moss;
  - moss on boulders;
  - the bug `upstairs-over-shopfront`: an upstairs flat's floor and furniture stick out over a
    shopfront (the Bonobos building, Brooklyn).
- **Parked until keys exist:**
  - the canopy layer (NLCD → R2);
  - the OSM genus → kind mapping in `realTile.treeKindOf`, which needs a worker cache bump and a
    deploy;
  - the Mapillary green-spot comparison.

## Robby's rules

- Do the work yourself. Use at most one subagent, for a bounded side task.
- Commit and push after each package. Write a LOG entry each session, and tests for every new
  system.
- Quote Robby's own words in the feature notes.
- Mapillary: never print or commit the token; photos stay in the git-ignored `raw/mapillary/` and
  are never shipped. Never unblur faces or plates. Never use Mapillary Vistas.
- Never use Google Street View. Public places and public data only.
- Ask Robby before anything touching privacy or a big redesign.

## Things that bit us

- Many files are CRLF. A script that edits them must keep the line endings.
- A vitest title with an apostrophe goes in double quotes.
- **Leafless kinds** (`snag`): the leaf merge is guarded, and `crownR` has a floor of 0.6.
- **Conifer clumps** are *sprays* (`lobe(…, { dir, stretch, bend })`). Flat blobs read as stacked
  plates on a pole.
- **Hangers:** each type keeps its own host list, and `props.ts` skips an empty geometry.
- **Terrain:** `heightAt` is absolute elevation (sea level is 0), and the virtual-region test
  terrain is flat. Elevation-band tests pass the elevation in directly.
- **vitest silences console output.** A scratch test (`tests/_dbg.test.ts`, git-ignored) writes to
  a file via `(await import('node:fs'))` with `// @ts-ignore`. Delete it before typecheck:
  `@types/node` isn't installed.
- **Killing processes:** `pkill -f <pattern>` matches your own shell. Kill by PID.
- **Chromium needs `tools/pw-proxy.mjs` `proxyArgs()`** behind the session's proxy.
  `tree-studio.mjs` already uses it.
