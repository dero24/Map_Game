[← Regional life](README.md) · the plan: [docs/REGIONAL_LIFE.md](../REGIONAL_LIFE.md)

# The models: every plant and animal the foundry builds

This is the build list for the regional cast: every 3D model the asset foundry (`src/assets/`,
[docs/ASSET_FOUNDRY.md](../ASSET_FOUNDRY.md)) must make so that each of the 16 regions shows its
own plants and animals. It was compiled on 2026-10-04 from the 16 region files and
[nationwide.md](nationwide.md). Every plant and animal they name appears here once, in its own row
or in a row it shares with look-alikes.

How to use it:

- Pick a package from [Build order](#build-order) at the end and build its rows.
- Each row names the genome it grows on. A `row` is new parameters; a `new` is new code.
- Every model lands with validation, a vertex budget in `tests/foundry.test.ts`, its real size and
  its seasons (AGENTS.md rule 9). Mixes go through `plantMix` / `faunaMix`, variants through
  `variantAt`; never a per-town list.
- Track progress in `feature_list.json` (`regional-flora`, `regional-wildlife`), not here. When a
  region file changes, fix this list too.

**The count:** 1,382 models — 46 the foundry has, 1,299 rows on a genome (new parameters), and
37 new genomes or body plans (each introduced by one row). The Northwest package (build order 1)
is built (2026-10-04, commit 94ce999), the live oaks with their hangers (build order 2,
2026-10-05), the northern and mountain forests (build order 3, 2026-10-05), the eastern hardwoods,
the flowering understory and the southern pines (build order 4, 2026-10-05) and the swamps and rivers'
trees (build order 5, 2026-10-05; duckweed still to do); the rest is to do.

[REGIONAL_LIFE.md §6](../REGIONAL_LIFE.md#6-what-the-foundry-builds-in-order) orders the work by
family. This list is the same order broken into rows: its P1 rows are §6's families plus each
region's headline from §5, and the build order turns them into packages.

"Amazing animation" here means each animal moves like itself: the heron stalks, freezes and
strikes; the turkey vulture teeters on a V; the deer stamps, then bounds with its white flag up;
the squirrel spirals round a trunk. Each row's last wide column says what that is.

## How to read the tables

| Column | Meaning |
|---|---|
| id | Kebab-case key. The InstancedMesh name is `family:id[:variant]` (ASSET_FOUNDRY.md checklist step 4). |
| Name | Common name; the scientific name where the source gives one. |
| Build | `have: <kind>` exists now. `row: <genome>` is new parameters on a genome. `new: <genome>†` is a new genome or body plan, and this row introduces it. Text after a dash is the key parameter. |
| Regions | Keys from REGIONAL_LIFE.md §2, or the shorthand below. |
| C | How common: C common, O occasional, R rare. The most common status across its regions. |
| Size | Real size. Plants: height (and spread). Animals: body length, tail included where noted; wingspan for big birds. |
| Seasons / states | What changes through the year: autumn colour, bare in winter, bloom months, winter coat, migration. |
| Animation & behaviour | Plants: how the wind moves it. Animals: gaits, idles and the signature behaviour. |
| P | P1: §6's families and each region's headline. P2: common, or part of a region's signature. P3: the rest. |

**Region shorthand.** `all`: all 16. `east`: new-england, upstate-ny, mid-atlantic, appalachia,
southeast, florida, gulf, midwest, ozarks. `west`: rockies, desert-sw, great-basin, california,
pnw. `south`: southeast, florida, gulf, texas. `all but X`: all 16 except those named.

**What exists now** (read from the code, 2026-10-04):

- Trees, `TREE_KINDS` in `flora.ts`: round, oak (a street oak: red, pin, white), shrub, pine (a
  windswept pitch pine), spruce (conical whorls), palm (curved trunk, feather fronds), birch (a
  clump of white stems), mesquite (multi-trunk; variant 2 is a palo verde), fanpalm (Washingtonia
  with its skirt), maple (sugar or red; variant 2 is the bigleaf maple), willow (weeping), elm
  (American vase), poplar (Lombardy; dark, the Italian cypress), magnolia (southern), cherry
  (flowering). Three variants each, a far model and a near model with leaf cards.
- Garden plants, `SPECIES` in `flora.ts`, on six forms: mound (hydrangea, rose, hibiscus), clipped
  (boxwood), rosette (hosta, agave, fern), spike (lavender), clump (daylily, beach grass), stem
  (coneflower, sunflower).
- Wild grass tufts (`world/grass.ts`) and ground paint (`groundPaint.ts`).
- Animals, `CRITTERS` in `fauna.ts`. Four-legged base builds squirrel, rabbit, deer and fox, with
  rows coyote, jackrabbit, snowshoe, groundSquirrel and muleDeer. The bird plan (`birdGeometry`)
  with rows songbird (tinted), sandpiper, hawk, roadrunner, quail and ibis. Butterfly (tinted
  cards) and firefly. Outside the foundry: the life sim's gull (`sim/life.ts`) and the walkers'
  dog (`dogLib`).

**Rules for rows.**

- A `row` keeps a genome's skeleton and changes numbers: size, colours, counts, angles, a part on
  or off. Teaching the genome a new parameter is part of the first row that needs it.
- A row picks the genome whose silhouette is closest at walking distance. A vine maple is the
  mesquite's multi-stem plan in maple leaves; a crape myrtle is the same plan with mottled bark.
- Look-alikes share a row. Species a walker can't tell apart at painting scale are one model with
  tints, named together.
- Trees are fitted to real size by `treeMeta` and LiDAR, so a tree's height here is a target.
- Small animals are drawn 1.3-2× life size (ASSET_FOUNDRY.md); the sizes here are the real ones.
- `bird` means the shared `birdGeometry` plan when no existing row is close. Bird rows that say
  `+neck`, `+swim`, `+bill` and so on use the plan extensions in [Shared parts](#shared-parts).

**Motion words.** Plants: *sway* (the crown leans and returns), *flutter* (leaves tremble on flat
stalks), *shimmer* (pale undersides flash), *toss* (fronds lift and clack), *swing* (strands and
tresses swing like pendulums), *bend* (stems bow in waves), *ripple* (a carpet or field runs with
waves), *nod* (flower heads bob on their stems), *stiff* (no visible motion), *bob* (rides the
water), *drift* (moves with surge or current). Animals: walk, trot, bound, gallop, stot, hop,
scamper, climb, waddle, swim, paddle, dive, flap, glide, soar, hover, wade, slither, crawl,
scuttle, pulse.

## New genomes and body plans

Each is introduced by one row (marked `new`) and then carries the rows that say `row: <name>†`.

| Genome | What it grows | Introduced by | Carries | P |
|---|---|---|---|---|
| conifer† | A tall conifer with whorls of drooping sprays, J-curved branches, a nodding or stiff leader, a flared fluted base | Douglas fir | western redcedar, western hemlock, Sitka spruce, true firs, hemlocks, coast redwood, giant sequoia, cedars, Norway spruce | P1 |
| hanger† | Epiphytes grown on a tree's `TreePlan` boughs: strands, mats along limb tops, balls and tufts, brooms | hanging mosses | Spanish moss, resurrection and licorice ferns, ball moss, lace lichen, Usnea, mistletoes, air plants | P1 |
| surface† | A shader term (not a mesh) by the region's damp: moss and lichen on bark, rock, roofs and walls | moss on bark | boulder moss, bark and rock lichens, desert varnish, moss roofs | P1 |
| liveoak† | A tree kind: low horizontal limbs sweeping out two or three times the height, some resting on the ground, evergreen billows | southern live oak | coast, plateau, sand, canyon and interior live oaks, southwestern evergreen oaks, banyan | P1 |
| cypress† | A buttressed, flared trunk with knees round it, a feathery crown that flattens with age; deciduous | bald cypress | pond cypress, water and swamp tupelo bases, cypress knees | P1 |
| columnar† | A ribbed green column with arms, spine clusters, holes, flower crowns | saguaro | organ pipe, senita, barrels, hedgehogs, pincushions | P1 |
| opuntia† | Jointed segments, flat pads or cylinders, with fruit on the rims | Engelmann prickly pear | the prickly pears and chollas | P1 |
| cane† | Unbranched canes or stalks from one base, with nodes, leaves and tip flowers | ocotillo | reeds, giant cane, knotweed, red-osier dogwood, salmonberry, devil's club, corn, sorghum, sugar cane | P1 |
| yucca† | Rosettes of bayonet leaves on shaggy, branching trunks, with flower stalks | Joshua tree | the yuccas | P1 |
| vine† | A leafy skin grown over a host: a mantle over a tree or pole, a wrap up a trunk, a wall or fence cover, lianas from crowns, trellis rows | kudzu | ivies, grapes, wisteria, honeysuckle, poison ivy, Virginia creeper, vineyards, hops | P1 |
| floating† | Pads and rosettes on the water surface, flower stalks above | American lotus | spatterdock, water hyacinth, water lettuce | P2 |
| mangrove† | Arching prop roots into water under a dense crown; fields of breathing roots | red mangrove | black and white mangroves | P2 |
| kelp† | Seaweed strands with floats that drift in the surge; beach-cast heaps | giant kelp | bull kelp, rockweed, eelgrass, sargassum | P3 |
| mushroom† | Caps, shelves and corals on the ground and on wood | fly agaric | chanterelles, shelf conks, morels | P3 |
| antlers† | Add-on: a beam with tines, or a palm, grown and shed by the calendar | (shared part) | white-tailed deer bucks, elk, moose, mule deer, axis, sika | P1 |
| horns† | Add-on: curls, prongs, daggers, spirals and bovid hooks | (shared part) | pronghorn, bighorn, mountain goat, bison, cattle, aoudad, blackbuck | P1 |
| bear† | A four-legged base build: heavy, flat-footed, a shoulder hump option | black bear | grizzly | P1 |
| bovid† | A heavy hoofed base build: deep barrel, short legs, a hump option | American bison | cattle, feral hog, javelina | P1 |
| armadillo† | A banded shell over a small four-legged body | nine-banded armadillo | (alone) | P1 |
| swimmer† | A marine mammal: torpedo body, flippers, flukes or a paddle, an optional fin | West Indian manatee | dolphins, porpoises, whales | P1 |
| pinniped† | A seal or sea lion, hauling out and swimming | harbor seal | gray seal, sea lions, elephant seal | P2 |
| bat† | Membrane wings on a small body, erratic flight | big brown bat | the other bats | P2 |
| primate† | A small monkey | rhesus macaque | (alone) | P3 |
| sprawler† | Four splayed legs, long body and tail, a side-to-side walk | American alligator | crocodile, the lizards, salamanders and newts | P1 |
| turtle† | A shell over head, legs and tail; flipper option | painted turtle | turtles, tortoises, sea turtles | P1 |
| snake† | A long tapering body that bends in waves | common garter snake | the snakes, legless lizards, amphiumas, sirens | P2 |
| frog† | A frog or toad: folded hind legs, a hop, a calling throat | American bullfrog | the frogs and toads | P2 |
| dragonfly† | Four straight wings, a long abdomen, hover and dart | common green darner | dragonflies and damselflies | P1 |
| bug† | A six-legged insect: head, thorax, abdomen, wing or shell cards | annual cicada | beetles, bees, wasps, grasshoppers, crickets, mantises, lanternflies, flies | P1 |
| swarm† | A cloud of tiny specks that follows a walker or hangs over water | mosquitoes | black flies, midges, gnats, brine flies | P3 |
| spider† | Eight legs on a two-part body, with a web card | yellow garden spider | the spiders, tarantulas, scorpions | P2 |
| crawler† | A segmented, many-legged or legless crawler | woolly bear caterpillar | caterpillars, millipedes, centipedes, worms | P3 |
| slug† | A slug, with a shell option | Pacific banana slug | slugs, snails, apple snails | P1 |
| crab† | A crab: carapace, claws, walking legs; long-tailed option | Atlantic marsh fiddler crab | crabs, crayfish, lobsters, shrimp, horseshoe crab | P1 |
| fish† | A fish: body, fins and tail; swim, school and leap | Pacific salmon | trout, mullet, tarpon, sharks, rays | P2 |
| jelly† | A bell with tentacles that pulses | moon jelly | the jellies, man o' war | P3 |
| tidepool† | Radial and soft animals that stay put | ochre sea star | anemones, urchins, chitons, nudibranchs | P3 |
| shell† | Shells, clusters and beds on sand, rock and mud | eastern oyster | mussels, clams, whelks, barnacles | P3 |
| sign† | What animals leave: mounds, lodges, nests, webs, holes, chimneys | beaver lodge and dam | ant mounds, crawfish chimneys, nests, webs | P1 |

## Shared parts

Parts and plan extensions that many rows need. Build them with the first row that uses them.

| id | Name | Build | Used by | C | Size | Seasons / states | Animation & behaviour | P |
|---|---|---|---|---|---|---|---|---|
| antlers | Antlers: a beam and tines, or a palm | new: antlers† | white-tailed deer, mule deer, black-tailed deer, elk, moose, axis, sika, fallow deer | C | 0.3 m (deer) to 1.2 m (moose) spread | grow in velvet Apr-Aug, hard Sep, shed Jan-Mar | ride the head; rub on saplings; bucks spar Oct-Nov | P1 |
| horns | Horns: curls, prongs, daggers, spirals, hooks | new: horns† | pronghorn, bighorn, mountain goat, aoudad, blackbuck, bison, cattle, Texas longhorn | C | 0.1-2 m | permanent (pronghorn sheaths shed Nov) | rams back up and clash in fall | P1 |
| coat-patterns | Coat patterns: stripes, rings, spots, masks, saddles | row: quad params | raccoon, skunks, chipmunks, ringtail, coati, axis deer, bobcat, ocelot, badger | C | — | winter coats grayer and thicker | — | P1 |
| quad-tails | Tail types: paddle, naked, ringed, bobbed, plume, hair | row: quad params | beaver, muskrat, opossum, raccoon, bobcat, skunk, horse | C | — | — | tail-slap, flag, flick, swish | P1 |
| quad-long | Long low body (mustelid) | row: fox params | otters, mink, weasel, fisher, marten, badger, wolverine | O | — | — | bounding lope; otters porpoise and slide | P3 |
| bird-neck | Long neck: an S that folds and strikes | row: bird plan | herons, egrets, cranes, storks, geese, swans, cormorants, anhinga, loons | C | — | — | neck folds in flight (herons) or stretches (cranes, geese) | P1 |
| bird-bills | Bill shapes: flat, pouch, spoon, dagger, hook, cone, needle, crossed, keel | row: bird plan | ducks, pelicans, spoonbill, herons, raptors, finches, hummingbirds, crossbills, skimmer | C | — | — | pelican pouch swells when it fishes | P1 |
| bird-swim | Swimming and diving pose | row: bird plan | ducks, geese, swans, loons, grebes, cormorants, gulls, coots | C | — | — | floats, paddles, tips up, dives | P1 |
| bird-display | Display parts: fan tail, ruff, air sacs, crests, tail streamers | row: bird plan | wild turkey, sage-grouse, prairie-chickens, scissor-tailed flycatcher, grackles | O | — | spring displays | strut, boom, dance | P2 |
| bird-bare-head | Bare heads and wattles | row: bird plan | turkey vulture, black vulture, condor, wild turkey, wood stork, muscovy duck | C | — | — | — | P1 |
| bird-hover | Hovering flight | row: bird plan | hummingbirds, kestrel, kingfisher, white-tailed kite, osprey, terns | C | — | — | wings blur; body holds still | P2 |

<!-- counts -->

## 1. Trees

### 1.1 Broadleaf trees

| id | Name | Build | Regions | C | Size | Seasons / states | Animation & behaviour | P |
|---|---|---|---|---|---|---|---|---|
| southern-live-oak | Southern live oak | new: liveoak† — limbs sweep out, some to the ground | mid-atlantic, south | C | 12-20 m tall, 25-40 m wide | evergreen; drops leaves and flushes yellow-green Mar; pollen tassels | slow heavy sway of the outer limbs; the moss swings | P1 |
| plateau-live-oak | Plateau (escarpment) live oak | row: liveoak† — smaller, multi-trunk motts | texas | C | 8-12 m | evergreen; flush Mar | sway; ball moss tufts on the limbs | P1 |
| coast-live-oak | Coast live oak | row: liveoak† — dense round crown, sinuous low limbs | california | C | 10-25 m, wider than tall | evergreen; cupped spiny leaves | sway; lace lichen swings in the fog belt | P1 |
| sand-live-oak | Sand live oak | row: liveoak† — shrubby, wind-sheared | florida, gulf | C | 3-8 m | evergreen | stiff sway | P3 |
| canyon-interior-live-oak | Canyon and interior live oaks | row: liveoak† | california | O | 6-20 m | evergreen; canyon oak's gold-felted undersides | sway | P3 |
| engelmann-oak | Engelmann oak | row: liveoak† — blue-gray leaves | california | R | 6-15 m | evergreen | sway | P3 |
| sky-island-oaks | Emory, Arizona white, silverleaf, Chisos and gray oaks | row: liveoak† — small, open | desert-sw, texas | O | 5-15 m | evergreen or nearly; silverleaf's silver undersides | sway; silverleaf shimmers | P3 |
| mexican-blue-oak | Mexican blue oak | row: oak — blue-gray | desert-sw | O | 5-10 m | semi-evergreen | sway | P3 |
| northern-red-oak | Northern red oak | have: oak | new-england, upstate-ny, mid-atlantic, appalachia, midwest, ozarks, plains | C | 18-25 m | bare Nov-Apr; red-brown fall | sway; heavy limbs show in winter | P2 |
| pin-oak | Pin oak | have: oak — wants its pyramid: low limbs droop, top limbs upswept | new-england, mid-atlantic, appalachia, midwest, ozarks | C | 18-22 m | russet fall; brown leaves hang all winter | sway; dead leaves rattle in winter | P2 |
| white-oak | White oak | have: oak | east | C | 20-25 m | wine to brown fall | sway | P2 |
| black-scarlet-oak | Black and scarlet oaks | row: oak — dark bark | new-england, upstate-ny, mid-atlantic, appalachia, midwest, ozarks | C | 20-25 m | deep red fall | sway | P2 |
| chestnut-oak | Chestnut oak | row: oak — deep gray ridged bark, dry ridgetops | upstate-ny, mid-atlantic, appalachia | C | 20-25 m | orange-brown fall | sway | P2 |
| post-oak | Post oak | row: oak — thick crooked limbs | mid-atlantic, southeast, texas, plains, ozarks | C | 10-15 m | brown fall | sway | P2 |
| blackjack-oak | Blackjack oak | row: oak — small, gnarly, dark | mid-atlantic, southeast, texas, plains, ozarks | O | 6-12 m | brown fall | stiff sway | P3 |
| southern-red-oak | Southern red oak | row: oak | mid-atlantic, southeast, gulf | C | 20-25 m | red-brown fall | sway | P3 |
| willow-oak | Willow oak | row: oak — dense round, narrow leaves | mid-atlantic, appalachia, southeast, gulf, ozarks | C | 18-25 m | yellow-tan fall | sway | P2 |
| water-oak | Water oak | row: oak — small spoon leaves | southeast, florida, gulf, texas | C | 20-25 m | semi-evergreen | sway | P2 |
| laurel-oak | Laurel oak | row: oak — glossy narrow leaves | southeast, florida, gulf | C | 18-25 m | nearly evergreen | sway | P2 |
| turkey-oak | Turkey oak | row: oak — small, crooked, sandhills | southeast, florida | O | 6-12 m | red fall; leaves stand on edge | stiff sway | P3 |
| bottomland-oaks | Nuttall, overcup, cherrybark and swamp chestnut oaks | row: oak — tall straight trunks | gulf | C | 20-30 m | brown-red fall | sway | P3 |
| bur-oak | Bur oak | row: oak — massive open-grown spread, corky twigs | appalachia, plains, midwest, ozarks, texas | C | 20-30 m | brown fall; fringed acorn caps | slow heavy sway | P1 |
| chinkapin-oak | Chinkapin oak | row: oak | appalachia, midwest, ozarks, texas | O | 15-25 m | yellow-brown fall | sway | P3 |
| swamp-white-oak | Swamp white oak | row: oak — two-tone leaves | midwest | O | 15-20 m | brown fall | sway | P3 |
| shumard-oak | Shumard and Texas red (Spanish) oaks | row: oak — bristle-tipped lobes | texas, ozarks | C | 12-25 m | red-orange late Nov | sway | P2 |
| lacey-monterrey-oak | Lacey and Monterrey (Mexican white) oaks | row: oak — blue-gray / semi-evergreen | texas | O | 6-15 m | late, subtle | sway | P3 |
| valley-oak | Valley oak | row: oak — huge spread, weeping outer branches | california | C | 20-30 m | bare Dec-Mar | sway; outer branches hang and swing | P1 |
| blue-oak | Blue oak | row: oak — compact, blue-gray, pale bark | california | C | 6-15 m | bare Dec-Mar | sway | P1 |
| california-black-oak | California black oak | row: oak | california | C | 10-25 m | pink-red new leaves; yellow fall (Yosemite) | sway | P2 |
| oregon-white-oak | Oregon white (Garry) oak | row: oak — gnarled, moss and mistletoe | pnw, california | C | 15-25 m | brown fall | sway | P2 |
| tanoak | Tanoak | row: round | california | C | 15-30 m | evergreen; gray dead patches (sudden oak death) | sway | P3 |
| sugar-maple | Sugar maple | have: maple | new-england, upstate-ny, appalachia, midwest, ozarks | C | 18-25 m | orange-red-yellow early to late Oct; bare | sway | P1 |
| red-maple | Red maple | have: maple | east, pnw, rockies | C | 12-18 m | red flower haze Mar; scarlet Sep-Oct; red seeds Jan (FL) | sway | P1 |
| silver-maple | Silver maple | row: maple — wide, spreading | new-england, upstate-ny, appalachia, midwest, plains, ozarks | C | 15-25 m | first flowers Mar; pale yellow fall | shimmer: silver undersides flash | P2 |
| norway-maple | Norway maple | row: maple — very dense round; purple 'Crimson King' | new-england, upstate-ny, mid-atlantic, appalachia, midwest, rockies, great-basin, pnw | C | 12-15 m | green late, then yellow | sway | P2 |
| freeman-maple | Freeman ('Autumn Blaze') maple | row: maple — upright oval | upstate-ny, midwest, plains, rockies | C | ~15 m | red fall | sway | P3 |
| bigleaf-maple | Bigleaf maple | have: maple (v2) — dress with hanging moss and licorice fern | pnw, california | C | 15-30 m | butter-yellow Oct; moss green all year | heavy sway; moss curtains swing | P1 |
| vine-maple | Vine maple | row: mesquite — arching multi-stem, maple leaves | pnw | C | 5-8 m | scarlet, orange and yellow Oct | arching stems bob | P1 |
| bigtooth-maple | Bigtooth maple | row: maple — small | great-basin, texas, desert-sw | O | 5-12 m | scarlet-orange late Sep (Wasatch) to Nov (Lost Maples) | sway | P2 |
| striped-maple | Striped maple (moosewood) | row: round — understory, green striped bark | new-england, upstate-ny, appalachia | O | 4-8 m | pale yellow fall | sway | P3 |
| box-elder | Box elder | row: round | all but florida, desert-sw | C | 10-15 m | yellow fall | sway | P3 |
| amur-maple | Amur maple | row: cherry — small, multi-stem | midwest, rockies | O | 5-6 m | red fall | sway | P3 |
| japanese-maple | Japanese maple | row: cherry — low, layered, finely cut | all | C | 3-7 m | red-purple or green; vivid scarlet fall | flutter of fine leaves | P2 |
| paper-birch | Paper (white) birch, incl. European white birch | have: birch | new-england, upstate-ny, midwest, plains, rockies, pnw | C | 12-20 m | clear yellow fall; white trunks in snow | flutter | P2 |
| gray-birch | Gray birch | row: birch — leaning clumps, dull white, black triangles | new-england | C | 8-10 m | yellow fall | flutter | P3 |
| yellow-birch | Yellow birch | row: birch — bronze curling bark, stilt roots on stumps | new-england, upstate-ny, appalachia | C | ~20 m | yellow fall | sway | P2 |
| black-birch | Black (sweet) birch | row: birch — dark cherry-like bark | new-england, appalachia | O | 15-20 m | yellow fall | sway | P3 |
| river-birch | River birch | row: birch — salmon peeling bark, multi-trunk | east | C | 10-15 m | yellow fall | flutter | P2 |
| water-birch | Water birch | row: birch — shrubby clumps, copper bark | rockies, great-basin | O | 6-10 m | yellow fall | flutter | P3 |
| quaking-aspen | Quaking aspen | row: birch — single white stems with black eyes, clonal groves | rockies, great-basin, pnw, california, new-england, upstate-ny, midwest, plains | C | 10-20 m | lime-green late May; gold mid-late Sep; white and bare in winter; elk-chewed bark | flutter: round leaves tremble on flat stalks, the grove shimmers | P1 |
| bigtooth-aspen | Bigtooth aspen | row: birch | new-england, upstate-ny, midwest | O | 15-20 m | gold fall | flutter | P3 |
| red-alder | Red alder | row: birch — pale bark blotched white with lichen, oval crown | pnw | C | 15-25 m | drops its leaves green; catkins | sway | P1 |
| white-alder | White alder | row: birch | california | O | 10-20 m | catkins | sway | P3 |
| eastern-cottonwood | Eastern and plains cottonwood | row: oak — massive, broad; deeply furrowed gray bark | plains, midwest, east, texas, rockies | C | 25-30 m | cotton fluff Jun; gold Oct; often a lone landmark | flutter: triangular leaves rattle | P1 |
| fremont-cottonwood | Fremont cottonwood | row: oak — broad, pale bark | desert-sw, great-basin, california | C | 20-30 m | gold Nov against red cliffs | flutter | P1 |
| narrowleaf-cottonwood | Narrowleaf cottonwood | row: round — willow-like leaves | rockies, great-basin | C | 15-20 m | gold early Oct | flutter | P2 |
| black-cottonwood | Black cottonwood | row: round — tall | pnw, rockies | C | 30-45 m | cotton Jun; gold fall | flutter | P2 |
| lombardy-poplar | Lombardy poplar | have: poplar | all | C | 20-25 m | gold fall | flutter | P2 |
| weeping-willow | Weeping willow | have: willow | all | C | 10-15 m | first green in spring; yellow fall | swing: tresses swing | P2 |
| black-willow | Black and peachleaf willows | row: round — leaning, narrow leaves | east, texas, plains | C | 10-15 m | yellow fall | sway | P3 |
| goodding-willow | Goodding willow | row: round | desert-sw | C | 10-15 m | yellow fall | sway | P3 |
| arroyo-red-willow | Arroyo and red willows | row: shrub — tall | california | C | 5-10 m | yellow fall | sway | P3 |
| american-elm | American elm | have: elm | east, plains, texas | O | 20-30 m | yellow fall | sway | P2 |
| siberian-elm | Siberian elm | row: elm — scrappy, small leaves | plains, rockies, great-basin, desert-sw, texas | C | 12-20 m | seed drifts in spring; yellow | sway | P2 |
| cedar-elm | Cedar elm | row: elm — small rough leaves, corky twigs | texas | C | 12-18 m | yellow fall | sway | P2 |
| chinese-elm | Chinese elm | row: round | plains, desert-sw, california | O | 10-15 m | late yellow | sway | P3 |
| japanese-zelkova | Japanese zelkova | row: elm — vase | new-england, upstate-ny, mid-atlantic, appalachia | C | 15-20 m | rusty fall | sway | P3 |
| white-ash | White ash | row: round — diamond bark; dying to gray snags | new-england, upstate-ny, appalachia, midwest, ozarks | C | 20-25 m | purple-bronze fall | sway | P2 |
| green-ash | Green ash | row: round | plains, midwest, rockies, gulf, texas | C | 15-20 m | yellow fall | sway | P2 |
| southwest-ashes | Arizona, Modesto, Raywood and Mexican ashes | row: round | desert-sw, california, texas | C | 10-15 m | yellow fall | sway | P3 |
| blue-oregon-ash | Blue and Oregon ashes | row: round | appalachia, pnw, california | O | 15-20 m | yellow fall | sway | P3 |
| littleleaf-linden | Littleleaf linden | row: round — neat pyramid | new-england, upstate-ny, mid-atlantic, midwest, plains, rockies, great-basin, pnw | C | 12-18 m | fragrant pale-yellow Jun bloom humming with bees | sway | P2 |
| american-basswood | American basswood | row: round — lopsided heart leaves | upstate-ny, appalachia, midwest | C | 25-30 m | fragrant Jun bloom | shimmer | P3 |
| tulip-tree | Tulip tree (yellow poplar) | row: round — ramrod clear trunk, high crown | mid-atlantic, appalachia, southeast, midwest | C | 25-35 m (50 m in coves) | green-orange tulips May; clear yellow fall | sway high up | P1 |
| sweetgum | Sweetgum | row: round — pyramidal, star leaves | mid-atlantic, appalachia, south, ozarks, california, pnw | C | 18-25 m | purple, red, orange and yellow on one tree in Nov; gumballs litter walks | sway | P1 |
| black-gum | Black gum (tupelo) | row: round — horizontal limbs | mid-atlantic, appalachia, southeast, florida, ozarks | C | 15-20 m | the first and brightest scarlet, early fall | sway | P2 |
| american-sycamore | American sycamore | row: oak — white mottled upper limbs, leaning over water | mid-atlantic, appalachia, southeast, midwest, ozarks, upstate-ny, gulf, texas, plains | C | 25-35 m | dull brown-yellow fall; ghostly white limbs bare in winter | sway; bark peels in plates | P1 |
| london-plane | London plane | row: oak — camouflage bark, seed balls in pairs | mid-atlantic, new-england, upstate-ny, appalachia, midwest, great-basin, california, pnw | C | 20-30 m | dull brown-yellow fall | sway; seed balls swing | P2 |
| california-sycamore | California sycamore | row: oak — leaning, twisting, patchwork bark | california | C | 15-25 m | gold-brown fall | sway | P2 |
| arizona-sycamore | Arizona and Mexican sycamores | row: oak — ghost-white twisting limbs over canyon creeks | desert-sw, texas | C | 15-25 m | gold fall | sway | P2 |
| shagbark-hickory | Shagbark hickory | row: round — tall, bark peeling in long strips | new-england, upstate-ny, appalachia, midwest, ozarks | C | 20-25 m | gold fall | sway | P1 |
| hickories | Pignut, mockernut, bitternut and black hickories | row: round — tall | upstate-ny, appalachia, midwest, ozarks | C | 20-30 m | gold fall | sway | P2 |
| black-walnut | Black walnut | row: round — dark diamond bark, long leaves | upstate-ny, appalachia, midwest, plains, ozarks | C | 20-30 m | drops leaves early; green husks fall | sway | P2 |
| arizona-walnut | Arizona walnut | row: round | desert-sw | O | 10-15 m | yellow fall | sway | P3 |
| pecan | Pecan | row: oak — tall, pinnate leaves | gulf, texas, southeast | C | 25-30 m | nuts fall Oct-Nov; yellow fall | sway | P2 |
| honeylocust | Honeylocust (thornless) | row: round — airy vase, tiny leaflets | all but florida, gulf, desert-sw | C | 12-18 m | brief yellow; leaves vanish into lawns | flutter; dappled light | P2 |
| black-locust | Black locust | row: round — open, rope-like bark | all | C | 12-20 m | white flower clusters May | sway | P2 |
| kentucky-coffeetree | Kentucky coffeetree | row: round — coarse bare twigs, big pods | appalachia, midwest, plains, rockies | O | 15-20 m | pods all winter | sway | P3 |
| northern-catalpa | Northern catalpa | row: round — huge heart leaves | appalachia, midwest, plains, great-basin | O | 12-18 m | white orchid-like flowers Jun; bean pods all winter | sway; pods swing | P3 |
| princess-tree | Princess tree (Paulownia) | row: round — huge leaves | appalachia, southeast | O | 10-15 m | lavender flowers Apr on roadcuts | sway | P3 |
| tree-of-heaven | Tree of heaven | row: round — smooth gray bark, huge pinnate leaves | all | C | 10-20 m | tan-pink seed clusters | sway | P2 |
| white-mulberry | White mulberry | row: round — lumpy | all | C | 8-12 m | purple fruit stains walks Jun | sway | P3 |
| osage-orange | Osage orange | row: round — thorny, orange bark; hedgerow rows | appalachia, plains, midwest, ozarks | C | 10-15 m | green hedge apples fall Oct | sway | P2 |
| russian-olive | Russian olive | row: round — silver narrow leaves, thorny | plains, rockies, great-basin, desert-sw, pnw | C | 5-10 m | silver all season | shimmer | P3 |
| chinese-tallow | Chinese tallow | row: round — diamond leaves on long stalks | southeast, gulf, texas | C | 8-12 m | red, orange and purple Nov; white "popcorn" seeds in winter | flutter | P2 |
| chinaberry | Chinaberry | row: round — lacy leaves | gulf, texas | O | 10-15 m | lavender flowers; yellow berries all winter | sway | P3 |
| camphor-tung | Camphor and tung trees | row: round | gulf | O | 10-15 m | evergreen (camphor) | sway | P3 |
| chinese-pistache | Chinese pistache | row: round | texas, california | C | 8-12 m | red-orange fall | sway | P3 |
| ginkgo | Ginkgo | row: round — gawky when young, fan leaves | mid-atlantic, new-england, upstate-ny, midwest, southeast, ozarks, california | O | 15-20 m | butter-yellow Nov, dropped in a day | sway | P3 |
| pnw-street-trees | Katsura, Persian ironwood, hornbeam | row: round | pnw | C | 10-15 m | yellow to red fall | sway | P3 |
| japanese-pagoda-tree | Japanese pagoda tree | row: round | great-basin | O | 10-15 m | cream summer flowers | sway | P3 |
| hackberry | Hackberry, sugarberry and netleaf hackberry | row: round — warty corky bark | appalachia, plains, midwest, ozarks, southeast, gulf, texas | C | 12-20 m | yellow fall; mistletoe in winter | sway | P2 |
| black-cherry | Black cherry | row: round — "burnt potato chip" bark | new-england, upstate-ny, mid-atlantic, appalachia, midwest, southeast, ozarks | C | 15-20 m | white flower strings May; black fruit | sway | P3 |
| sassafras | Sassafras | row: round — mitten leaves | mid-atlantic, appalachia, southeast, midwest, ozarks | C | 10-15 m | orange-red fall | sway | P3 |
| persimmon | Persimmon | row: round — black block bark | southeast, gulf | O | 10-15 m | orange fruit after frost | sway | P3 |
| sourwood | Sourwood | row: round — often leaning | appalachia, southeast | C | 10-15 m | white bell sprays Jul; first and deepest scarlet; seed sprays hang | sway | P2 |
| yellow-buckeye | Yellow buckeye | row: round — palmate leaves, smooth gray bark | appalachia | C | 20-30 m | yellow-green flower spikes; early pumpkin-orange fall | sway | P1 |
| ohio-buckeye | Ohio buckeye | row: round — smaller | midwest | O | 10-15 m | early orange fall | sway | P3 |
| california-buckeye | California buckeye | row: round — low, spreading | california | C | 5-12 m | white candles May; brown by Jul, bare silver all summer; hanging pear fruit | sway | P2 |
| cucumber-magnolia | Cucumber magnolia | row: round | appalachia | O | 20-25 m | yellow fall | sway | P3 |
| bigleaf-magnolias | Fraser, bigleaf and umbrella magnolias | row: round — tropical-looking huge leaves | appalachia | O | 10-20 m | creamy flowers May | big leaves flap | P3 |
| southern-magnolia | Southern magnolia | have: magnolia | mid-atlantic, appalachia, south, ozarks, california | C | 15-25 m | evergreen; dinner-plate white flowers May-Jun; red-seeded cones | stiff glossy sway | P2 |
| sweetbay | Sweetbay | row: magnolia — small, silver-backed leaves | southeast, florida, gulf | C | 6-15 m | evergreen | shimmer | P3 |
| southern-bays | Loblolly bay, red bay and swamp bay | row: magnolia — narrow; red bay dying (laurel wilt) | southeast, florida | O | 10-20 m | evergreen | sway | P3 |
| saucer-magnolia | Saucer (Japanese) magnolia | row: cherry | southeast, gulf, midwest | C | 6-8 m | pink flowers Feb-Apr on bare twigs | sway | P3 |
| american-holly | American holly, incl. East Palatka holly | row: magnolia — dense pyramid, spiny leaves | mid-atlantic, appalachia, southeast, gulf, florida | C | 10-15 m | red berries winter; robin flocks | stiff | P2 |
| english-holly | English holly | row: magnolia — small | pnw | C | 5-15 m | red berries | stiff | P3 |
| pacific-madrone | Pacific madrone | row: mesquite — leaning red trunks peeling to green | pnw, california | C | 10-25 m | evergreen; red berries; bark curls | sway | P2 |
| texas-madrone | Texas madrone | row: mesquite — red and cream bark | texas | R | 5-10 m | evergreen; red berries | sway | P3 |
| california-bay-laurel | California bay laurel | row: round | california | C | 10-25 m | evergreen | sway | P3 |
| callery-pear | Callery ('Bradford') pear | row: round — tight teardrop that splits | east, texas, plains, rockies, great-basin, pnw | C | 9-12 m | white Mar before leaves; red-purple late Nov; whole roadsides white | sway | P2 |
| crabapple | Crabapple | row: cherry — rounded | all but florida, gulf | C | 5-8 m | pink, white or magenta Apr-May; red fruit into winter | sway | P2 |
| flowering-cherry | Flowering cherry (Yoshino, Kwanzan) | have: cherry | mid-atlantic, southeast, new-england, upstate-ny, california, pnw | C | 6-10 m | pale or hot pink late Mar-Apr; petals fall | sway; petals drift down | P2 |
| purple-leaf-plum | Purple-leaf plum | row: cherry — purple leaves | great-basin, california, pnw | C | 5-8 m | pink Mar | sway | P3 |
| mexican-plum | Mexican plum | row: cherry | texas | O | 5-8 m | white Mar | sway | P3 |
| eastern-redbud | Eastern redbud, incl. Texas redbud | row: cherry — low, multi-trunk | east, texas, plains | C | 6-9 m | magenta on bare twigs and trunk Mar-Apr; heart leaves; yellow fall; brown pods | sway | P1 |
| flowering-dogwood | Flowering dogwood | row: cherry — layered horizontal tiers | east, texas | C | 5-9 m | four white (or pink) bracts Apr; burgundy fall; red berries | sway; tiers bob | P1 |
| kousa-dogwood | Kousa dogwood | row: cherry | new-england, mid-atlantic, pnw | C | 5-8 m | pointed white bracts Jun; raspberry fruit | sway | P3 |
| pacific-dogwood | Pacific dogwood | row: cherry | pnw, california | O | 6-12 m | big white bracts Apr-May; pink-red fall | sway | P2 |
| serviceberry | Serviceberry (shadbush, juneberry, sarvis, Utah serviceberry) | row: cherry — small multi-stem, gray striped bark | east, rockies, great-basin | C | 5-8 m | white star haze late Apr; red fall | sway | P2 |
| carolina-silverbell | Carolina silverbell | row: cherry | appalachia | O | 10-15 m | white bells dangle Apr | sway | P3 |
| american-smoketree | American smoketree | row: cherry — small, round leaves | ozarks | R | 5-8 m | smoky plumes; brilliant orange-red fall on glades | sway | P3 |
| japanese-tree-lilac | Japanese tree lilac | row: cherry | upstate-ny, midwest | O | 6-9 m | cream plumes Jun | sway | P3 |
| mimosa | Mimosa (silk tree) | row: cherry — flat umbrella, fern leaves | appalachia, southeast | O | 6-12 m | pink powder-puffs Jul | flutter | P3 |
| jacaranda | Jacaranda | row: cherry — wide, airy | california, florida | C | 8-15 m | lavender clouds May-Jun; purple carpets on walks | sway; petals fall | P2 |
| crape-myrtle | Crape myrtle | row: mesquite — multi-trunk vase, mottled bark; pollarded knuckles variant | mid-atlantic, appalachia, south, ozarks, california, desert-sw | C | 3-8 m | pink, red, lavender or white cones Jun-Sep; orange-red fall; sooty trunks (bark scale) | sway; flower cones nod | P1 |
| texas-persimmon | Texas persimmon | row: cherry — gray-white peeling bark | texas | C | 3-8 m | black fruit | sway | P3 |
| mountain-ash | Mountain ash | row: round — small, pinnate leaves | new-england, upstate-ny | O | 6-10 m | orange-red berry clusters fall | sway | P3 |
| bitter-cherry-cascara | Bitter cherry and cascara | row: round — small | pnw, california | O | 5-12 m | white flowers spring | sway | P3 |
| western-soapberry | Western soapberry and anacua | row: round | texas | O | 8-12 m | yellow fall | sway | P3 |
| gumbo-limbo | Gumbo limbo | row: oak — thick crooked limbs, copper-red peeling bark | florida | C | 10-15 m | brief leaf drop in spring | sway | P2 |
| strangler-fig | Strangler fig | row: round — a net of gray roots over its host (vine† roots) | florida | C | to 15 m | evergreen; aerial roots | sway | P2 |
| hammock-hardwoods | West Indian mahogany, pigeon plum, wild tamarind, Jamaica dogwood, poisonwood (black-spotted orange bark), Spanish stopper, paradise tree | row: round — dense, dark, evergreen | florida | C | 8-15 m | evergreen | sway | P3 |
| banyan | Banyan | row: liveoak† — with prop-root trunks dropping from the limbs | florida | O | 15-25 m, very wide | evergreen | sway; aerial roots hang | P3 |
| red-mangrove | Red mangrove | new: mangrove† — arching prop roots into water | florida | C | 5-15 m | evergreen; pencil seedlings dangle | sway; roots stand in the tide | P2 |
| black-mangrove | Black mangrove | row: mangrove† — fields of pencil breathing roots | florida, gulf, texas | C | 3-10 m | evergreen | sway | P2 |
| white-mangrove | White mangrove | row: mangrove† | florida | C | 5-10 m | evergreen | sway | P3 |
| buttonwood | Buttonwood | row: round — gnarled gray | florida | C | 5-12 m | button seed heads | sway | P3 |
| sea-grape | Sea grape | row: mesquite — multi-stem, round leathery red-veined leaves | florida | C | 2-8 m | leaves redden with age; purple fruit clusters | stiff rattle | P2 |
| black-olive | Black olive (Bucida) | row: oak — dense layered parking-lot shade | florida | C | 10-15 m | evergreen | sway | P3 |
| royal-poinciana | Royal poinciana | row: mesquite — wide umbrella | florida | C | 10-12 m | flame orange-red canopy Jun | sway | P2 |
| tabebuia | Tabebuia (trumpet trees) | row: round | florida | C | 8-12 m | bare and covered in yellow or pink trumpets Mar | sway | P3 |
| ficus | Weeping fig, Indian laurel fig and other ficus | row: round — dense; hedges on clipped | florida, california, desert-sw | C | 10-20 m | evergreen; lifts sidewalks | sway | P3 |
| mango | Mango | row: round — dense dome | florida | C | 10-20 m | evergreen; fruit summer | sway | P3 |
| avocado | Avocado | row: round — dense | florida, california | C | 8-15 m | evergreen; hillside groves | sway | P3 |
| citrus | Citrus (orange, grapefruit, lemon, key lime, satsuma, kumquat) | row: round — globe, fruit | florida, gulf, texas, desert-sw, california | C | 3-8 m | orange-blossom scent Mar; fruit in winter | sway | P2 |
| loquat-fig | Loquat and fig | row: round — small | gulf, desert-sw | O | 4-8 m | loquat fruit spring; fig summer | sway | P3 |
| olive | Olive | row: mesquite — gnarled, silver-green | california, desert-sw | C | 6-10 m | evergreen | shimmer | P3 |
| coral-tree | Coral tree (Erythrina) | row: round | california | O | 8-12 m | red claw flowers | sway | P3 |
| peruvian-pepper-tree | Peruvian pepper tree | row: willow — short weeping tresses | california | C | 8-15 m | pink berries | swing | P3 |
| african-sumac | African sumac | row: willow — small, weeping | desert-sw | O | 6-8 m | evergreen | swing | P3 |
| shoestring-acacia | Shoestring acacia | row: poplar — narrow, weeping | desert-sw | O | 6-10 m | evergreen | swing | P3 |
| blue-gum | Blue gum eucalyptus | row: round — tall, open, bark in peeling strips | california | C | 40-60 m | evergreen; groves hold wintering monarchs | sway; bark strips hang and swing | P2 |
| other-eucalyptus | Red, lemon-scented and sugar gums, red ironbark, silver dollar gum | row: round | california, desert-sw | C | 15-40 m | evergreen | sway | P3 |
| melaleuca | Melaleuca (paperbark) | row: round — white papery bark | florida | C | 10-20 m | bottlebrush flowers | sway | P3 |
| florida-invasive-trees | Schefflera, Java plum, carrotwood | row: round | florida, california | O | 8-15 m | evergreen | sway | P3 |
| ca-street-trees | Victorian box, New Zealand Christmas tree, tipu tree, Brisbane box | row: round | california | C | 8-15 m | NZ Christmas tree red Dec | sway | P3 |
| honey-velvet-mesquite | Honey and velvet mesquite (incl. Chilean and thornless hybrids) | have: mesquite | texas, desert-sw, plains | C | 5-10 m | leafs out last, Apr; long bean pods | sway; airy feathery leaves | P1 |
| screwbean-mesquite | Screwbean mesquite | row: mesquite | desert-sw | O | 5-8 m | spiral pods | sway | P3 |
| foothill-palo-verde | Foothill palo verde | have: mesquite (v2) | desert-sw | C | 4-8 m | bright yellow Apr, a whole valley yellow; leafless most of the year | sway | P1 |
| blue-palo-verde | Blue and Mexican palo verdes (incl. Desert Museum hybrid) | row: mesquite (v2) — blue-green bark | desert-sw | C | 5-10 m | yellow Mar-Apr | sway | P2 |
| desert-ironwood | Desert ironwood | row: mesquite — dense gray-green | desert-sw | C | 5-9 m | lavender-pink pea flowers May | sway | P2 |
| desert-willow | Desert willow | row: mesquite — long narrow leaves | desert-sw, texas, great-basin | C | 4-8 m | pink-lavender trumpets all summer | sway | P2 |
| catclaw-acacia | Catclaw acacia and other acacias | row: mesquite — thorny shrub-tree | desert-sw, texas, florida, california | C | 2-5 m | cream catkins | sway | P3 |
| huisache | Huisache | row: mesquite — thorny | texas | C | 5-9 m | smothered in yellow puffballs Feb | sway | P2 |
| texas-ebony-retama | Texas ebony and retama | row: mesquite — dense dark (ebony), green bark (retama) | texas | C | 6-9 m | retama yellow flowers | sway | P3 |

### 1.2 Conifers

| id | Name | Build | Regions | C | Size | Seasons / states | Animation & behaviour | P |
|---|---|---|---|---|---|---|---|---|
| douglas-fir | Douglas fir | new: conifer† — dense dark spire, sprays all round the twig, thick furrowed bark | pnw, rockies, great-basin, california, desert-sw | C | 50-75 m westside (giants 90 m); 25-40 m inland | evergreen; cones with three-pointed "mouse tail" bracts | boughs bounce, tips droop-sway; the spire nods in a gale | P1 |
| western-redcedar | Western redcedar | row: conifer† — flared fluted base, J-shaped drooping branches, flat lacy sprays, dead "candelabra" top | pnw, rockies | C | 40-60 m | evergreen; stringy red-brown to silver bark in strips | lacy sprays swing from the J-branches | P1 |
| western-hemlock | Western hemlock | row: conifer† — drooping leader and branch tips, feathery | pnw, rockies | C | 40-60 m | evergreen; seedlings on nurse logs | the leader nods; tips droop-sway | P1 |
| sitka-spruce | Sitka spruce | row: conifer† — buttressed giant, stiff blue-green, scaly plated bark | pnw | C | 50-70 m | evergreen | stiff sway | P1 |
| grand-fir | Grand fir | row: conifer† | pnw, rockies | O | 40-60 m | evergreen | droop-sway | P3 |
| noble-silver-fir | Noble and Pacific silver firs | row: conifer† — Cascades, snow-loaded | pnw | O | 40-60 m | evergreen; upright cones | droop-sway | P3 |
| white-fir | White fir | row: conifer† — blue-gray | california, great-basin | C | 30-50 m | evergreen | droop-sway | P2 |
| red-fir | Red fir | row: conifer† | california | C | 40-55 m | evergreen | droop-sway | P3 |
| mountain-hemlock | Mountain hemlock | row: conifer† — snow-bent "J" trunks at treeline | pnw, california | O | 15-30 m | evergreen | droop-sway | P3 |
| eastern-hemlock | Eastern hemlock | row: conifer† — dark, drooping leader, deep shade | new-england, upstate-ny, mid-atlantic, appalachia, midwest | C | 20-30 m | evergreen; many dying gray (woolly adelgid) | the leader nods; sprays droop-sway | P1 |
| cedars-pnw | Alaska yellow cedar and Port Orford cedar | row: conifer† — weeping sprays | pnw | O | 30-50 m | evergreen | sprays swing | P3 |
| incense-cedar | Incense cedar | row: conifer† — like a giant arborvitae, cinnamon shaggy bark | california | C | 30-50 m | evergreen | stiff sway | P2 |
| coast-redwood | Coast redwood | row: conifer† — fluted cinnamon fibrous bark, flat sprays, burls, fairy rings round old stumps | california, pnw | C | 60-110 m | evergreen | stiff sway, high and slow | P1 |
| giant-sequoia | Giant sequoia | row: conifer† — vast orange-red column, fire scars, rounded crown | california, pnw | R | 50-85 m; trunk to 9 m wide | evergreen | stiff | P2 |
| deodar-cedar | Deodar cedar | row: conifer† — drooping tips | southeast, california, pnw | O | 15-25 m | evergreen | droop-sway | P3 |
| norway-spruce | Norway spruce | row: conifer† — dark pyramid, "curtain" branchlets hanging from the limbs | new-england, upstate-ny, mid-atlantic, appalachia, midwest, plains | C | 20-30 m | evergreen; long hanging cones | curtains swing | P2 |
| red-spruce | Red spruce | row: spruce — narrow spire, yellow-green | new-england, upstate-ny, appalachia | C | 20-25 m | evergreen | stiff sway | P1 |
| balsam-fir | Balsam fir | row: spruce — dark narrow spire, purple upright cones | new-england, upstate-ny, midwest | C | 12-20 m | evergreen | stiff sway | P1 |
| fraser-fir | Fraser fir | row: spruce — small spire; silver snag fields on summits | appalachia | O | 10-15 m | evergreen | stiff sway | P2 |
| white-spruce | White spruce (Black Hills spruce) | row: spruce | midwest, plains | C | 15-25 m | evergreen | stiff sway | P3 |
| black-spruce | Black spruce | row: spruce — thin spindly spire, club top | upstate-ny, midwest | C | 5-15 m | evergreen | stiff | P2 |
| colorado-blue-spruce | Colorado blue spruce | row: spruce — stiff silver-blue pyramid to the ground | rockies, plains, great-basin, new-england, upstate-ny, midwest | C | 15-30 m | evergreen | stiff | P2 |
| engelmann-spruce | Engelmann spruce | row: spruce — narrow dark spire; krummholz at treeline | rockies, great-basin, pnw | C | 25-40 m | evergreen; beetle-killed red then gray | stiff sway; flag trees lean downwind | P1 |
| subalpine-fir | Subalpine fir | row: spruce — very narrow spire | rockies, great-basin, pnw | C | 15-30 m | evergreen | stiff sway | P1 |
| norfolk-island-pine | Norfolk Island pine | row: spruce — tall symmetric tiers | florida | O | 20-30 m | evergreen | tiers bob | P3 |
| monkey-puzzle | Monkey puzzle | row: spruce — rope-like scaly limbs | pnw | R | 10-20 m | evergreen | stiff | P3 |
| tamarack | Tamarack | row: spruce — deciduous, soft needle tufts | new-england, upstate-ny, midwest | C | 10-15 m | smoky gold late Oct, then bare | sway | P2 |
| western-larch | Western larch | row: spruce — tall, deciduous, lime-green tufts | rockies, pnw | C | 30-50 m | brilliant gold Oct, then bare | sway | P2 |
| atlantic-white-cedar | Atlantic white cedar | row: spruce — dense narrow spire, shreddy bark | new-england, mid-atlantic, southeast | O | 15-20 m | evergreen; blue-green scale leaves | stiff | P3 |
| northern-white-cedar | Northern white cedar | row: spruce — leaning over water, flat sprays | new-england, upstate-ny, midwest | C | 10-15 m | evergreen | stiff sway | P3 |
| arborvitae | Arborvitae | row: poplar — narrow green column; hedge walls | new-england, upstate-ny, mid-atlantic, appalachia, midwest, plains, rockies, great-basin, pnw | C | 3-8 m | winter bronze | stiff | P2 |
| leyland-cypress | Leyland cypress | row: poplar — fast feathery screen | mid-atlantic, appalachia, southeast, ozarks, pnw | C | 10-20 m | evergreen | stiff sway | P2 |
| italian-cypress | Italian cypress | have: poplar (dark) | california, desert-sw | C | 10-20 m | evergreen | stiff | P3 |
| arizona-cypress | Arizona cypress | row: poplar — blue-gray cone | desert-sw, texas | O | 10-20 m | evergreen | stiff | P3 |
| monterey-cypress | Monterey cypress | row: pine — wind-sculpted flat-topped dark crown on headlands | california | O | 10-25 m | evergreen | stiff sway | P2 |
| eastern-red-cedar | Eastern red cedar | row: poplar — dense dark spire, reddish shreddy bark; twisted on bluffs | east, texas, plains | C | 8-15 m | bronze-brown in winter; frosty blue berries | stiff | P1 |
| ashe-juniper | Ashe juniper ("cedar") | row: mesquite — dense, irregular, shaggy gray-brown bark | texas | C | 5-10 m | orange pollen clouds Jan | stiff | P1 |
| utah-juniper | Utah and one-seed junipers | row: mesquite — twisted multi-trunk, dense scale foliage, silver driftwood snags | great-basin, desert-sw, rockies | C | 3-8 m | dusty blue berries | stiff | P1 |
| western-juniper | Western juniper | row: mesquite — taller, single trunk, spreading over sage | great-basin, pnw | C | 5-15 m | blue berries | stiff | P2 |
| rocky-mountain-juniper | Rocky Mountain juniper | row: poplar — narrow, irregular | rockies, texas, great-basin | C | 5-12 m | blue berries | stiff | P2 |
| alligator-juniper | Alligator juniper | row: mesquite — bark in square checkered plates | desert-sw, texas | O | 10-15 m | evergreen | stiff | P3 |
| southern-red-cedar | Southern red cedar | row: mesquite — wind-pruned thickets on cheniers | gulf | O | 5-10 m | evergreen | stiff | P3 |
| pacific-yew | Pacific yew | row: round — small, dark | pnw | R | 5-15 m | evergreen; red arils | sway | P3 |
| eastern-white-pine | Eastern white pine | row: pine — tall, horizontal tiers, flat wind-swept top on old trees | new-england, upstate-ny, mid-atlantic, appalachia, midwest | C | 25-35 m (45 m) | evergreen; soft blue-green needles | tiers sway; soft needles flutter | P1 |
| pitch-pine | Pitch pine | have: pine | new-england, upstate-ny, mid-atlantic, appalachia | C | 10-15 m | evergreen; fire-blackened trunks resprouting tufts | sway | P2 |
| red-pine | Red pine | row: pine — straight, round crown, orange flaky bark; plantation rows | upstate-ny, midwest | C | 20-25 m | evergreen | sway | P2 |
| jack-pine | Jack pine | row: pine — scrubby | midwest | O | 10-20 m | evergreen; curved closed cones | sway | P3 |
| scots-austrian-pine | Scots and Austrian pines | row: pine — flat crowns with age; Scots' orange upper bark | upstate-ny, plains, rockies, great-basin, texas | C | 15-20 m | evergreen | sway | P3 |
| japanese-black-pine | Japanese black pine | row: pine — leaning picturesque crown | new-england, mid-atlantic | C | 8-15 m | evergreen; many dying (pine wilt) | sway | P2 |
| loblolly-pine | Loblolly pine | row: pine — tall bare trunk, tufted crown at the top, orange plated bark | southeast, mid-atlantic, gulf, texas | C | 25-30 m | evergreen; yellow pollen haze Apr; pine straw | high crown sways; needles drop | P1 |
| longleaf-pine | Longleaf pine | row: pine — brushy tufts at branch tips; grass-stage and bottlebrush stages | southeast, gulf, florida, texas | C | 25-30 m | evergreen; 30-45 cm needles | tufts toss; the grass stage is a green fountain | P1 |
| slash-pine | Slash pine (incl. South Florida slash pine) | row: pine — tall, sparse crown, glossy needles | florida, southeast, gulf | C | 20-30 m | evergreen; orange plated bark over saw palmetto | high crown sways | P1 |
| shortleaf-pine | Shortleaf pine | row: pine — straight, orange-brown plates | ozarks, southeast, appalachia, mid-atlantic, texas | C | 20-30 m | evergreen | sway | P2 |
| virginia-pine | Virginia pine | row: pine — scrubby, twisted | mid-atlantic, appalachia, southeast | C | 10-15 m | evergreen | sway | P3 |
| southern-scrub-pines | Pond, sand, spruce and Table Mountain pines | row: pine — scraggly | southeast, florida, gulf, appalachia | O | 5-20 m | evergreen; persistent or spiny cones | sway | P3 |
| ponderosa-pine | Ponderosa pine | row: pine — tall, open crown, orange-cinnamon jigsaw plates | rockies, great-basin, pnw, california, desert-sw, plains | C | 20-40 m | evergreen; long needles in threes | open tufts sway | P1 |
| jeffrey-sugar-pine | Jeffrey and sugar pines | row: pine — tall; sugar pine's 30-50 cm cones hang from limb tips | california | C | 30-60 m | evergreen | sway; cones swing | P3 |
| lodgepole-pine | Lodgepole pine | row: pine — very straight thin trunks, narrow crown | rockies, pnw, california | C | 15-25 m | evergreen; beetle-killed stands red then gray | sway | P1 |
| high-pines | Limber, whitebark and western white pines | row: pine — wind-twisted, silver dead limbs | rockies, great-basin, california | O | 5-20 m | evergreen | stiff sway | P3 |
| rm-bristlecone | Rocky Mountain bristlecone pine | row: pine — gnarled, bottlebrush needles | rockies | R | 5-12 m | evergreen | stiff | P3 |
| gb-bristlecone | Great Basin bristlecone pine | row: pine — half-dead twisted trunk polished silver-gold, purple cones | great-basin | R | 5-15 m | evergreen; 4,000+ years old | stiff | P2 |
| gray-pine | Gray (foothill) pine | row: pine — sparse gray-green, leaning and forked, big spiny cones | california | C | 15-20 m | evergreen | sway | P2 |
| ca-coast-pines | Coulter, knobcone, bishop, Monterey and Torrey pines | row: pine | california | O | 10-30 m | evergreen | sway | P3 |
| planted-dry-pines | Aleppo, Afghan (Eldarica) and Canary Island pines | row: pine | california, desert-sw, texas | C | 10-20 m | evergreen | sway | P3 |
| italian-stone-pine | Italian stone pine | row: pine — flat umbrella crown | california | O | 10-20 m | evergreen | sway | P3 |
| sky-island-pines | Apache and Chihuahua pines | row: pine | desert-sw | O | 15-25 m | evergreen | sway | P3 |
| two-needle-pinyon | Two-needle (Colorado) piñon | row: pine — small, rounded, dark | great-basin, desert-sw, rockies, texas | C | 5-10 m | egg-shaped cones with nuts | stiff sway | P1 |
| singleleaf-pinyon | Singleleaf and Mexican piñons | row: pine — small, rounded | great-basin, texas | C | 5-10 m | evergreen | stiff sway | P2 |
| shore-pine | Shore pine | row: pine — twisted, wind-sculpted | pnw | C | 5-10 m | evergreen | stiff sway | P2 |
| australian-pine | Australian pine (Casuarina) | row: pine — wispy drooping "needles" lining causeways | florida | C | 15-30 m | evergreen | swing | P3 |

### 1.3 Swamp trees

| id | Name | Build | Regions | C | Size | Seasons / states | Animation & behaviour | P |
|---|---|---|---|---|---|---|---|---|
| bald-cypress | Bald cypress | new: cypress† — flared buttress, knees, feathery crown flattening with age | gulf, southeast, florida, texas, mid-atlantic, midwest, ozarks | C | 20-30 m | lime-green needles Mar; rust-orange late Nov; bare gray-brown in winter | feathery sprays sway; moss swings from the limbs | P1 |
| pond-cypress | Pond cypress (incl. dwarf cypress) | row: cypress† — awl needles; round "hat" domes; dwarf 3-5 m in marl | florida, southeast | C | 3-20 m | rust Nov | sway | P2 |
| water-tupelo | Water tupelo | row: cypress† — swollen bottle base, broadleaf crown | southeast, gulf | C | 20-30 m | bare in winter | sway | P1 |
| swamp-tupelo | Swamp tupelo | row: cypress† — smaller | southeast, florida, gulf | O | 15-25 m | red fall | sway | P3 |

### 1.4 Palms and cycads

| id | Name | Build | Regions | C | Size | Seasons / states | Animation & behaviour | P |
|---|---|---|---|---|---|---|---|---|
| cabbage-palmetto | Cabbage palmetto (sabal palm) | row: fanpalm — rough trunk with crisscross "boots", round head, no skirt | southeast, florida, gulf | C | 10-20 m | evergreen | fronds toss and clack | P1 |
| texas-sabal-palm | Texas sabal palm | row: fanpalm | texas | R | 10-15 m | evergreen | toss | P3 |
| saw-palmetto | Saw palmetto | row: fanpalm — no trunk; clumps of stiff fans on creeping stems | florida, southeast, gulf | C | 1-2 m | evergreen; green to silver-blue | fans rattle | P1 |
| dwarf-palmetto | Dwarf palmetto | row: fanpalm — stemless fans carpeting swamp floors | gulf, southeast | C | 1-2 m | evergreen | fans rattle | P2 |
| mexican-fan-palm | Mexican fan palm (Washingtonia robusta) | have: fanpalm | desert-sw, california, florida, gulf, texas | C | 20-30 m | evergreen | small mop head tosses | P2 |
| california-fan-palm | California fan palm | row: fanpalm — thick gray trunk, full skirt of dead fronds | desert-sw, california | C | 15-20 m | evergreen | toss; skirt sways | P2 |
| fan-palms-yards | Windmill, Mediterranean fan and Bismarck palms | row: fanpalm — short (windmill), clumping (Mediterranean), blue-gray giant fans (Bismarck) | southeast, gulf, desert-sw, florida | O | 3-15 m | evergreen | toss | P3 |
| keys-fan-palms | Florida thatch, silver and paurotis palms | row: fanpalm — small; paurotis in clumps of thin trunks | florida | O | 3-10 m | evergreen | toss | P3 |
| coconut-palm | Coconut palm | have: palm | florida | C | 15-25 m | evergreen; leans over beaches | fronds toss | P2 |
| royal-palm | Florida royal palm | row: palm — smooth concrete-gray trunk swollen mid-way, green crownshaft | florida | C | 20-30 m | evergreen | fronds toss | P2 |
| canary-date-palm | Canary Island date palm | row: palm — thick trunk, huge feather crown | southeast, gulf, florida, california | C | 15-20 m | evergreen | fronds toss | P2 |
| date-palm | Date palm | row: palm — groves | desert-sw, california, florida, texas | C | 15-25 m | fruit clusters | toss | P3 |
| queen-palm | Queen palm | row: palm — slim, drooping fronds | florida, texas, desert-sw, california | C | 10-15 m | evergreen | toss | P3 |
| feather-palms | Foxtail, Christmas (Adonidia), Alexander, king and pindo palms | row: palm | florida, southeast, california | C | 5-15 m | evergreen | toss | P3 |
| travelers-palm | Traveler's palm | row: palm — flat fan of banana-like leaves | florida | O | 7-10 m | evergreen | leaves flap | P3 |
| banana-plant | Banana plant | row: palm — soft trunk, big tattered paddle leaves | gulf, florida | C | 3-6 m | frost-browned in cold snaps | paddles flap and tear | P3 |
| sago-palm | Sago palm (cycad) | row: palm — short, stiff whorl | gulf, florida, southeast | C | 1-3 m | evergreen | stiff | P3 |

### 1.5 Desert trees, cacti and succulents

| id | Name | Build | Regions | C | Size | Seasons / states | Animation & behaviour | P |
|---|---|---|---|---|---|---|---|---|
| saguaro | Saguaro | new: columnar† — pleated column, arms curving up after 50-75 years, Gila woodpecker holes, scarred "boots" | desert-sw | C | 10-15 m | crowns of waxy white flowers May-Jun; red fruit Jun-Jul; dead ones a wooden rib skeleton | stiff | P1 |
| organ-pipe | Organ pipe and senita | row: columnar† — many columns from the ground | desert-sw | R | 3-7 m | night flowers | stiff | P3 |
| barrel-cacti | Fishhook, compass and golden barrel cacti | row: columnar† — fat ribbed barrel leaning south, red hooked spines | desert-sw, great-basin | C | 0.5-2 m | yellow fruit on top | stiff | P2 |
| hedgehog-cacti | Hedgehog and claret cup cacti | row: columnar† — clumped short stems | desert-sw, great-basin, texas | C | 10-40 cm | magenta or scarlet cups Apr-May | stiff | P3 |
| pincushion-cacti | Pincushion, fishhook and Mojave mound cacti | row: columnar† — tiny | desert-sw, great-basin | O | 5-20 cm | rings of flowers | stiff | P3 |
| engelmann-prickly-pear | Engelmann (Texas) prickly pear | new: opuntia† — sprawling clumps of flat round pads | texas, desert-sw, great-basin | C | 1-2 m | yellow or orange flowers Apr-May; purple-red tunas Aug | stiff | P1 |
| eastern-prickly-pear | Eastern prickly pear | row: opuntia† — low flat pads | new-england, mid-atlantic, appalachia, ozarks | O | 20-40 cm | yellow Jun | stiff | P3 |
| plains-prickly-pear | Plains prickly pear | row: opuntia† — low pads | plains, rockies, great-basin | C | 10-30 cm | yellow Jun | stiff | P2 |
| beavertail | Beavertail and purple prickly pears | row: opuntia† — gray-blue or purple pads | desert-sw | O | 15-90 cm | magenta flowers spring | stiff | P3 |
| coast-prickly-pear | Coast prickly pear | row: opuntia† | california | O | 0.5-1 m | yellow spring | stiff | P3 |
| teddy-bear-cholla | Teddy bear cholla | row: opuntia† — cylinders under dense golden-white spines | desert-sw | C | 1-1.5 m | spines glow when backlit; fallen joints litter the ground | stiff | P1 |
| chain-fruit-cholla | Chain-fruit (jumping) and buckhorn chollas | row: opuntia† — tree-like, hanging chains of green fruit | desert-sw | C | 1-3 m | fruit chains | chains swing slightly | P2 |
| cane-cholla | Cane (tree) cholla | row: opuntia† — branching cylinders | desert-sw, texas, great-basin | C | 1-3 m | purple-magenta May; yellow fruit | stiff | P2 |
| small-chollas | Pencil and Christmas chollas, tasajillo | row: opuntia† — thin pencil stems | desert-sw, texas | O | 0.5-1.5 m | bright red fruit in winter | stiff | P3 |
| ocotillo | Ocotillo | new: cane† — cluster of gray spiny unbranched canes from one base | desert-sw, texas | C | 3-6 m | leafs out green within days of rain; scarlet flame tips Mar-Apr | canes sway as whips | P1 |
| joshua-tree | Joshua tree | new: yucca† — shaggy trunk in dead-leaf skirts, crooked arms tipped with bayonet rosettes | desert-sw, great-basin | C | 5-12 m | greenish-cream flower clusters in spring | stiff | P1 |
| mojave-yucca | Mojave yucca | row: yucca† — short trunks | desert-sw | C | 1-4 m | cream bells spring | stiff | P2 |
| banana-yucca | Banana, narrowleaf and Harriman's yuccas | row: yucca† — stemless rosettes | desert-sw, great-basin | C | 0.5-1 m | cream bells on stalks spring | stiff | P3 |
| soaptree-yucca | Soaptree yucca | row: yucca† — tall trunk, grass-like leaves | desert-sw, texas | C | 2-6 m | tall white flower stalk spring (White Sands) | leaves stir | P2 |
| spanish-dagger | Spanish dagger, Texas yuccas and giant dagger yucca | row: yucca† — trunked; giant dagger 3-6 m | texas | C | 1-6 m | huge cream clusters Apr | stiff | P3 |
| soapweed-yucca | Soapweed yucca | row: yucca† — stemless blue-green rosette | plains | C | 0.5-1 m; stalk 1-1.5 m | white bells Jun | stalk sways | P2 |
| chaparral-yucca | Chaparral yucca | row: yucca† — stemless, one 3-4 m cream spike | california | C | 1 m; spike 3-4 m | spike May, then dies | spike sways | P2 |
| red-yucca | Red yucca (Hesperaloe) | row: rosette — grassy clump | texas, desert-sw | C | 1-1.5 m | coral-red spikes all summer | spikes nod | P3 |
| agave | Agaves, century plants (Parry's, Palmer's, desert agave) | have: agave | desert-sw, texas, california | C | 0.5-1.5 m; flower stalk 4-6 m | once-in-a-lifetime candelabra stalk, then dies | stiff; stalk sways | P2 |
| lechuguilla | Lechuguilla | row: agave — narrow upright leaves | texas, desert-sw | C | 30-50 cm | tall stalk | stiff | P3 |
| sotol | Sotol (desert spoon) | row: agave — sphere of narrow serrated leaves | texas, desert-sw | C | 1-1.5 m; stalk 3-4 m | stalk spring | leaves stir | P3 |
| yard-succulents | Aloe, jade and yard succulents | row: rosette | california, desert-sw | C | 0.3-1.5 m | aloe orange spikes winter | stiff | P3 |
| creosote-bush | Creosote bush | row: shrub — open vase of thin gray stems, small glossy olive leaves, evenly spaced | desert-sw, texas | C | 1-3 m | yellow flowers and white fuzzy seed balls after rain | sway | P1 |
| candelilla | Candelilla | row: cane† — clusters of waxy pencil stems | texas | O | 30-60 cm | tiny pink flowers | stiff | P3 |
| mormon-tea | Mormon tea | row: cane† — green jointed leafless stems | great-basin, desert-sw | C | 0.5-1.5 m | yellow cones spring | stiff | P3 |

### 1.6 Tree states

| id | Name | Build | Regions | C | Size | Seasons / states | Animation & behaviour | P |
|---|---|---|---|---|---|---|---|---|
| snag | Standing dead tree (snag): ash killed by emerald ash borer, hemlocks by adelgid, Fraser fir snag fields, beaver-pond drowned trees, salt-killed ghost forests, sudden oak death | row: all tree kinds (dead state) — bare gray wood, broken top, holes | all | C | its species' height | gray all year; woodpecker "blonding" on ash | stiff | P1 |
| beetle-kill | Beetle-killed conifer stands (mountain pine and spruce beetles, Sierra drought die-off) | row: pine, spruce (dead state) — red needles, then gray | rockies, california, pnw | C | its species' height | red for 1-2 years, then gray | stiff | P2 |
| nurse-log | Fallen log and nurse log | row: all tree kinds (fallen state) — moss, seedlings and huckleberry growing on it | all | C | 5-60 m long | mossier each year | stiff | P2 |
| stump | Stumps (redwood fairy-ring stumps, sawn stumps) | row: all tree kinds (stump state) | all | C | 0.3-3 m | moss | stiff | P3 |

## 2. Shrubs and understory

`mound`, `clipped`, `rosette`, `clump` and `spike` are the garden forms; `shrub` is the tree kind
for big multi-stem shrubs. World beds use each form's `lite` genome.

| id | Name | Build | Regions | C | Size | Seasons / states | Animation & behaviour | P |
|---|---|---|---|---|---|---|---|---|
| boxwood | Boxwood | have: boxwood | all but desert-sw | C | 0.5-2 m | evergreen | stiff | P2 |
| yew | Yew (Japanese, English) | row: clipped — dark needles, boxes or spreading mounds | new-england, upstate-ny, mid-atlantic, appalachia, midwest | C | 1-3 m | evergreen; red berries | stiff | P2 |
| garden-junipers | Garden junipers (Chinese, creeping, 'Blue Rug') | row: mound — low creeping mats or stiff uprights | all | C | 0.1-3 m | blue-green to gray-green | stiff | P2 |
| rhododendron | Rhododendron (garden) | row: shrub — leathery evergreen leaves, big trusses | east, pnw | C | 1.5-4 m | pink, purple or white trusses May | stiff sway | P1 |
| azalea | Azalea, incl. giant Southern Indica azaleas | row: mound — smothered in bloom | east, pnw | C | 1-3 m | pink, white, salmon or red Mar-Apr (south), May (north) | sway | P1 |
| rosebay-rhododendron | Rosebay rhododendron (great laurel) | row: shrub — tangled "laurel hell" thickets along streams | appalachia | C | 3-6 m | white-pink trusses Jun-Jul; leaves curl like cigars in cold | stiff | P1 |
| catawba-rhododendron | Catawba rhododendron | row: shrub — mountaintop balds | appalachia | O | 2-4 m | rose-purple mid-Jun, whole summits purple | stiff | P2 |
| pacific-rhododendron | Pacific rhododendron | row: shrub | pnw, california | O | 2-5 m | pink May | stiff | P2 |
| wild-azaleas | Flame and western azaleas | row: mound — open | appalachia, california | O | 2-3 m | flame: orange, yellow or red May-Jul; western: white-pink May-Jun | sway | P3 |
| mountain-laurel | Mountain laurel | row: shrub — twisted evergreen thickets | new-england, upstate-ny, mid-atlantic, appalachia | C | 2-4 m | pink-white cups May-Jun | stiff | P2 |
| bigleaf-hydrangea | Bigleaf hydrangea | have: hydrangea | east, pnw | C | 1-2 m | blue (acid) or pink mopheads Jul | heads nod | P2 |
| panicle-oakleaf-hydrangea | Panicle and oakleaf hydrangeas | row: mound — cone heads; oakleaf's big lobed leaves | east, pnw | C | 1-3 m | white cones aging pink; oakleaf burgundy in fall | heads nod | P3 |
| wild-hydrangea | Wild hydrangea | row: mound — flat white heads | appalachia, ozarks | O | 1-2 m | Jun | nod | P3 |
| forsythia | Forsythia | row: mound — arching canes | new-england, upstate-ny, mid-atlantic, appalachia, midwest, ozarks | C | 2-3 m | bright yellow early Apr before leaves | canes bob | P2 |
| lilac | Lilac | row: shrub — multi-stem; old farmstead hedges | new-england, upstate-ny, midwest, plains, rockies, great-basin | C | 2-4 m | purple or white plumes May | sway; plumes nod | P2 |
| burning-bush | Burning bush (winged euonymus) | row: mound — corky-winged stems | new-england, upstate-ny, mid-atlantic, appalachia, midwest, ozarks | C | 2-3 m | fluorescent scarlet-pink fall | sway | P2 |
| japanese-barberry | Japanese barberry | row: mound — thorny, often burgundy | new-england, upstate-ny, mid-atlantic, appalachia, midwest | C | 1-2 m | red berries | stiff | P3 |
| privet | Privet (Chinese, European, Japanese; ligustrum) | row: clipped — hedges, or wild thickets | all | C | 2-5 m | white flowers Jun; blue-black berries | sway | P2 |
| japanese-holly-inkberry | Japanese holly and inkberry | row: clipped — small leaves | east | C | 1-3 m | black berries | stiff | P3 |
| yaupon | Yaupon holly | row: shrub — gray-barked, tiny leaves; hedges | southeast, florida, gulf, texas | C | 3-8 m | translucent red berries winter | sway | P2 |
| possumhaw | Possumhaw (deciduous holly) | row: shrub | gulf, texas, ozarks | O | 3-5 m | red berries on bare gray twigs in winter | sway | P3 |
| winterberry | Winterberry holly | row: shrub | new-england, upstate-ny, mid-atlantic | O | 2-3 m | brilliant red berries on bare twigs all winter | sway | P3 |
| spirea | Spirea | row: mound | new-england, upstate-ny, midwest, plains | C | 0.5-2 m | white or pink flat clusters | sway | P3 |
| rose-of-sharon | Rose of Sharon | row: shrub — upright | east | C | 2-4 m | white, pink or lavender hibiscus flowers Aug | sway | P3 |
| knockout-rose | Knockout rose (rosebush) | have: rose | all | C | 1 m | cherry-red or pink, spring to frost | nod | P2 |
| nandina | Nandina (heavenly bamboo) | row: cane† — lacy leaves on cane clumps | southeast, gulf, texas, california | C | 1-2 m | red leaves and berry clusters in winter | flutter | P3 |
| southern-foundation-shrubs | Indian hawthorn, loropetalum, red-tip photinia | row: mound — low evergreen; purple (loropetalum), red new growth (photinia) | southeast, gulf, texas, california | C | 1-3 m | pink fringe flowers; red flush spring | stiff | P3 |
| oleander | Oleander | row: shrub — dense, narrow leathery leaves; freeway medians | gulf, texas, florida, southeast, california, desert-sw | C | 2-5 m | pink, white or red all summer | sway | P2 |
| bush-honeysuckles | Bush honeysuckles (Amur, Morrow's, Tatarian) | row: shrub — arching wall under woods' edges | new-england, upstate-ny, mid-atlantic, appalachia, midwest, ozarks | C | 3-5 m | first green in spring, last to drop; red berries | sway | P2 |
| multiflora-rose | Multiflora rose | row: mound — arching thorny mounds | east | C | 2-3 m | white clusters Jun; red hips | sway | P3 |
| buckthorn | Common and glossy buckthorn | row: shrub | new-england, upstate-ny, midwest | C | 3-6 m | glossy leaves held into Nov; black berries | sway | P3 |
| autumn-olive | Autumn olive | row: shrub — silver | new-england, mid-atlantic, appalachia, southeast, midwest, ozarks | C | 3-6 m | red berries | shimmer | P3 |
| hobblebush | Hobblebush | row: mound — sprawling, big round leaves | new-england, upstate-ny, appalachia | C | 2-3 m | white lacecaps May; red-purple fall | sway | P3 |
| witch-hazel | Witch hazel | row: shrub — multi-stem | east | C | 3-5 m | yellow ribbon flowers Oct-Nov after leaf fall | sway | P3 |
| ozark-witch-hazel | Ozark witch hazel | row: shrub — on gravel banks | ozarks | O | 1-3 m | red-orange-yellow flowers Jan-Feb | sway | P3 |
| mountain-maples | Mountain and Rocky Mountain maples | row: shrub | new-england, upstate-ny, appalachia, midwest, rockies | O | 3-8 m | red-orange fall | sway | P3 |
| chestnut-sprouts | American chestnut and Ozark chinquapin root sprouts | row: shrub — long saw-toothed leaves, spiny burs | appalachia, ozarks | R | 2-5 m | yellow fall | sway | P3 |
| pawpaw | Pawpaw | row: round — small, big drooping tropical leaves | mid-atlantic, appalachia, midwest, ozarks | C | 3-8 m | green fruit; yellow fall | big leaves flap | P3 |
| spicebush | Spicebush | row: shrub | mid-atlantic, appalachia, midwest, ozarks | C | 2-4 m | yellow flower haze Mar; red berries; yellow fall | sway | P3 |
| lowbush-blueberry | Lowbush blueberry | row: mound — knee-high carpets on barrens and ledges | new-england, upstate-ny, midwest | C | 15-40 cm | whole hillsides crimson in Oct | ripple | P2 |
| highbush-blueberry | Highbush blueberry (incl. cultivated fields) | row: shrub | new-england, upstate-ny, mid-atlantic, southeast, midwest | C | 1-3 m | urn flowers; berries Jul; scarlet Oct; red twigs in winter | sway | P3 |
| eastern-huckleberries | Eastern huckleberries and blueberries of ridges and barrens | row: mound — low | mid-atlantic, appalachia, ozarks | C | 0.3-1 m | red-bronze fall | sway | P3 |
| western-huckleberries | Mountain and evergreen huckleberries | row: mound | rockies, pnw, california | C | 0.5-2 m | purple berries Aug; red in fall (grizzly food) | sway | P2 |
| red-huckleberry | Red huckleberry | row: shrub — bright green angular stems out of stumps and nurse logs | pnw | C | 1-3 m | translucent red berries | sway | P2 |
| bog-shrubs | Sheep laurel, leatherleaf, Labrador tea | row: mound — low bog shrubs | new-england, upstate-ny, mid-atlantic, midwest | O | 0.3-1 m | sheep laurel pink flowers | stiff | P3 |
| sweet-fern | Sweet fern | row: mound — fern-like aromatic leaves | new-england | C | 50 cm | — | sway | P3 |
| bayberry | Northern bayberry | row: mound | new-england, mid-atlantic | C | 1-2 m | gray waxy berries | sway | P3 |
| wax-myrtle | Wax myrtle | row: shrub — aromatic olive-green | southeast, florida, gulf, texas | C | 2-6 m | evergreen; winter warbler flocks | sway | P2 |
| beach-plum | Beach plum | row: mound | new-england, mid-atlantic | O | 1-2 m | white May; purple fruit Aug | sway | P3 |
| rosa-rugosa | Rosa rugosa (beach rose) | row: mound — prickly, crinkled leaves; every beach path | new-england, mid-atlantic | C | 1-1.5 m | magenta or white all summer; tomato-red hips | sway | P2 |
| alders-shrub | Speckled and mountain alders | row: shrub — catkins | new-england, upstate-ny, midwest, rockies | C | 3-5 m | catkins early spring | sway | P3 |
| red-osier-dogwood | Red-osier dogwood | row: cane† — blood-red stems | new-england, upstate-ny, midwest, rockies | C | 1-3 m | red stems glow against snow | bend | P2 |
| shrub-dogwoods | Gray, roughleaf and alternate-leaf dogwoods | row: shrub | upstate-ny, midwest, plains | C | 2-4 m | white berries; red-purple fall | sway | P3 |
| scrub-oak | Scrub (bear) oak | row: shrub — thickets of tiny oaks | mid-atlantic, new-england | C | 1-3 m | brown fall | sway | P2 |
| florida-scrub-oaks | Myrtle and Chapman oaks | row: shrub — gnarled thickets on white sand | florida | C | 1-3 m | evergreen | stiff | P3 |
| shinnery-oak | Shinnery oak | row: mound — knee-high thickets | texas | C | 0.5-1 m | brown fall | sway | P3 |
| gambel-oak | Gambel oak (oak brush) | row: shrub — thickets | rockies, great-basin | C | 2-6 m | rust, orange and red fall | sway | P2 |
| pine-barrens-shrubs | Staggerbush and fetterbush | row: mound — low evergreen | mid-atlantic, southeast, florida, gulf | C | 0.5-1.5 m | red-bronze fall | stiff | P3 |
| sweet-pepperbush | Sweet pepperbush (clethra, incl. mountain sweet pepperbush) | row: mound | mid-atlantic, appalachia | C | 2 m | fragrant white spikes Aug, bees | sway | P3 |
| groundsel-marsh-elder | Groundsel tree and marsh elder | row: mound — marsh edges | mid-atlantic, southeast | C | 1-3 m | white fluffy seed heads in fall | sway | P3 |
| wineberry | Wineberry | row: mound — arching canes with red bristles | mid-atlantic | C | 1-2 m | red raspberries Jul | sway | P3 |
| viburnums | Nannyberry, highbush cranberry, linden viburnum | row: shrub | upstate-ny, mid-atlantic, midwest | C | 2-4 m | white flat clusters; red or blue-black fruit | sway | P3 |
| doghobble | Doghobble | row: mound — arching evergreen | appalachia | C | 1-2 m | white bell sprays | sway | P3 |
| hearts-a-bustin | Hearts-a-bustin (strawberry bush) | row: shrub — green stems | appalachia | O | 1-2 m | warty red capsules burst with orange seeds in fall | sway | P3 |
| sweetshrub | Sweetshrub | row: mound | appalachia | O | 1-3 m | maroon fragrant flowers | sway | P3 |
| beautyberry | American beautyberry (French mulberry) | row: mound — arching | southeast, florida, gulf | C | 1-2 m | shocking magenta berries ringing the stems Sep-Oct | sway | P2 |
| sparkleberry | Sparkleberry (farkleberry) | row: shrub | southeast, ozarks | O | 2-5 m | — | sway | P3 |
| flatwoods-shrubs | Gallberry, titi, tarflower, rusty lyonia | row: mound — low evergreen layer | southeast, florida, gulf | C | 1-3 m | titi's white tassels in swamps | stiff | P3 |
| camellia | Camellia | row: clipped — glossy | southeast, gulf, pnw | C | 2-4 m | red, pink or white flowers Dec-Mar | stiff | P2 |
| gardenia | Gardenia | row: mound | southeast | C | 1-2 m | white fragrant May-Jun | stiff | P3 |
| tea-olive | Tea (sweet) olive | row: shrub | southeast, gulf | C | 3-6 m | sweet fall fragrance | sway | P3 |
| lantana | Lantana | row: mound | south, desert-sw, california | C | 0.5-1.5 m | multicoloured flowers all summer | sway | P3 |
| mahonia-elaeagnus | Leatherleaf mahonia and thorny elaeagnus | row: mound | southeast | O | 1-3 m | — | stiff | P3 |
| florida-rosemary | Florida rosemary | row: mound — gray-green needle domes on bare white sand | florida | C | 1 m | — | stiff | P3 |
| firebush | Firebush | row: shrub | florida | C | 2-4 m | red-orange tubular flowers (hummingbirds, zebra longwings) | sway | P3 |
| hammock-edge-shrubs | Wild coffee and marlberry | row: mound | florida | C | 1-3 m | red or black berries | sway | P3 |
| coontie | Coontie (cycad) | row: rosette — fern-like | florida | C | 0.5-1 m | orange seed cones; atala host | stiff | P3 |
| brazilian-pepper | Brazilian pepper | row: shrub — sprawling 5-10 m thickets | florida, california | C | 5-10 m | masses of red berries Dec-Jan | sway | P2 |
| shoebutton-ardisia | Shoebutton ardisia | row: shrub | florida | O | 2-5 m | — | sway | P3 |
| tropical-yard-shrubs | Ixora, croton, pentas, plumbago | row: mound — red-orange clusters; croton's variegated leaves | florida | C | 0.5-2 m | all year | sway | P3 |
| hibiscus | Hibiscus | have: hibiscus | florida, gulf, california | C | 1.5-3 m | red, pink or yellow all year | sway | P2 |
| florida-hedges | Cocoplum, Simpson's stopper, podocarpus, sweet viburnum, ficus hedges | row: clipped | florida | C | 1-4 m | evergreen | stiff | P3 |
| bird-of-paradise | Bird of paradise | row: clump — paddle leaves, crested flowers | florida, california | C | 1-1.5 m | orange and blue flowers | leaves flap | P3 |
| red-bird-of-paradise | Red bird of paradise | row: shrub — feathery leaves | desert-sw | C | 2-3 m | orange-red feathery flowers all summer | flutter | P3 |
| buttonbush | Buttonbush | row: shrub — in standing water | gulf | C | 2-3 m | round white pincushion flowers | sway | P3 |
| gulf-swamp-shrubs | Swamp privet, Virginia sweetspire | row: shrub | gulf | O | 1-4 m | white spikes spring | sway | P3 |
| elephant-ear | Elephant ear | row: rosette — huge heart leaves | gulf, florida | C | 1-2 m | dies back in frost | leaves flap | P3 |
| angels-trumpet | Angel's trumpet | row: shrub — hanging trumpets | gulf | O | 2-4 m | white to peach trumpets | trumpets swing | P3 |
| ginger-cast-iron | Ginger lilies and cast-iron plant | row: clump | gulf | C | 0.5-2 m | ginger flowers late summer | sway | P3 |
| texas-mountain-laurel | Texas mountain laurel | row: shrub — small evergreen tree, glossy leaflets | texas | C | 3-6 m | purple grape-soda-scented clusters Mar; red seeds in silver pods | sway | P2 |
| agarita | Agarita | row: mound — holly-like gray-blue spiny leaves | texas | C | 1-2 m | yellow Feb; red berries | stiff | P3 |
| flameleaf-sumac | Flameleaf and evergreen sumacs | row: shrub | texas | C | 2-5 m | scarlet fall (flameleaf) | sway | P3 |
| hill-country-shrubs | Elbowbush, Lindheimer silktassel, Mexican buckeye, Texas kidneywood | row: shrub | texas | O | 1-4 m | pink flowers (buckeye) | sway | P3 |
| cenizo | Cenizo (Texas sage, Texas ranger, Leucophyllum) | row: mound — silver-gray | texas, desert-sw | C | 1-2 m | bursts into lavender-purple after summer rain | sway | P2 |
| texas-brush | South Texas brush: blackbrush acacia, guajillo, granjeno, whitebrush, coyotillo, allthorn, brasil | row: shrub — dense thorny gray-green thickets | texas | C | 1-4 m | white or yellow flowers after rain | stiff | P2 |
| turks-cap-salvias | Turk's cap and salvias | row: mound | texas, desert-sw | C | 0.5-1.5 m | red, pink, purple all summer | sway | P3 |
| esperanza | Esperanza (yellow bells, Tecoma) | row: shrub | texas, desert-sw | C | 1-3 m | yellow trumpets summer-fall | sway | P3 |
| vitex | Vitex | row: shrub | texas | C | 3-5 m | lavender spikes summer | sway | P3 |
| sand-sagebrush | Sand sagebrush | row: mound — silvery | texas, plains, great-basin | C | 0.5-1.5 m | — | sway | P3 |
| wild-plum | Wild and sand plum thickets | row: shrub | plains, texas | C | 1-4 m | white Apr; plums summer | sway | P2 |
| chokecherry | Chokecherry and pin cherry | row: shrub | upstate-ny, midwest, plains, rockies | C | 2-6 m | white spikes May; dark red-black fruit | sway | P3 |
| smooth-sumac | Smooth and staghorn sumacs | row: shrub — velvety antler branches (staghorn), red cone fruit | upstate-ny, midwest, plains, ozarks | C | 2-5 m | scarlet along roads in fall | sway | P2 |
| skunkbush-sumac | Skunkbush and aromatic sumacs | row: mound | plains, rockies, ozarks | C | 1-2 m | orange-red fall | sway | P3 |
| coralberry-snowberry | Coralberry (buckbrush) and snowberries (incl. western snowberry) | row: mound | plains, ozarks, midwest, rockies, pnw | C | 0.5-1.5 m | purple or white berries in winter | sway | P3 |
| buffaloberry | Buffaloberry | row: shrub — silver leaves | plains, rockies | O | 2-4 m | red berries | shimmer | P3 |
| leadplant | Leadplant | row: mound | plains | O | 0.5-1 m | purple spikes Jun | sway | P3 |
| wild-roses | Wild roses (prairie, Nootka, California) | row: mound | plains, rockies, pnw, california | C | 0.5-2 m | pink Jun; red hips | sway | P3 |
| caragana | Caragana (Siberian peashrub) | row: shrub — windbreak rows | plains | O | 2-4 m | yellow pea flowers | sway | P3 |
| hazelnuts | American and beaked hazelnuts | row: shrub | midwest, ozarks, pnw | C | 2-4 m | catkins late winter | sway | P3 |
| prickly-ash | Prickly ash | row: shrub | midwest | O | 2-4 m | — | sway | P3 |
| elderberry | Elderberry (incl. valley elderberry) | row: shrub | midwest, california | C | 2-4 m | flat white heads; blue-black berries | sway | P3 |
| red-elderberry | Red elderberry | row: shrub | pnw | C | 2-5 m | red berries Jun | sway | P3 |
| thimbleberry | Thimbleberry | row: mound — huge soft maple-like leaves | pnw, midwest, rockies, california | C | 1-2 m | white flowers; soft red berries | leaves flap | P2 |
| salmonberry | Salmonberry | row: cane† — arching canes | pnw, california | C | 1-3 m | magenta flowers Mar (hummingbirds); orange-red berries May-Jun | bend | P2 |
| ozark-shrubs | New Jersey tea, Carolina buckthorn, wahoo | row: shrub | ozarks | O | 1-4 m | white flowers; red fruit | sway | P3 |
| willow-thickets | Willow thickets (many species, incl. coyote and alpine willows) | row: shrub — dense multi-stem, coloured stems | rockies, great-basin, pnw, new-england, upstate-ny | C | 0.3-4 m | red, yellow, orange or purple stems glow in winter; moose and elk browse | bend | P1 |
| seep-willow-desert-broom | Seep willow and desert broom | row: cane† | desert-sw | C | 1-3 m | white fluff (desert broom) fall | bend | P3 |
| big-sagebrush | Big sagebrush | row: mound — silver-gray-green, shaggy bark; an endless sea | great-basin, rockies, pnw, desert-sw | C | 0.5-2 m | silver all year; pungent after rain | stiff sway | P1 |
| low-sagebrushes | Black and low sagebrushes | row: mound — lower, darker | great-basin | C | 0.2-0.5 m | — | stiff | P3 |
| rabbitbrush | Rubber and yellow rabbitbrush (chamisa) | row: mound — gray-green stems | great-basin, desert-sw, rockies, pnw | C | 0.5-2 m | mustard-yellow Sep-Oct; whole roadsides gold | sway | P2 |
| bitterbrush | Antelope bitterbrush | row: mound | great-basin, rockies, pnw | C | 1-2 m | pale yellow flowers spring | sway | P3 |
| currants-ninebark | Wax currant and mountain ninebark | row: mound | rockies | C | 1-2 m | red berries; peeling bark | sway | P3 |
| shrubby-cinquefoil | Shrubby cinquefoil | row: mound | rockies | C | 0.5-1 m | yellow buttercup flowers all summer | sway | P3 |
| mountain-mahogany | Mountain mahogany (incl. curl-leaf) | row: shrub — feathery curled seed tails | rockies, great-basin, california | C | 2-6 m | seed tails glint in sun | sway | P3 |
| cliffrose | Cliffrose | row: shrub — shaggy bark | great-basin | O | 2-4 m | cream-yellow flowers; feathery seed plumes | sway | P3 |
| common-juniper | Common juniper and kinnikinnick mats | row: mound — low | rockies, pnw | C | 0.1-1 m | red berries (kinnikinnick) | stiff | P3 |
| menziesia | Menziesia | row: shrub | rockies | O | 1-2 m | orange fall | sway | P3 |
| bursage | White and triangle-leaf bursage | row: mound — gray, between the creosote | desert-sw | C | 0.3-0.6 m | — | stiff | P2 |
| brittlebush | Brittlebush | row: mound — silver-white leaf domes | desert-sw | C | 0.6-1 m | covered in yellow daisies Feb-Apr; hillsides gold | nod | P2 |
| jojoba | Jojoba | row: mound | desert-sw | C | 1-2 m | — | stiff | P3 |
| desert-slope-shrubs | Wolfberry, hopbush, desert lavender | row: shrub | desert-sw | O | 1-3 m | lavender spikes | sway | P3 |
| chuparosa-fairy-duster | Chuparosa and fairy duster | row: mound — red tubes; pink powder puffs | desert-sw | O | 0.5-1.5 m | spring bloom | sway | P3 |
| saltbush | Four-wing saltbush and shadscale | row: mound — gray | desert-sw, great-basin | C | 0.5-2 m | papery seed wings | stiff | P2 |
| apache-plume | Apache plume | row: mound | desert-sw | C | 1-2 m | white flowers, then pink feathery seed plumes | sway | P3 |
| chihuahuan-shrubs | Tarbush and winterfat | row: mound — woolly white (winterfat) | desert-sw, great-basin | C | 0.3-1 m | — | stiff | P3 |
| salt-desert-shrubs | Greasewood, spiny hopsage, horsebrush | row: mound — bright green greasewood on salty flats | great-basin | C | 0.5-2 m | — | stiff | P3 |
| blackbrush | Blackbrush (Colorado Plateau) | row: mound — dark gray, spiny | great-basin | C | 0.5-1 m | dark stipple on slopes | stiff | P3 |
| chamise | Chamise | row: mound — needle-leaved gray-green | california | C | 1-3 m | white flower sprays spring | stiff | P2 |
| manzanita | Manzanitas (incl. greenleaf) | row: mesquite — smooth glossy red-maroon twisting stems, gray-green round leaves | california | C | 1-4 m | pink-white urns in winter | stiff | P1 |
| ceanothus | Ceanothus (California lilac, deer brush, snow brush) | row: mound | california | C | 1-4 m | blue to white flower clouds Mar-Apr | sway | P2 |
| toyon | Toyon | row: shrub — holly-like leaves | california | C | 2-5 m | red berry clusters in winter | sway | P3 |
| other-chaparral | Coffeeberry, holly-leaf cherry, sugar bush, lemonade berry, laurel sumac, huckleberry oak, Sierra gooseberry, mountain misery | row: mound — dense evergreen | california | C | 0.3-4 m | — | stiff | P3 |
| coastal-sage-scrub | California sagebrush, black, white and purple sages, coyote brush, deerweed | row: mound — soft gray aromatic | california | C | 0.5-2 m | summer-dormant gray | sway | P2 |
| california-buckwheat | California buckwheat | row: mound | california | C | 0.5-1 m | white flowers, rusty seed heads | sway | P3 |
| bush-monkeyflower | Bush monkeyflower | row: mound | california | C | 0.5-1.5 m | orange spring | sway | P3 |
| bush-lupine | Bush lupine | row: mound — spikes | california | C | 1-2 m | yellow or lavender spring | nod | P3 |
| poison-oak | Poison oak (shrub thickets; vines on vine†) | row: mound — three lobed leaflets | california, pnw | C | 1-3 m | red in spring and fall; leafless sticks in winter | sway | P2 |
| blackberries | Himalayan and California blackberries | row: mound — impenetrable arching cane mounds | pnw, california | C | 2-3 m | white-pink flowers; blackberries Aug | sway | P2 |
| scotch-broom | Scotch, French and Spanish brooms | row: mound — green broomy stems | pnw, california | C | 1-3 m | smothered in yellow pea flowers May | sway | P2 |
| ca-invasive-shrubs | Castor bean, tree tobacco, myoporum | row: shrub | california | O | 2-5 m | — | sway | P3 |
| pittosporum | Pittosporum | row: clipped | california | C | 2-5 m | — | stiff | P3 |
| salal | Salal | row: mound — dense glossy leathery leaves | pnw, california | C | 0.5-2 m | pink urn flowers in rows; dark purple berries | stiff glossy sway | P1 |
| oregon-grape | Oregon grape (tall, dull, creeping) | row: mound — holly-like spiny leaflets | pnw, rockies | C | 0.3-2 m | bright yellow flower clusters spring; dusty blue berries; red-bronze in winter | stiff | P1 |
| devils-club | Devil's club | row: cane† — huge maple-like leaves on spiny stems | pnw | C | 1-3 m | red berry clusters late summer | leaves flap | P2 |
| indian-plum | Indian plum (osoberry) | row: shrub | pnw | C | 2-4 m | first to leaf out, Feb; drooping white flowers | sway | P3 |
| red-flowering-currant | Red-flowering currant | row: shrub | pnw | C | 2-3 m | drooping pink-red clusters Mar | sway | P3 |
| oceanspray | Oceanspray | row: shrub | pnw | C | 2-4 m | creamy foam plumes Jun turning tan | sway | P3 |
| pnw-edge-shrubs | Twinberry and mock orange | row: shrub | pnw | C | 2-3 m | white flowers (mock orange) | sway | P3 |
| pieris-heathers | Pieris and heathers | row: mound | pnw | C | 0.3-2 m | white-pink spring | stiff | P3 |
| laurel-hedges | English and Portugal laurel | row: clipped | pnw | C | 2-6 m | — | stiff | P3 |
| butterfly-bush | Butterfly bush | row: shrub — on gravel bars and rail lines | pnw | C | 2-4 m | purple spikes summer | sway | P3 |
| japanese-knotweed | Japanese knotweed | row: cane† — hollow red-speckled bamboo-like canes | new-england, upstate-ny, mid-atlantic, midwest, pnw | C | 2-3 m | cream sprays Aug; dead canes in winter | bend | P2 |
| pomegranate | Pomegranate | row: shrub | desert-sw | O | 3-5 m | orange-red flowers; fruit fall | sway | P3 |
| rosemary | Rosemary | row: mound | desert-sw, california | C | 0.5-1.5 m | blue flowers | stiff | P3 |
| bottlebrush | Bottlebrush | row: shrub | california | C | 2-5 m | red brushes | sway | P3 |
| lily-of-the-nile | Lily of the Nile (agapanthus) | row: clump | california | C | 0.6-1 m | blue balls Jun | nod | P3 |

## 3. Ferns

All rows grow on the `fern` rosette (`have`), with frond shape, height and colour as parameters.

| id | Name | Build | Regions | C | Size | Seasons / states | Animation & behaviour | P |
|---|---|---|---|---|---|---|---|---|
| fern | Fern (generic) | have: fern | all | — | 0.7 m | — | sway | P2 |
| western-sword-fern | Western sword fern | row: fern — knee-high fountains of dark leathery swords | pnw, california | C | 0.6-1.5 m | evergreen | fronds sway and bounce | P1 |
| bracken | Bracken | row: fern — single-stalked triangles, waist high | new-england, upstate-ny, mid-atlantic, midwest, pnw, california | C | 0.5-1.5 m (huge in PNW clearings) | rusty in fall | sway | P1 |
| cinnamon-fern | Cinnamon fern | row: fern — tall vase with cinnamon-brown fertile spikes | new-england, upstate-ny, mid-atlantic, appalachia, southeast | C | 0.6-1.5 m | spikes in spring; golden fall | sway | P1 |
| hay-scented-fern | Hay-scented fern | row: fern — pale lime lacy carpet | new-england, upstate-ny, mid-atlantic, appalachia | C | 40-60 cm | straw-yellow in fall | ripple | P2 |
| christmas-fern | Christmas fern | row: fern — dark leathery | east | C | 30-60 cm | evergreen | sway | P2 |
| interrupted-fern | Interrupted fern | row: fern | new-england, upstate-ny, appalachia | C | 0.6-1 m | — | sway | P3 |
| sensitive-fern | Sensitive fern | row: fern | new-england, upstate-ny, mid-atlantic, midwest, gulf | C | 30-60 cm | dies at first frost | sway | P3 |
| ostrich-fern | Ostrich fern | row: fern — tall shuttlecock | new-england, upstate-ny, midwest | C | 1-1.5 m | edible fiddleheads May | sway | P2 |
| lady-fern | Lady fern | row: fern | new-england, midwest, pnw | C | 0.5-1 m | — | sway | P3 |
| royal-fern | Royal fern | row: fern | mid-atlantic, southeast | O | 0.6-1.5 m | — | sway | P3 |
| new-york-fern | New York fern | row: fern | mid-atlantic, appalachia | C | 30-60 cm | — | sway | P3 |
| maidenhair-fern | Maidenhair ferns (northern, five-finger, at springs and grottoes) | row: fern — fans on black wiry stems | appalachia, midwest, ozarks, texas, great-basin, california, pnw | O | 30-60 cm | curtains dripping limestone overhangs | flutter | P3 |
| walking-fern | Walking fern | row: fern — tiny, on mossy rock | upstate-ny, appalachia, ozarks | O | 10-20 cm | evergreen | stiff | P3 |
| small-rock-ferns | Rattlesnake, ebony spleenwort, fragile and bulblet ferns | row: fern — small | appalachia, ozarks, gulf | O | 15-40 cm | — | sway | P3 |
| chain-ferns | Netted and giant chain ferns | row: fern — giant chain fern 1.5-3 m | southeast, california | O | 0.5-3 m | — | sway | P3 |
| deer-fern | Deer fern | row: fern — neat ladder fronds | pnw | C | 0.3-0.7 m | evergreen | sway | P2 |
| oak-fern | Oak fern | row: fern — delicate triangles | pnw | O | 20-40 cm | — | sway | P3 |
| western-small-ferns | Goldback fern and California polypody | row: fern | california | O | 15-40 cm | summer-dormant | sway | P3 |
| leather-fern | Leather fern | row: fern — huge, at mangrove edges | florida | O | 2-3 m | evergreen | sway | P3 |
| boston-fern-kin | Sword fern relatives (Boston fern) | row: fern | florida | C | 0.5-1 m | evergreen | sway | P3 |

## 4. Grasses, sedges and rushes

Bunchgrasses are rows on the `clump` form (beach grass is the one that exists). Sods and low
carpets are rows on the wild grass tufts (`grass`, `world/grass.ts`). A prairie is thousands of
lite clumps, so each needs a field version under the garden budget.

| id | Name | Build | Regions | C | Size | Seasons / states | Animation & behaviour | P |
|---|---|---|---|---|---|---|---|---|
| american-beachgrass | American beachgrass (marram) | have: beachgrass | new-england, mid-atlantic, southeast, midwest | C | 0.6-1 m | tawny in winter; snow fencing | bend in the sea wind | P2 |
| european-beachgrass | European beachgrass | row: beachgrass — dense, dune-binding | pnw, california | C | 0.6-1.2 m | tawny in winter | bend | P2 |
| sea-oats | Sea oats | row: clump — tall, drooping golden oat-like heads | southeast, florida, gulf, texas | C | 1-2 m | gold seed heads late summer | bend; seed heads nod | P2 |
| big-bluestem | Big bluestem ("turkeyfoot") | row: clump — tall, three-pronged heads | plains, midwest, texas | C | 1.5-2.5 m by late summer | blue-green summer; bronze-purple fall | ripple; turkey-foot heads nod | P1 |
| little-bluestem | Little bluestem | row: clump — bunch | plains, midwest, texas, ozarks | C | 0.5-1 m | blue-green summer; glowing copper-red all fall and winter | ripple | P1 |
| indiangrass-switchgrass | Indiangrass and switchgrass | row: clump — golden plume heads (Indiangrass) | plains, midwest, texas | C | 1-2 m | gold fall | ripple | P2 |
| sideoats-grama | Sideoats grama | row: clump — oats dangling along one side | plains, texas, ozarks | C | 0.4-0.8 m | tan fall | ripple | P2 |
| prairie-cordgrass | Prairie cordgrass | row: clump | plains | O | 1-2 m | gold fall | ripple | P3 |
| blue-grama | Blue grama | row: clump — short, curved "eyelash" heads | plains, rockies, texas, desert-sw | C | 20-40 cm | gray-green; tan winter | ripple | P2 |
| buffalograss | Buffalograss | row: grass — ankle-high sod | plains, texas | C | 10-20 cm | gray-green; tan winter | ripple | P2 |
| northern-wheatgrasses | Western wheatgrass, needle-and-thread, green needlegrass | row: clump — blue-gray; long twisting awns | plains, great-basin | C | 0.3-1 m | straw in summer | ripple; awns twist | P3 |
| wiregrass | Wiregrass | row: clump — fine wiry tufts under longleaf | southeast, florida, gulf | C | 30-60 cm | gold-tan after fire | ripple | P2 |
| broomsedge | Broomsedge | row: clump | southeast | C | 0.5-1 m | bright orange-tan fall and winter | ripple | P2 |
| muhly-grass | Muhly grass (incl. Gulf and Lindheimer muhly) | row: clump — pink-purple cloud of seed heads | southeast, florida, texas | C | 0.6-1 m | pink Oct | ripple | P2 |
| mountain-bunchgrasses | Bluebunch wheatgrass, Idaho fescue, Thurber fescue, mountain muhly | row: clump | rockies, great-basin, pnw | C | 0.3-0.8 m | tan in late summer | ripple | P2 |
| mountain-oatgrass | Mountain oatgrass and sedges of the grassy balds | row: clump | appalachia | O | 30-60 cm | tan fall | ripple | P3 |
| steppe-grasses | Sandberg bluegrass, Indian ricegrass, galleta | row: clump — airy seed heads (ricegrass) | great-basin | C | 20-60 cm | straw summer | ripple | P3 |
| desert-grasses | Big galleta, black grama, tobosa, chino grama | row: clump | desert-sw, texas | C | 20-60 cm | green after monsoon | ripple | P3 |
| buffelgrass | Buffelgrass | row: clump — dense tan clumps on desert hills | desert-sw, texas | C | 0.5-1 m | tan most of the year | ripple | P2 |
| fountain-grass | Fountain grass | row: clump — pink plumes | desert-sw | C | 0.6-1 m | pink plumes | bend | P3 |
| desert-annual-grasses | Red brome and Mediterranean split grass | row: grass | desert-sw | C | 10-30 cm | green Feb-Apr, then straw | ripple | P3 |
| cheatgrass | Cheatgrass | row: grass — short annual carpets | great-basin, rockies, pnw, desert-sw, plains | C | 20-60 cm | green early spring, purple-red May, straw-gold and flammable by Jun | ripple | P2 |
| medusahead | Medusahead | row: grass | great-basin, california | C | 20-50 cm | straw | ripple | P3 |
| planted-range-grasses | Smooth brome and crested wheatgrass | row: clump | plains, great-basin | C | 0.5-1 m | straw summer | ripple | P3 |
| johnsongrass | Johnsongrass | row: clump — coarse, white midrib | southeast, gulf, texas, plains | C | 1-2 m | purple seed plumes along roads | bend | P3 |
| texas-pasture-grasses | King Ranch bluestem and guineagrass | row: clump — gray-green, reddish heads | texas | C | 0.5-1.5 m | reddish heads | ripple | P3 |
| japanese-stiltgrass | Japanese stiltgrass | row: grass — pale bamboo-like low carpet on trails | mid-atlantic, appalachia, southeast | C | 0.3-1 m | tan fall | ripple | P3 |
| cogongrass | Cogongrass | row: clump — yellow-green, red-tipped | southeast, gulf | C | 0.5-1 m | fluffy white plumes spring | ripple | P3 |
| common-reed | Common reed (phragmites, roseau cane) | row: cane† — reed walls | all | C | 3-5 m | purple-tan plumes; tan stalks all winter | bend; plumes toss | P2 |
| giant-reed | Giant reed (Arundo) | row: cane† | texas, desert-sw, california | C | 3-6 m | — | bend | P3 |
| switchcane | Switchcane (giant cane) | row: cane† — native bamboo canebrakes | southeast, gulf | C | 2-5 m | evergreen | bend | P3 |
| pampas-grass | Pampas and jubata grass | row: clump — huge clumps | california | C | 2-3 m | white-pink plumes | plumes toss | P3 |
| ornamental-grasses | Ornamental grasses | row: clump | all | C | 0.5-2 m | feathery plumes in fall | bend | P3 |
| cattails | Cattails (incl. narrow-leaved and hybrid) | row: clump — strap leaves, brown "hot dog" heads | all | C | 1.5-3 m | heads burst to fluff in winter | bend | P2 |
| bulrushes | Bulrushes (incl. alkali bulrush) | row: clump | plains, great-basin, gulf | C | 1-3 m | — | bend | P3 |
| wetland-grasses | Giant cutgrass and maidencane | row: clump | gulf, florida | C | 1-3 m | — | bend | P3 |
| reed-canary-grass | Reed canary grass | row: clump | midwest, pnw | C | 1-2 m | straw winter | bend | P3 |
| wild-rice | Wild rice | row: clump — in water | mid-atlantic, midwest | O | 1-3 m | harvested by canoe late summer | bend | P3 |
| smooth-cordgrass | Smooth cordgrass | row: clump — tall along creeks | new-england, mid-atlantic, southeast, florida, gulf, texas | C | 0.5-2 m | green summer, gold-tan fall and winter | ripple; the marsh runs with waves | P1 |
| salt-meadow-hay | Salt-meadow hay (marsh-hay cordgrass) | row: grass — low "cowlick" swirls | new-england, mid-atlantic, southeast, gulf | C | 0.3-0.6 m | tawny in winter | ripple | P2 |
| black-needlerush | Black needlerush | row: clump — dark gray-green spiky stands | mid-atlantic, southeast, gulf | C | 1-1.5 m | — | stiff | P2 |
| saltgrass | Saltgrass | row: grass | southeast, gulf, texas, great-basin | C | 10-40 cm | — | ripple | P3 |
| sawgrass | Sawgrass | row: clump — saw-edged sedge; the "river of grass" | florida | C | 1-3 m | green-gold; brown in the dry season | ripple | P2 |
| coastal-panicgrasses | Seaside and bitter panicgrass, Gulf bluestem | row: clump | southeast, florida, gulf, texas | C | 0.5-1.5 m | tan winter | bend | P3 |
| cotton-grass | Cotton grass | row: clump — white cotton tufts | upstate-ny, midwest, rockies | O | 30-60 cm | tufts summer | tufts nod | P3 |
| sedges | Pennsylvania sedge and meadow and tundra sedges | row: grass — fine fountain-like carpets | midwest, rockies | C | 15-40 cm | rusty on the tundra late Aug | ripple | P3 |
| california-annual-grassland | California annual grassland: wild oats, ripgut brome, soft chess, foxtail barley | row: grass — tall annual carpets | california | C | 0.3-1 m | bright green Dec-Apr; golden-tan May-Nov: the "golden hills" | ripple | P1 |
| california-bunchgrasses | Purple needlegrass, deergrass, blue wildrye, California fescue | row: clump — fountain-like tufts | california | O | 0.5-1.5 m | — | bend | P3 |

### 4.1 Lawns and pasture

Rows on the wild grass tufts and ground paint: colour, height and the season they go dormant.

| id | Name | Build | Regions | C | Size | Seasons / states | Animation & behaviour | P |
|---|---|---|---|---|---|---|---|---|
| lawn-cool | Cool-season lawn (Kentucky bluegrass, perennial ryegrass, fine fescue; PNW bentgrass and moss) | row: grass — fine-bladed | new-england, upstate-ny, mid-atlantic, midwest, plains, rockies, great-basin, pnw | C | 5-10 cm mown | emerald spring and fall; straw Jul-Aug unless watered (PNW brown Jul-Sep); under snow | ripple when long | P2 |
| lawn-tall-fescue | Tall fescue lawn and KY-31 pasture | row: grass — coarse, clumpy, dark green | mid-atlantic, appalachia, ozarks, plains, southeast | C | 5-10 cm; pasture 0.3-1 m | green all winter; bluish seed heads May (bluegrass pasture) | ripple | P2 |
| lawn-bermuda-zoysia | Bermuda and zoysia lawns (desert lawns overseeded with winter rye) | row: grass — fine, wiry | south, desert-sw, california, appalachia, ozarks, plains | C | 3-5 cm | green Apr-Oct; straw-tan Dec-Mar (rye-green in Phoenix and Las Vegas) | ripple | P2 |
| lawn-st-augustine | St. Augustine lawn (Floratam) | row: grass — wide coarse blue-green blades, spongy | florida, gulf, texas, southeast, california | C | 5-10 cm | green Apr-Oct; greenish all year in south Florida | ripple | P2 |
| lawn-centipede | Centipede lawn | row: grass — apple-green, low | southeast, gulf | C | 3-5 cm | tan in winter | ripple | P3 |
| lawn-bahia | Bahia grass (roadsides, pastures) | row: grass — tall V-shaped seed heads | florida, southeast | C | 10-40 cm | green summer | seed heads bob | P3 |
| lawn-kikuyu | Kikuyu lawn | row: grass | california | O | 5-10 cm | green | ripple | P3 |
| hay-pasture | Hay fields and pasture (alfalfa, orchard grass), with bales | row: grass — taller sward; round and square bales | all | C | 0.3-1 m | cut Jun-Sep; bales on stubble | ripple | P3 |

## 5. Wildflowers and ground cover

Composite heads grow on `stem`, spikes on `spike`, clumps and lilies on `clump`, leafy carpets on
`rosette` or ground paint. A new head shape (cup, bell, umbel, tube, pea spike) is a parameter on
`stem` or `spike`, added by the first row that needs it.

### 5.1 Spring (Feb-May)

| id | Name | Build | Regions | C | Size | Seasons / states | Animation & behaviour | P |
|---|---|---|---|---|---|---|---|---|
| texas-bluebonnet | Texas bluebonnet | row: spike — pea spikes, silvery palmate leaves | texas | C | 30-40 cm | deep blue with white tips (turning maroon) late Mar-Apr; seeded along highways | nod; drifts ripple | P1 |
| big-bend-bluebonnet | Big Bend bluebonnet | row: spike — tall | texas | O | to 1 m | Feb-Apr | nod | P3 |
| california-poppy | California poppy | row: stem — satiny cup head, blue-gray lacy leaves | california | C | 30 cm | orange to yellow Feb-May; cups close at night | nod; cups close at dusk | P1 |
| mexican-gold-poppy | Mexican gold poppy | row: stem — cup head | desert-sw | C | 15-40 cm | orange Feb-Apr after wet winters | nod | P2 |
| sky-lupine | Sky lupine | row: spike — pea spike | california | C | 20-50 cm | sky blue Mar-May, with the poppies | nod | P1 |
| desert-lupine | Desert lupine | row: spike | desert-sw | C | 20-50 cm | blue-purple Feb-Apr | nod | P3 |
| gulf-coast-lupine | Gulf Coast lupine | row: spike | gulf | O | 30-60 cm | blue-lavender spring on dunes | nod | P3 |
| indian-paintbrush | Indian paintbrushes (Texas, scarlet, rosy, sulphur, magenta) | row: spike — bracted spikes | texas, ozarks, rockies, great-basin, california, pnw | C | 20-60 cm | orange-red with bluebonnets (TX, Mar-Apr); red, pink, magenta or yellow in mountain meadows Jul | nod | P2 |
| indian-blanket | Indian blanket (firewheel, blanketflower) | row: stem — red daisy with yellow tips | texas, plains | C | 30-60 cm | Apr-Jul | nod | P2 |
| pink-evening-primrose | Pink evening primrose | row: stem — cup head, carpets medians | texas | C | 20-40 cm | pale pink Mar-May | nod | P2 |
| texas-roadside-flowers | Winecup, Mexican hat, greenthread, prairie verbena, horsemint | row: stem | texas, plains | C | 20-80 cm | magenta, red-yellow, yellow, purple Apr-Jun | nod | P3 |
| coreopsis | Coreopsis | row: stem — yellow daisy | southeast, texas | C | 30-60 cm | yellow roadside drifts May | nod | P3 |
| pasque-flower | Pasque flower | row: stem — lavender cups, furry | plains, rockies | O | 10-20 cm | Mar-Apr | nod | P2 |
| plains-spring-flowers | Prairie smoke, wild indigo, prairie phlox | row: stem — pink feathery heads (smoke) | plains | O | 20-60 cm | Apr-Jun | nod | P3 |
| bloodroot | Bloodroot | row: stem — white star over one lobed leaf | upstate-ny, mid-atlantic, appalachia, midwest, ozarks | O | 15 cm | Mar-Apr | nod | P3 |
| hepatica | Hepatica | row: stem | upstate-ny, appalachia, midwest | O | 10 cm | lavender to white Mar-Apr | nod | P3 |
| spring-beauty | Spring beauty | row: ground paint — pink-striped carpets | upstate-ny, mid-atlantic, appalachia, midwest | C | 10 cm | Mar-Apr | — | P3 |
| trout-lily | Trout lily | row: clump — mottled leaves, nodding yellow lily | new-england, upstate-ny, mid-atlantic, appalachia, midwest | C | 15 cm | Apr | nod | P3 |
| dutchmans-breeches | Dutchman's breeches and squirrel corn | row: stem — hanging white pantaloons | upstate-ny, appalachia, midwest, ozarks | O | 15-25 cm | Apr | flowers swing | P3 |
| virginia-bluebells | Virginia bluebells | row: stem — nodding sky-blue bells from pink buds | mid-atlantic, appalachia, midwest | C | 30-60 cm | carpets Apr; gone by Jun | nod | P2 |
| mayapple | Mayapple | row: rosette — umbrella leaves in colonies | upstate-ny, appalachia, midwest, ozarks | C | 30-45 cm | white flower under the umbrella May | umbrellas bob | P2 |
| woodland-wildflowers | Wild geranium, foamflower, rue anemone, toothwort, large-flowered bellwort, wild ginger | row: stem | appalachia, midwest, ozarks, pnw | C | 10-60 cm | Apr-May | nod | P3 |
| dwarf-crested-iris | Dwarf crested iris | row: clump | appalachia | O | 10-15 cm | lavender Apr | nod | P3 |
| fire-pink | Fire pink and Indian pink | row: stem — scarlet stars / red tubes tipped yellow | appalachia, ozarks | O | 30-50 cm | Apr-Jun | nod | P3 |
| wild-phlox | Wild blue phlox and wild sweet William | row: stem | appalachia, ozarks | C | 30-50 cm | lavender-blue Apr-May | nod | P3 |
| jack-in-the-pulpit | Jack-in-the-pulpit | row: clump — hooded spathe | appalachia, midwest | O | 30-60 cm | red berries fall | stiff | P3 |
| wild-columbine | Wild columbine | row: stem — red-yellow spurred flowers on bluff ledges | ozarks, appalachia | O | 30-60 cm | Apr-May | nod | P3 |
| birds-foot-violet | Bird's-foot violet and violets | row: ground paint — purple dots | ozarks, east | C | 5-15 cm | Apr | — | P3 |
| shooting-star | Shooting stars | row: stem — swept-back petals | ozarks, california, pnw | O | 15-40 cm | Apr-Jun | nod | P3 |
| great-white-trillium | Great white (large-flowered) trillium | row: stem — three white petals over three leaves | upstate-ny, appalachia, midwest | C | 30-40 cm | carpets May, aging pink | nod | P2 |
| red-trilliums | Red trilliums (wake-robin, Vasey's, prairie trillium, Ozark wake-robin) | row: stem — maroon three-petal flower | new-england, upstate-ny, appalachia, midwest, ozarks | O | 20-40 cm | Apr-May | nod | P3 |
| painted-yellow-trillium | Painted and yellow trilliums | row: stem | new-england, appalachia | O | 20-40 cm | Apr-May | nod | P3 |
| western-trillium | Western trillium | row: stem | pnw | C | 20-40 cm | white turning pink Mar-Apr | nod | P3 |
| ramps | Wild leeks (ramps) | row: rosette — pairs of broad smooth leaves | upstate-ny, appalachia | C | 20-30 cm | carpets Apr before the trees leaf out | stiff | P2 |
| eastern-skunk-cabbage | Skunk cabbage (eastern) | row: rosette — purple-mottled hood, then huge leaves | upstate-ny, new-england, mid-atlantic | C | 0.5-1 m | hood pushes through snow Mar | stiff | P3 |
| western-skunk-cabbage | Western skunk cabbage | row: rosette — bright yellow spathe, then huge leaves | pnw | C | 0.5-1.5 m | yellow in swamps Mar | stiff | P2 |
| marsh-marigold | Marsh marigold | row: mound — glossy leaves, yellow cups | upstate-ny, rockies | O | 20-40 cm | Apr-Jun | nod | P3 |
| lesser-celandine | Lesser celandine | row: ground paint — glossy hearts, buttercup stars | mid-atlantic | C | 5-10 cm | carpets floodplains Mar; gone by Jun | — | P3 |
| garlic-mustard | Garlic mustard | row: stem — small white four-petal flowers | mid-atlantic, midwest | C | 0.3-0.6 m | May | nod | P3 |
| bunchberry | Bunchberry | row: rosette — four white bracts, then red berries | new-england, upstate-ny, midwest, pnw | C | 10-20 cm | white May-Jun; red berry clusters late summer | stiff | P2 |
| north-woods-carpet | Canada mayflower, goldthread, Clintonia, wood sorrel, wintergreen, partridgeberry | row: ground paint — low glossy carpets | new-england, upstate-ny, midwest | C | 5-20 cm | partridgeberry and wintergreen red berries | — | P3 |
| pink-ladys-slipper | Pink lady's slipper | row: stem — pink pouch on a stalk | new-england | O | 20-40 cm | Jun | nod | P3 |
| atamasco-spiderwort | Atamasco lily and spiderworts (incl. Ozark spiderwort) | row: clump | southeast, ozarks | O | 20-50 cm | white (lily), blue-purple (spiderwort) Apr-May | nod | P3 |
| missouri-evening-primrose | Missouri evening primrose | row: stem — huge yellow cups | ozarks | C | 20-40 cm | May-Jul on glades | nod | P2 |
| glade-flowers | Glade phlox, fameflower, glade onion, rose verbena | row: stem — small | ozarks, appalachia | O | 10-40 cm | Apr-Jun | nod | P3 |
| owls-clover | Owl's clover | row: spike — pink | desert-sw, california | C | 10-40 cm | Mar-Apr | nod | P3 |
| desert-annuals | Desert sand verbena, desert lily, desert dandelion, desert sunflower | row: stem | desert-sw | C | 10-60 cm | pink, white, yellow Feb-Apr after wet winters | nod | P3 |
| globemallow | Globemallow | row: stem — orange cups | desert-sw, great-basin | C | 0.3-1 m | Mar-Jun | nod | P3 |
| desert-marigold | Desert marigold | row: stem — yellow daisy | desert-sw, texas | C | 30-50 cm | Mar-Oct | nod | P3 |
| penstemons | Penstemons (Parry's, firecracker, Palmer's) | row: spike — tubular | desert-sw, great-basin, rockies | O | 0.3-1.2 m | pink, red Mar-Jun | nod | P3 |
| goldfields | Goldfields | row: ground paint — yellow carpets | california | C | 10-25 cm | Mar-Apr | — | P2 |
| ca-spring-flowers | Baby blue-eyes, tidy tips, fiddleneck, blue dicks, Chinese houses, blue-eyed grass | row: stem | california | C | 10-50 cm | Feb-May | nod | P3 |
| douglas-iris | Douglas iris | row: clump | california | O | 20-40 cm | lavender spring on the coast | nod | P3 |
| camas | Camas | row: spike — blue | pnw | C | 30-60 cm | carpets meadows blue Apr-May | nod | P2 |
| pnw-prairie-flowers | Chocolate lily and Oregon sunshine | row: stem | pnw | O | 15-50 cm | Apr-Jun | nod | P3 |
| fawn-glacier-lilies | Fawn, glacier and avalanche lilies | row: clump — nodding lily at snowmelt | pnw, rockies | C | 15-30 cm | at snowmelt, May-Jul | nod | P3 |
| westside-forest-herbs | Pacific bleeding heart, vanilla leaf, false lily-of-the-valley, inside-out flower, twinflower, fringecup, piggyback plant | row: rosette — forest floor | pnw | C | 10-50 cm | Mar-Jun | stiff | P3 |
| oregon-oxalis | Oregon oxalis (redwood sorrel) | row: ground paint — clover-like carpets | pnw, california | C | 5-15 cm | white-pink flowers spring | — | P2 |
| arrowleaf-balsamroot | Arrowleaf balsamroot | row: stem — big yellow sunflowers over silver arrow leaves | rockies, great-basin, pnw | C | 30-60 cm | every foothill yellow Apr-Jun | nod | P2 |
| mules-ears | Mule's ears | row: stem | rockies, great-basin | C | 30-60 cm | yellow May-Jun | nod | P3 |
| bitterroot | Bitterroot | row: rosette — pink stars flat on the ground | rockies, pnw | R | 5 cm | May-Jun | stiff | P3 |
| sego-lily | Sego lily | row: stem — white tulip cups | great-basin | O | 20-40 cm | May-Jun | nod | P3 |
| steppe-spring-flowers | Desert parsley, sagebrush buttercup, phlox | row: stem | pnw, great-basin | C | 5-30 cm | Mar-May | nod | P3 |
| black-mustard | Black mustard (and Sahara mustard) | row: stem — tall branching | california, desert-sw | C | 1-2 m | yellow haze over hills Mar | sway | P2 |
| henbit-deadnettle | Henbit and purple deadnettle | row: ground paint — purple haze on fields | southeast, midwest, gulf | C | 10-20 cm | Feb-Apr | — | P3 |

### 5.2 Summer (Jun-Aug)

| id | Name | Build | Regions | C | Size | Seasons / states | Animation & behaviour | P |
|---|---|---|---|---|---|---|---|---|
| bigleaf-lupine | Bigleaf and mountain lupines | row: spike — tall spires | new-england, rockies, pnw, california | C | 0.5-1.5 m | purple, pink and white Jun (Maine roadsides), Jul in mountain meadows | nod | P2 |
| queen-annes-lace | Queen Anne's lace | row: stem — flat white umbel, dark centre dot | east, plains, pnw | C | 0.5-1.2 m | Jun-Sep; curls into a "bird's nest" | nod | P2 |
| chicory | Chicory | row: stem — wiry, sky-blue flowers | all but desert-sw | C | 0.5-1 m | Jul-Sep; closed by afternoon | nod | P2 |
| black-eyed-susan | Black-eyed Susan | row: stem — gold daisy, brown cone | east, plains, midwest | C | 0.3-0.9 m | Jun-Sep | nod | P2 |
| common-milkweed | Common and showy milkweed | row: stem — broad gray-green leaves, dusty-pink balls; warty pods | east, plains, west | C | 1-1.5 m | flowers Jun-Jul; pods split to silk in fall; monarch caterpillars | nod; silk drifts | P2 |
| butterfly-weed | Butterfly weed | row: stem — orange clusters | east, plains, texas | C | 30-60 cm | Jun-Aug | nod | P3 |
| purple-coneflower | Purple coneflower | have: coneflower | midwest, plains, ozarks | C | 0.6-1 m | Jun-Sep | nod | P2 |
| other-coneflowers | Pale, Ozark, Tennessee and prairie coneflowers | row: coneflower — drooping petals | plains, midwest, ozarks, appalachia | O | 0.4-1 m | Jun-Aug | nod | P3 |
| tallgrass-flowers | Compass plant, rattlesnake master, wild bergamot | row: stem — compass plant's tall yellow heads | plains, midwest | C | 0.6-2.5 m | Jul-Aug; lavender pom-poms (bergamot) | nod | P3 |
| blazing-star | Blazing star | row: spike — purple | plains, midwest | C | 0.6-1.2 m | Aug | nod | P2 |
| joe-pye-ironweed | Joe-Pye weed and ironweed | row: stem — tall mauve and purple heads | mid-atlantic, appalachia, midwest, ozarks | C | 1-2 m | Aug-Sep | sway | P3 |
| roadside-invaders | Crown vetch, sericea lespedeza, wild parsnip | row: stem — pink banks on roadcuts (vetch), yellow umbels (parsnip) | appalachia, midwest, plains, ozarks, upstate-ny | C | 0.3-1.5 m | Jun-Aug | sway | P3 |
| giant-hogweed | Giant hogweed | row: stem — huge white umbrellas | upstate-ny | R | to 4 m | Jun-Jul | sway | P3 |
| teasel | Teasel | row: stem — spiny egg-shaped heads | midwest | C | 1-2 m | dead heads stand all winter | stiff | P3 |
| thistles | Thistles (bull, musk, Canada, Italian, artichoke) | row: stem — purple shaving-brush heads; musk's big nodding heads | all | C | 0.5-2 m | Jun-Sep | nod | P3 |
| yellow-starthistle | Yellow starthistle | row: stem — spiny yellow | california | C | 0.3-1 m | fills summer Valley roadsides | stiff | P3 |
| common-mullein | Common mullein | row: rosette — fuzzy gray felt; second-year 1-2 m yellow spike | all | C | 1-2 m | spike Jun-Aug; dead spikes stand | spike sways | P2 |
| fireweed | Fireweed | row: spike — magenta | rockies, pnw, new-england | C | 1-2 m | Jul-Aug over burns and clearcuts; red leaves fall | nod | P2 |
| foxglove | Foxglove | row: spike — spotted purple-pink bells | pnw | C | 1-2 m | Jun | nod | P3 |
| pnw-roadside-weeds | Oxeye daisy, tansy ragwort, herb Robert | row: stem | pnw | C | 0.2-1 m | Jun-Aug | nod | P3 |
| purple-loosestrife | Purple loosestrife | row: spike — magenta, filling marshes | new-england, upstate-ny, midwest, pnw | C | 1-2 m | Jul-Aug | sway | P3 |
| rose-mallow | Rose mallow (swamp hibiscus) | row: stem — dinner-plate pink or white flowers | mid-atlantic, gulf | C | 1-2 m | Jul-Aug | nod | P3 |
| colorado-columbine | Colorado blue columbine | row: stem — blue-violet and white spurred flowers | rockies | C | 40-60 cm | Jun-Jul in aspen groves | nod | P2 |
| mountain-meadow-flowers | Mountain bluebells, aspen and showy daisies, sticky geranium, larkspur, monkshood, elephant's head | row: stem | rockies, california, pnw | C | 0.2-1.5 m | Jul-early Aug, dense carpets | nod | P2 |
| beargrass | Beargrass | row: clump — tall cream plume | rockies, pnw | C | 1-1.5 m | Jun-Jul (Glacier) | plume sways | P3 |
| alpine-cushions | Moss campion, alpine forget-me-not, sky pilot, old man of the mountain, alpine avens | row: mound — tiny cushions above treeline | rockies | C | 2-20 cm | Jul; tundra rust-red late Aug | stiff | P3 |
| sierra-meadow-flowers | Corn lily, Sierra lily, monkeyflower, bistort | row: stem | california, pnw | C | 0.3-2 m | Jul | nod | P3 |
| pnw-mountain-meadow | Magenta paintbrush, heather, aster and partridgefoot of Cascade meadows | row: stem | pnw | C | 10-60 cm | Jul-Aug; huckleberry red Sep | nod | P3 |
| snow-plant | Snow plant | row: spike — bright red asparagus spike in the duff | california | R | 20-30 cm | May-Jun | stiff | P3 |
| ca-summer-lilies | Mariposa, Humboldt and leopard lilies, farewell-to-spring | row: stem — cup and turk's-cap heads | california | O | 0.3-2 m | May-Jul | nod | P3 |
| matilija-poppy | Matilija poppy | row: stem — huge white fried-egg flowers | california | O | 1-2.5 m | May-Jul | nod | P3 |
| northern-pitcher-plant | Pitcher plant (northern purple) | row: rosette — red-veined tubes in sphagnum | upstate-ny, mid-atlantic, midwest | O | 20-30 cm | nodding maroon flowers May-Jun | stiff | P3 |
| southern-pitcher-plants | Southern pitcher plants (trumpet, hooded, white-top, yellow, parrot) | row: rosette — fields of tall hooded tubes | southeast, gulf | O | 0.3-0.9 m | flowers Mar-Apr | stiff | P3 |
| sundews-flytrap | Sundews and Venus flytrap | row: rosette — tiny red sticky rosettes; hinged green traps | mid-atlantic, southeast | R | 2-10 cm | flytrap only near Wilmington NC | traps snap shut | P3 |
| bog-orchids | Savanna and bog orchids | row: stem | southeast | R | 20-60 cm | summer | nod | P3 |
| indian-pipe | Indian pipe | row: stem — waxy white ghost stalks | new-england | O | 10-20 cm | Jul | stiff | P3 |
| dog-fennel | Dog fennel | row: stem — feathery green plumes | southeast | C | 1-2 m | late summer | sway | P3 |
| fennel | Fennel | row: stem — feathery, anise-scented | california | C | 1-2 m | yellow umbels summer | sway | P3 |
| great-basin-summer-flowers | Prince's plume, evening primroses (white), Rocky Mountain bee plant | row: stem | great-basin | C | 0.3-1.5 m | May-Aug; primroses close by noon | nod | P3 |
| sacred-datura | Sacred datura | row: mound — huge white trumpets opening at dusk | great-basin, desert-sw | O | 0.5-1 m | Jun-Sep, at dusk (sphinx moths) | trumpets open at dusk | P3 |
| hanging-garden-flowers | Hanging gardens: golden and red columbines, monkeyflowers, cardinal flower | row: stem — on dripping sandstone alcoves | great-basin | O | 0.3-1 m | Apr-Sep | nod | P3 |
| sea-lavender-glasswort | Sea lavender and glasswort (pickleweed, samphire, seepweed) | row: grass — lavender haze; glasswort red in fall | new-england, mid-atlantic, southeast, gulf, texas, great-basin | C | 10-50 cm | sea lavender Aug; glasswort red Oct | ripple | P3 |
| dune-flowers-east | Seaside goldenrod, beach heather, dusty miller, sea rocket, beach pea, sand cherry | row: stem — low dune plants | new-england, mid-atlantic, midwest | C | 0.2-1.5 m | goldenrod yellow plumes Sep | nod | P3 |
| beach-morning-glory | Beach morning glory (railroad vine) | row: ground paint — runners down the sand, pink-purple flowers | southeast, florida, gulf, texas | C | 10 cm; runners 10 m | summer | — | P3 |
| dune-flowers-south | Dune sunflower and beach elder | row: stem | southeast, florida | C | 0.5-1 m | yellow summer | nod | P3 |
| dune-flowers-west | Sand verbena (pink, yellow), beach primrose, beach bur, sea thrift, seaside daisy, beach strawberry | row: ground paint — low mats and cushions | california, pnw | C | 5-30 cm | spring-summer | — | P3 |
| mexican-petunia | Mexican petunia | row: stem — purple trumpets | florida | C | 1 m | summer | nod | P3 |

### 5.3 Late summer and fall (Aug-Nov)

| id | Name | Build | Regions | C | Size | Seasons / states | Animation & behaviour | P |
|---|---|---|---|---|---|---|---|---|
| goldenrods | Goldenrods | row: spike — arching golden plumes | east, plains, texas, rockies | C | 0.5-2 m | Aug-Oct; whole fields yellow | plumes bend | P2 |
| asters | Asters (New England, smooth, heath, mountain) | row: stem — purple, lavender or white daisies | east, plains, rockies, pnw | C | 0.3-1.5 m | Sep-Oct, mixed with goldenrod | nod | P2 |
| common-sunflower | Common (wild) sunflower | row: sunflower — branching, many small heads | plains, texas, midwest | C | 1-3 m | roadsides gold Aug-Sep | heads nod | P2 |
| maximilian-sunflower | Maximilian sunflower | row: sunflower — tall stems of small heads | plains, texas | C | 1-3 m | Sep-Oct | sway | P2 |
| ragweed | Ragweed | row: stem — plain green, ferny | east, plains | C | 0.3-1.5 m | late summer | sway | P3 |
| california-fuchsia | California fuchsia | row: stem — red tubes | california | O | 30-60 cm | Aug-Oct (hummingbirds) | nod | P3 |

### 5.4 Ground cover and lawn weeds

| id | Name | Build | Regions | C | Size | Seasons / states | Animation & behaviour | P |
|---|---|---|---|---|---|---|---|---|
| dandelion | Dandelion | row: rosette — toothed leaves, yellow heads, white puffballs | all | C | 5-30 cm | yellow Apr-May (and all summer); puffballs | puffballs shed seeds in wind | P2 |
| lawn-weeds | White clover, plantains, crabgrass, ground ivy (creeping Charlie), wild onion and garlic | row: ground paint — patches in lawns | all | C | 5-20 cm | clover white Jun; crabgrass browns Sep | — | P3 |
| southern-lawn-weeds | Dollarweed and sandspurs | row: ground paint — coin leaves in wet lawns | south | C | 5-20 cm | — | — | P3 |
| galax | Galax | row: rosette — shiny round heart leaves under rhododendron | appalachia | C | 10-40 cm | bronze-red in winter; white bottlebrush spikes | stiff | P3 |
| clubmosses | Clubmosses | row: ground paint — tiny evergreen "pines" | midwest, new-england | C | 10-20 cm | evergreen | stiff | P3 |
| iceplant | Iceplant (Carpobrotus) | row: ground paint — thick finger leaves on dunes and freeway banks | california | C | 15-30 cm | big pink or yellow daisies; reddens in drought | — | P2 |
| periwinkle-asian-jasmine | Periwinkle and Asian jasmine | row: ground paint — glossy carpets | california, texas | C | 10-20 cm | blue flowers (periwinkle) | — | P3 |

## 6. Wetland and water plants

| id | Name | Build | Regions | C | Size | Seasons / states | Animation & behaviour | P |
|---|---|---|---|---|---|---|---|---|
| american-lotus | American lotus | new: floating† — huge round blue-green leaves held above the water | gulf | O | leaves 0.3-0.6 m across, 1 m up; flowers 20-25 cm | pale yellow dinner-plate flowers Jun-Jul; pepper-shaker pods | leaves rock; pods nod | P2 |
| spatterdock | Spatterdock | row: floating† — big heart leaves flat on the water | mid-atlantic, florida | C | leaves 30-40 cm | yellow ball flowers summer | bob | P3 |
| water-hyacinth | Water hyacinth | row: floating† — rafts of glossy bulbous leaves | florida, gulf, texas | C | 0.3-0.6 m tall; rafts to whole bayous | lavender orchid-like spikes summer | rafts drift and bob | P2 |
| water-lettuce-salvinia | Water lettuce and giant salvinia | row: floating† — floating rosettes; mats of folded fuzzy leaves | florida, gulf | C | 10-20 cm | summer mats | bob | P3 |
| duckweed | Duckweed and watermeal | row: ground paint (water surface) — solid lime-green carpet | gulf, southeast, florida | C | carpets the whole surface | summer; gone in winter | parts in a wake, closes behind | P1 |
| alligatorweed-hydrilla | Alligatorweed and hydrilla | row: ground paint (water edge) — mats | florida, gulf | C | mats | summer | — | P3 |
| pickerelweed | Pickerelweed | row: clump — heart leaves, blue spikes | mid-atlantic, florida, gulf, midwest | C | 0.6-1 m | blue spikes summer | bend | P3 |
| arrowhead | Arrowhead (duck potato) and arrow arum | row: clump — arrow leaves | mid-atlantic, florida, gulf, midwest | C | 0.5-1 m | white flowers summer | bend | P3 |
| alligator-flag | Alligator flag | row: clump — tall paddle leaves | florida | O | 1.5-3 m | purple flower stalks | leaves flap | P3 |
| swamp-spider-lilies | Swamp lily and spider lily | row: clump — white spidery flowers | florida, gulf | O | 0.5-1 m | spring-summer | nod | P3 |
| louisiana-iris | Louisiana irises | row: clump — iris heads on 1 m stalks | gulf | O | 1 m | blue, purple, red, copper or yellow Apr | nod | P3 |
| yellow-flag-iris | Yellow flag iris | row: clump | pnw | O | 1 m | yellow May-Jun | nod | P3 |
| golden-club | Golden club | row: clump — gold-tipped white spikes | mid-atlantic | O | 30 cm | spring | stiff | P3 |
| watercress-water-willow | Watercress and water willow | row: clump — in spring branches and on gravel bars | ozarks | C | 0.2-1 m | green all year (watercress) | bend in current | P3 |
| smartweed | Smartweed | row: stem — pink spikes on pothole edges | plains | C | 0.3-1 m | Aug-Sep | nod | P3 |
| giant-kelp | Giant kelp | new: kelp† — olive-brown fronds with gas bulbs; beach-cast heaps with flies | california | C | 30 m long; canopies offshore | all year | drift in the surge | P3 |
| bull-kelp | Bull kelp and sea palm | row: kelp† — long whips with a round bulb; sea palm on surf-pounded rocks | pnw, california | C | 10-30 m | tangles wash up after storms | drift | P3 |
| rockweed | Rockweed and knotted wrack, Irish moss | row: kelp† — thick olive-brown mats draped over rocks at low tide | new-england, pnw | C | 0.3-1 m | dark red Irish moss lower down | drift when awash | P2 |
| sea-lettuce-eelgrass | Sea lettuce and eelgrass | row: kelp† — bright green sheets; green ribbons ashore | mid-atlantic, pnw, new-england | C | 0.2-1 m | — | drift | P3 |
| sargassum | Sargassum | row: kelp† — golden-brown floating mats of berry-like bladders | florida, texas | C | mats metres wide | piles on beaches in summer | bob | P3 |

## 7. Hangers, vines and epiphytes

Hangers grow on a tree's `TreePlan` boughs (`hanger†`), so they sit where the limbs are. Vines
grow over a host (`vine†`): a tree, a pole, a wall, a fence.

| id | Name | Build | Regions | C | Size | Seasons / states | Animation & behaviour | P |
|---|---|---|---|---|---|---|---|---|
| hanging-moss | Hanging mosses (cat-tail moss and others) | new: hanger† — thick green-gold curtains and beards from limbs; trunks wrapped in green | pnw, california | C | curtains 0.5-1 m | greener in the wet season | swing in the wind; drip after rain | P1 |
| licorice-fern | Licorice fern | row: hanger† — fronds sprouting from the moss along limb tops | pnw | C | 10-30 cm fronds | green in winter, dormant in summer | sway | P1 |
| spanish-moss | Spanish moss | row: hanger† — silvery gray-green curtains of thread-like strands | mid-atlantic, southeast, florida, gulf, texas | C | strands 0.5-6 m | gray, greener after rain | slow pendulum swing; strands twist and part | P1 |
| resurrection-fern | Resurrection fern | row: hanger† — mats along the tops of big oak limbs | southeast, florida, gulf, texas | C | fronds 10-20 cm | brown and curled in drought; bright green within hours of rain | flips state with the rain | P1 |
| ball-moss | Ball moss | row: hanger† — gray tufted balls on limbs, wires and fences | florida, gulf, texas | C | balls 5-15 cm | gray all year; oaks can look gray | stiff | P1 |
| lace-lichen | Lace lichen | row: hanger† — pale gray-green net-like strands from coast and valley oaks | california | C | 0.3-1 m | all year (fog belt) | swing | P1 |
| usnea | Old man's beard (Usnea) | row: hanger† — pale gray-green beards on spruce, fir and oak | new-england, upstate-ny, appalachia, midwest, california, pnw | C | 10-30 cm | all year | swing | P2 |
| hair-lichens | Witch's hair (Alectoria) and horsehair lichen (Bryoria) | row: hanger† — pale green / dark brown hanging strands | pnw, rockies | C | 10-40 cm | all year | swing | P3 |
| wolf-lichen | Wolf lichen | row: hanger† — fluorescent chartreuse tufts on dead lower branches | rockies, pnw | C | 5-15 cm | all year | stiff | P2 |
| leafy-lichens | Lungwort (Lobaria), dog lichens, oakmoss lichen | row: hanger† — lettuce-like sheets that fall after storms | pnw, california | C | 5-30 cm | all year | stiff | P3 |
| wild-pines | Wild pines (Tillandsia airplants: giant, cardinal) | row: hanger† — gray-green strap rosettes perched on branches | florida | C | 0.2-1 m | red flower spikes | stiff | P3 |
| epiphytic-orchids | Butterfly orchid and ghost orchid | row: hanger† — small orchids on cypress and pond apple | florida | R | 5-30 cm | summer flowers | stiff | P3 |
| american-mistletoe | American mistletoe | row: hanger† — green leafy balls | appalachia, southeast, gulf, ozarks, texas | C | 0.3-1 m | obvious in bare winter crowns | stiff | P2 |
| western-mistletoes | Oak, desert and juniper mistletoes | row: hanger† — green-yellow clumps; desert's reddish leafless clumps with pink berries; juniper's orange-green | california, pnw, desert-sw, great-basin | C | 0.2-1 m | bare-crown winter visibility (oak) | stiff | P3 |
| dwarf-mistletoe | Dwarf mistletoe witches' brooms | row: hanger† — dense brooms on conifers | rockies, great-basin, california, pnw | C | 0.5-1.5 m | all year | stiff | P3 |
| kudzu | Kudzu | new: vine† — big three-leaflet leaves draping whole trees, poles and slopes into green "topiary" | southeast, appalachia, gulf, ozarks, texas, florida, mid-atlantic | C | sheets 10-30 m high | full stretch in summer; purple grape-scented spikes Aug; brown dead tangles in winter | leaves flutter over the mantle; slow ripples | P1 |
| english-ivy | English ivy (climbing and carpeting) | row: vine† — dark glossy lobed leaves smothering trunks to the crown | mid-atlantic, southeast, midwest, pnw, california | C | to 20 m up; ground carpets | evergreen | stiff | P2 |
| other-ivies | Algerian ivy, Cape ivy, periwinkle and wintercreeper | row: vine† | california, midwest | C | to 10 m | evergreen | stiff | P3 |
| boston-ivy | Boston ivy | row: vine† — on brick (college towns, Wrigley Field) | new-england, midwest, plains, rockies | C | to 15 m | crimson fall; bare in winter | flutter | P3 |
| poison-ivy | Poison ivy (eastern and western) | row: vine† — hairy rope-like trunk vines with arm-like branches; also shrubs and carpets | all but desert-sw, pnw | C | to 20 m up | red-orange fall; white berries | flutter | P2 |
| virginia-creeper | Virginia creeper (incl. thicket creeper) | row: vine† — five leaflets on trunks, walls and fences | east, plains, texas, rockies, desert-sw, great-basin | C | to 15 m | crimson fall; blue berries | flutter | P2 |
| wild-grapes | Wild grapes (incl. canyon, Arizona and California grapes) | row: vine† — big heart leaves, shaggy "Tarzan" lianas hanging from treetops | all | C | to 20 m | yellow fall; purple fruit | lianas swing | P2 |
| muscadine | Muscadine (scuppernong) and mustang grape | row: vine† — round toothed leaves; felty-backed (mustang) | southeast, florida, gulf, texas | C | to 20 m | bronze or purple grapes Sep | lianas swing | P3 |
| wisteria | Chinese and Japanese wisteria | row: vine† — woody lianas 15-20 m into pines | mid-atlantic, southeast, gulf, appalachia | C | to 20 m | hanging purple clusters late Mar-May | clusters swing | P2 |
| porcelain-berry-mile-a-minute | Porcelain berry and mile-a-minute | row: vine† — smothering vacant lots | mid-atlantic | C | to 8 m | berries blue, purple, turquoise, pink | flutter | P3 |
| oriental-bittersweet | Oriental bittersweet | row: vine† — twisting up and strangling roadside trees | new-england, upstate-ny, mid-atlantic, appalachia, midwest | C | to 18 m | yellow capsules open to orange-red berries in fall | stiff | P3 |
| japanese-honeysuckle | Japanese honeysuckle | row: vine† — smothering fences and shrubs | east, texas | C | to 10 m | white-to-yellow fragrant flowers May-Jun | flutter | P2 |
| trumpet-creeper | Trumpet creeper and crossvine | row: vine† — on fences, poles and dunes | mid-atlantic, appalachia, southeast, gulf, texas, ozarks | C | to 12 m | orange trumpets Jul-Aug (crossvine Apr) | flutter; hummingbirds visit | P3 |
| carolina-jessamine | Carolina jessamine | row: vine† | southeast | C | to 6 m | yellow trumpets Feb-Mar | flutter | P3 |
| coral-honeysuckle | Coral and orange honeysuckles | row: vine† | southeast, gulf, texas, pnw | O | to 6 m | red or orange tubes spring | flutter | P3 |
| greenbrier | Greenbrier (smilax, catbrier) | row: vine† — thorny green stems, round glossy leaves | east, texas | C | to 6 m | evergreen in the south | stiff | P3 |
| dutchmans-pipe | Dutchman's pipe (pipevine, incl. California pipevine) | row: vine† — big heart leaves high in the coves | appalachia, california | O | to 10 m | pipe-shaped flowers; pipevine swallowtail host | flutter | P3 |
| swallow-worts | Pale and black swallow-worts | row: vine† — twining, choking fields | upstate-ny | C | to 2 m | — | flutter | P3 |
| air-potato | Air potato | row: vine† — heart leaves, hanging potato-like bulbils | florida | C | to 20 m | — | flutter | P3 |
| climbing-ferns | Old World and Japanese climbing ferns | row: vine† — green curtains over whole tree islands | florida | C | to 30 m | evergreen | flutter | P3 |
| gulf-vines | Rattan vine (supplejack), peppervine, cat's claw vine | row: vine† — smooth woody coils; yellow trumpets on walls (cat's claw) | gulf, texas | C | to 15 m | — | stiff | P3 |
| confederate-jasmine | Confederate (star) jasmine | row: vine† — on fences | southeast, gulf | C | to 6 m | white stars Apr-May | flutter | P3 |
| clematis | Virgin's bower, western white clematis, old man's beard clematis, snapdragon vine | row: vine† — feathery seed heads | texas, rockies, great-basin, california, pnw | O | to 10 m | white flowers; silky seed plumes in fall | flutter | P3 |
| wild-cucumber | Wild cucumber (incl. manroot) | row: vine† — spiky green balloon fruit | plains, california | O | to 8 m | fruit late summer | flutter | P3 |
| bougainvillea | Bougainvillea | row: vine† — on walls | florida, gulf, desert-sw, california | C | to 10 m | magenta most of the year | flutter | P2 |
| town-vines | Passionflower, trumpet vines, morning glory, allamanda, pothos and philodendron | row: vine† — on fences, walls and palm trunks | california, florida | C | to 10 m | summer flowers; giant pothos leaves on palms | flutter | P3 |

## 8. Surfaces

Moss and lichen are a shader term first (`surface†`), set by the region's damp, so every trunk,
rock, roof and wall can carry them. Ground carpets are ground paint with small tufts near the eye.

| id | Name | Build | Regions | C | Size | Seasons / states | Animation & behaviour | P |
|---|---|---|---|---|---|---|---|---|
| bark-moss | Moss on bark: trunks and limbs | new: surface† — a damp term on bark, strongest on north sides and low | pnw, california, appalachia, new-england, upstate-ny, southeast, gulf, midwest | C | trunk-wide | greener and brighter in the wet season | static | P1 |
| boulder-moss | Moss on boulders, stone walls and retaining walls | row: surface† (rock) — green velvet over granite, shale and basalt | pnw, new-england, upstate-ny, appalachia, ozarks, midwest | C | rock-wide | greener when wet | static | P1 |
| moss-carpets | Moss carpets: haircap, cushion, step moss, Oregon beaked moss, Menzies' tree moss, spikemoss, sphagnum | row: ground paint — with tufts near the eye | pnw, new-england, upstate-ny, appalachia, midwest | C | 2-20 cm | sphagnum red-green in bogs | static | P1 |
| bark-lichens | Bark lichens: greenshields, alder's white crusts, Christmas (red blanket) lichen, script lichens | row: surface† — pale gray-green patches, rosy-red crusts | all | C | patches 5-30 cm | all year | static | P2 |
| rock-lichens | Rock lichens: map lichen, rock tripe, orange Xanthoria, chartreuse and black crusts | row: surface† (rock) — on walls, ledges, fence posts, grain elevators | all | C | patches | all year | static | P2 |
| desert-varnish | Desert varnish | row: surface† (rock) — shiny brown-black coat and blue-black streaks down red cliffs | desert-sw, great-basin | C | cliff-high streaks | all year | static | P2 |
| moss-roofs | Moss on roofs, sidewalks and lawns | row: surface† | pnw | C | — | greener Oct-Jun | static | P2 |
| reindeer-lichen | Reindeer lichen and British soldiers | row: mound — pale gray-green cushions; tiny red-capped stalks on bare sand | mid-atlantic, new-england, midwest | C | 5-10 cm | all year | stiff | P2 |
| cryptobiotic-crust | Cryptobiotic soil crust | row: ground paint — knobby black-brown miniature landscape between shrubs | great-basin | C | 2-10 cm | darker and greener when wet | static | P2 |
| pine-straw | Pine straw beds | row: ground paint — golden-brown long-needle mulch | southeast, gulf, florida, texas | C | — | fresh needles each fall | static | P2 |
| cypress-knees | Cypress knees | row: cypress† — knobby cones round the trunk, through dark water | south, mid-atlantic, midwest, ozarks | C | 0.3-1.5 m | — | stiff | P1 |

## 9. Fungi

| id | Name | Build | Regions | C | Size | Seasons / states | Animation & behaviour | P |
|---|---|---|---|---|---|---|---|---|
| fly-agaric | Fly agaric | new: mushroom† — red cap with white spots | pnw | O | 10-20 cm | Oct-Dec rains | stiff | P3 |
| chanterelles | Chanterelles | row: mushroom† — golden trumpets | pnw | O | 5-10 cm | Oct-Dec | stiff | P3 |
| shelf-conks | Shelf conks on snags | row: mushroom† — brackets on dead wood | pnw, all | C | 10-40 cm | all year | stiff | P3 |
| coral-fungi-slime-molds | Coral fungi and slime molds | row: mushroom† | pnw | O | 5-15 cm | Oct-Dec | stiff | P3 |
| morels | Morels | row: mushroom† — honeycomb caps | midwest | O | 5-10 cm | May | stiff | P3 |

## 10. Crops and orchards

| id | Name | Build | Regions | C | Size | Seasons / states | Animation & behaviour | P |
|---|---|---|---|---|---|---|---|---|
| corn | Corn | row: cane† — stalk, strap leaves, tassel, ears; field rows | midwest, plains, mid-atlantic, appalachia | C | 2-3 m by Jul | green rows Jun; tan and rustling Sep-Oct; white stubble in winter | leaves flap and rustle; tassels sway | P1 |
| soybeans | Soybeans | row: mound — low field rows | midwest, plains | C | 0.6-1 m | green summer; gold late Sep | ripple | P1 |
| winter-wheat | Winter wheat (and the Palouse's wheat) | row: grass — dense field | plains, pnw | C | 0.6-1 m | bright green fall and winter; gold and harvested Jun-Jul; stubble | ripple: waves run across the field | P1 |
| grain-sorghum | Grain sorghum (milo) | row: cane† — rust-red heads | plains | C | 1-1.5 m | red heads fall | heads nod | P3 |
| cultivated-sunflower | Cultivated sunflower (fields) | have: sunflower | plains | C | 1.5-2.5 m | giant heads facing east Aug | heads nod | P2 |
| canola | Canola | row: stem — yellow field | plains | O | 1-1.5 m | yellow Jun-Jul | ripple | P3 |
| cotton | Cotton | row: mound — white bolls | gulf, texas | C | 1 m | white Sep-Oct | stiff | P3 |
| rice | Rice | row: clump — in flooded fields | gulf, california, texas | C | 1 m | green summer, gold fall; flooded in winter for ducks | ripple | P3 |
| sugar-cane | Sugar cane | row: cane† | gulf | C | 3-4 m | harvest with smoky burning fields fall | bend | P3 |
| hops | Hops | row: vine† — on tall trellis wires | pnw | C | 5-6 m | green Jun-Aug; cut Sep | flutter | P3 |
| vineyards | Vineyards (wine and Concord grapes) | row: vine† — trellis rows | upstate-ny, california, pnw, midwest | C | 1.5-2 m | red-gold fall | flutter | P2 |
| apple-orchards | Apple orchards and old dooryard apples | row: round — small, pruned, in rows | upstate-ny, new-england, pnw, midwest | C | 3-6 m | white-pink blossom May; fruit Sep | sway | P2 |
| pear-cherry-orchards | Pear and cherry orchards | row: cherry — in rows | pnw | C | 3-6 m | white blossom Apr | sway | P3 |
| almond-orchards | Almond orchards | row: cherry — in rows | california | C | 4-7 m | a sea of white-pink late Feb-Mar | petals drift | P2 |
| nut-orchards | Walnut and pecan orchards | row: round — in rows | california, gulf, texas | C | 10-20 m | bare in winter | sway | P3 |
| field-vegetables | Potatoes, onions, lentils and peas | row: mound — low field rows | pnw | C | 0.3-0.6 m | green spring, gold Jul-Aug | ripple | P3 |
| bulb-fields | Tulip and daffodil fields | row: stem — cup heads in coloured stripes | pnw | C | 30-50 cm | Apr (Skagit) | nod | P3 |

## 11. Mammals

Roles come from `ROLE` in `fauna.ts` (climber, burrower, grazer, browser, predator); a new
species takes the role of its row's base unless the row says otherwise. Marine mammals are in §15.

### 11.1 Squirrels, chipmunks and other rodents (squirrel base)

| id | Name | Build | Regions | C | Size | Seasons / states | Animation & behaviour | P |
|---|---|---|---|---|---|---|---|---|
| eastern-gray-squirrel | Eastern gray squirrel (incl. black and white morphs) | have: squirrel | east, texas, plains, california, pnw | C | 45-50 cm incl. tail | leaf dreys obvious in bare winter trees; buries nuts in fall | scamper and bound; spirals up the far side of a trunk; tail-flick alarm; spring chases | P1 |
| fox-squirrel | Fox squirrel | row: squirrel — bigger, grizzled gray-brown, orange belly and tail edges | midwest, plains, texas, south, ozarks, appalachia, rockies, great-basin, california, pnw | C | 50-70 cm | Res | slower, heavier bounds; forages on open lawns; sits up to eat | P1 |
| southeastern-fox-squirrels | Southeastern fox squirrels (incl. Sherman's and Big Cypress) | row: squirrel — big; black with white nose and ears, gray with black head, or black-and-tan | southeast, florida | O | 60-70 cm | Res | ground-foraging under open pines | P3 |
| delmarva-fox-squirrel | Delmarva fox squirrel | row: squirrel — pale silver-gray, very fluffy tail | mid-atlantic | O | 60 cm | Res | often on the ground | P3 |
| red-squirrel | Red (pine) squirrel ("boomer", chickaree) | row: squirrel — small, rusty-red, white eye ring | new-england, upstate-ny, appalachia, midwest, rockies | C | 30 cm | cone middens on stumps | chatters and scolds from a limb; tail jerks | P2 |
| douglas-squirrel | Douglas squirrel (chickaree) | row: squirrel — dark olive-brown, orange-buff belly, black side stripe | pnw, california | C | 30 cm | cone middens | loud chattering; spirals down trunks | P2 |
| western-gray-squirrel | Western gray squirrel | row: squirrel — silver-gray, white belly, big plume | california, pnw | C | 50-60 cm | Res | long bounds through oaks | P2 |
| tasseled-squirrels | Abert's and Kaibab squirrels | row: squirrel — tall tufted ears; Abert's gray or black with a rusty back stripe, Kaibab charcoal belly and all-white tail | rockies, great-basin, desert-sw | C | 50 cm | ear tufts longer in winter | bounds through ponderosa canopy | P2 |
| arizona-gray-squirrel | Arizona gray squirrel | row: squirrel | desert-sw | O | 50 cm | Res | sky-island canyon sycamores | P3 |
| flying-squirrels | Northern and southern flying squirrels (incl. Carolina northern) | row: squirrel — soft gray-brown, huge dark eyes, gliding skin flap | new-england, upstate-ny, appalachia, midwest | O | 25 cm | night at feeders | glides trunk to trunk, lands and scurries round | P3 |
| eastern-chipmunk | Eastern chipmunk | row: squirrel — red-brown, five black and two white back stripes, striped face | new-england, upstate-ny, mid-atlantic, appalachia, midwest, ozarks | C | 25 cm incl. tail | in burrows through winter | runs with tail straight up; stuffs cheek pouches; chips from stone walls | P1 |
| western-chipmunks | Least, Uinta, cliff, Merriam's and yellow-pine chipmunks | row: squirrel — small, striped face | rockies, great-basin, california, pnw | C | 20-25 cm | hibernate | beg at trailheads; dart tail-up | P2 |
| townsends-chipmunk | Townsend's chipmunk | row: squirrel — big, dark, blurry stripes | pnw | C | 25-30 cm | Res | darts across forest floor | P3 |
| golden-mantled-ground-squirrel | Golden-mantled ground squirrel | row: groundSquirrel — coppery head, one white stripe edged black | rockies, great-basin, california, pnw | C | 28 cm | hibernates | begs at picnic tables | P2 |
| thirteen-lined-ground-squirrel | Thirteen-lined ground squirrel | row: groundSquirrel — 13 cream stripes and rows of spots | plains, midwest | C | 25 cm | hibernates Oct-Mar | pops up like a stick on golf courses | P2 |
| northern-ground-squirrels | Richardson's, Wyoming, Uinta, Belding's, Columbian, Piute and Franklin's ground squirrels | row: groundSquirrel — plain buff-gray (Franklin's gray with a squirrel tail) | plains, rockies, great-basin, california, pnw, midwest | C | 25-40 cm | hibernate from late summer | colonies; stand at burrows; flick tails | P2 |
| california-ground-squirrel | California ground squirrel | row: groundSquirrel — mottled gray-brown, pale shawl with dark border, bushy tail | california | C | 45 cm incl. tail | Res | colonies on every levee and hillside; stands at burrow mouths | P2 |
| round-tailed-ground-squirrel | Round-tailed ground squirrel | have: groundSquirrel | desert-sw | C | 25 cm | Res | colonies on Phoenix and Tucson lawns | P2 |
| mexican-ground-squirrel | Mexican and spotted ground squirrels | row: groundSquirrel — brown with rows of white spots | texas | C | 30 cm | Res | lawns, cemeteries | P3 |
| antelope-squirrels | Harris's and white-tailed antelope squirrels | row: groundSquirrel — gray-brown, one white side stripe | desert-sw, great-basin | C | 22 cm | active at hot noon | runs with its tail curled over its back | P3 |
| rock-squirrel | Rock squirrel | row: squirrel — big, grizzled, bushy | texas, desert-sw, great-basin | C | 45 cm | Res | sits on rock walls and ledges | P3 |
| black-tailed-prairie-dog | Black-tailed prairie dog | row: groundSquirrel — plump tan-buff, short black-tipped tail | plains, rockies, texas | C | 35-40 cm | Res | towns of mounds; sentries upright; the "jump-yip" (leaps up, arms flung, calls); kissing greetings; dives into the burrow | P1 |
| other-prairie-dogs | White-tailed, Gunnison's and Utah prairie dogs | row: groundSquirrel — white-tipped tail (white-tailed) | great-basin, rockies | O | 30-35 cm | hibernate (white-tailed, Utah) | colonies | P3 |
| woodchuck | Woodchuck (groundhog) | row: squirrel — chunky grizzled brown, short flat tail, small ears | new-england, upstate-ny, mid-atlantic, appalachia, midwest, ozarks, plains | C | 50-65 cm | hibernates Nov-Feb | waddles; sits bolt upright by its burrow on roadside banks | P1 |
| marmots | Yellow-bellied, hoary and Olympic marmots | row: squirrel — fat; yellow belly; silver shoulders (hoary); white face patch (Olympic) | rockies, great-basin, california, pnw | C | 50-75 cm | hibernate Sep-Apr | sun on rocks; sit up and whistle; waddle-run to cover | P2 |
| american-beaver | American beaver | row: squirrel — big, chestnut, flat black paddle tail, orange teeth | all | C | 1-1.2 m | Res; families in a lodge | swims low with a V-wake; slaps its tail and dives; gnaws trees | P1 |
| muskrat | Muskrat | row: squirrel — dark brown, thin flat naked tail | all | C | 50 cm incl. tail | Res | swims with a V-wake; builds cattail "houses" | P2 |
| nutria | Nutria | row: squirrel — big blocky head, white whiskers, orange incisors, round rat tail | gulf, texas, pnw | C | 1 m incl. tail | Res | grazes canal banks in groups; swims head up | P2 |
| mountain-beaver | Mountain beaver (aplodontia) | row: squirrel — tailless brown | pnw | O | 35 cm | Res | rarely out of its burrow holes | P3 |
| porcupine | North American porcupine | row: squirrel — hunched, dark with pale-tipped quills | new-england, upstate-ny, midwest, plains, texas, rockies, great-basin, desert-sw, pnw | O | 60-90 cm | sleeps high in trees by day | slow waddle; climbs; raises quills | P3 |
| brown-rat | Brown (Norway) rat | row: squirrel — brown-gray, scaly naked tail | all | C | 40 cm incl. tail | night | runs along walls in alleys and docks | P3 |
| mice | House mouse and deer mouse | row: squirrel — tiny; deer mouse brown over white with big ears | all | C | 15-20 cm incl. tail | night | scurry; rarely seen | P3 |
| kangaroo-rats | Kangaroo rats (incl. Merriam's) and pocket mice | row: rabbit — huge hind feet, long tufted tail | desert-sw, great-basin | C | 25-35 cm | night | hops on hind legs, tail balancing | P3 |
| woodrats | Woodrats (white-throated, desert, Allegheny, eastern) | row: squirrel — big ears, furry tail | desert-sw, great-basin, appalachia, ozarks | C | 30-40 cm | night; stick and cactus middens | scurries into middens | P3 |
| pocket-gophers | Pocket gophers (plains, Botta's) | row: squirrel — stubby, small eyes | plains, california, desert-sw | C | 20-25 cm | fresh soil mounds | pops from a mound and back | P3 |

### 11.2 Rabbits, hares and pikas (rabbit base)

| id | Name | Build | Regions | C | Size | Seasons / states | Animation & behaviour | P |
|---|---|---|---|---|---|---|---|---|
| eastern-cottontail | Eastern cottontail | have: rabbit | east, texas, plains, pnw | C | 40 cm | dawn and dusk; nests in lawns | freezes, then zig-zags; grazes lawn edges | P1 |
| new-england-cottontail | New England cottontail | row: rabbit — black spot between the ears | new-england | R | 40 cm | Res | young thickets | P3 |
| desert-cottontail | Desert cottontail | row: rabbit — gray-brown, big ears | desert-sw, texas, plains, great-basin, california | C | 35-40 cm | Res | every desert yard and park | P2 |
| western-cottontails | Mountain (Nuttall's) cottontail, brush rabbit, pygmy rabbit | row: rabbit — small; pygmy the world's smallest | rockies, great-basin, california, pnw | C | 25-40 cm | Res | brush edges; pygmy in tall sage | P3 |
| marsh-rabbit | Marsh rabbit | row: rabbit — dark brown, small ears, tiny gray-brown tail | southeast, florida, gulf | C | 40 cm | Res | swims; marsh and canal edges at dusk | P3 |
| swamp-rabbit | Swamp rabbit | row: rabbit — rusty-brown, cinnamon eye ring | gulf, texas, ozarks | C | 50 cm | Res | swims; bottomland edges | P3 |
| snowshoe-hare | Snowshoe hare | have: snowshoe | new-england, upstate-ny, midwest, rockies, pnw | O | 45 cm | brown in summer, white in winter (dark ear tips) | huge hind feet; dusk in conifer thickets | P2 |
| black-tailed-jackrabbit | Black-tailed jackrabbit | have: jackrabbit | texas, plains, desert-sw, great-basin, california, pnw | C | 50-60 cm | Res | long bounds; ears up at dusk on road edges | P2 |
| white-tailed-jackrabbit | White-tailed jackrabbit | row: jackrabbit — gray-brown | plains, rockies | C | 55-65 cm | white in winter | bounds | P3 |
| antelope-jackrabbit | Antelope jackrabbit | row: jackrabbit — huge ears, white sides | desert-sw | O | 55-65 cm | Res | flashes its white sides as it runs | P3 |
| american-pika | American pika | row: rabbit — round gray-brown "rock rabbit", round ears, no tail | rockies, great-basin, california, pnw | O | 18 cm | hay piles of drying flowers under rocks in late summer | scurries over talus with flowers in its mouth; sits and calls "eeep" | P2 |

### 11.3 Foxes, cats, raccoons, skunks and weasels (fox base)

| id | Name | Build | Regions | C | Size | Seasons / states | Animation & behaviour | P |
|---|---|---|---|---|---|---|---|---|
| red-fox | Red fox | have: fox | all but florida, desert-sw | C | ~1 m incl. tail | kits play at dens Apr-Jun | trots; slow stalk, then the high arched mouse pounce | P2 |
| gray-fox | Gray fox | row: fox — salt-and-pepper, rusty neck, black-topped tail | east, texas, desert-sw, california, pnw | C | 0.8-1.1 m | Res | climbs trees | P2 |
| kit-swift-fox | Kit fox (incl. San Joaquin) and swift fox | row: fox — small, pale, huge ears (kit), buff-orange (swift) | desert-sw, great-basin, california, plains | R | 75 cm incl. tail | night; families | trots; freezes at dens | P3 |
| island-fox | Island fox | row: fox — tiny, gray and rusty | california | R | 50-60 cm | Res | Channel Islands only | P3 |
| coyote | Coyote (incl. the bigger, darker eastern coyote) | have: coyote | all | C | 1-1.3 m | family groups late summer | trots with tail low; yipping chorus after dark | P1 |
| gray-wolf | Gray wolf (incl. Mexican wolf) | row: fox — big, long legs, broad face, bushy tail held level | midwest, rockies, pnw, california, desert-sw | R | 1.5-2 m | packs; howl in winter | tireless trot in a line; howls with head back | P2 |
| red-wolf | Red wolf | row: fox — tawny-cinnamon, black saddle, long legs | southeast | R | 1.2-1.6 m | Res | farm fields at dawn and dusk | P3 |
| dog | Dog on a lead | have: dog | all | C | 0.5-1.2 m | — | trots beside its walker, tail carried and wagging | P2 |
| feral-cat | Outdoor and feral cats | row: fox — cat build, any coat | all | C | 70-80 cm incl. tail | Res | slinks; sits on porches; colonies at feeding stations | P3 |
| bobcat | Bobcat | row: fox — tawny-gray, spots and bars, short bobbed tail, ear tufts | all | O | 0.8-1.1 m | Res | slow stalk; vanishes into brush | P2 |
| canada-lynx | Canada lynx | row: fox — big gray cat, long black ear tufts, huge furry feet | new-england, midwest, rockies, pnw | R | 0.8-1 m | winter tracks | stalks in deep snow | P3 |
| mountain-lion | Mountain lion (cougar, Florida panther) | row: fox — plain tawny, long thick black-tipped tail | west, texas, plains, florida | R | 2-2.4 m incl. tail | Res | almost never seen; crosses a road at night | P2 |
| ocelot-jaguar | Ocelot and jaguar | row: fox — chain rosettes (ocelot), big rosettes (jaguar) | texas, desert-sw | R | 1-2.2 m incl. tail | Res | night in dense thornscrub | P3 |
| raccoon | Raccoon | row: fox — grizzled gray, black mask, 4-7 tail rings, hand-like black paws | all | C | 60-95 cm | mothers with 2-5 kits in summer | hunched waddle; climbs; "washes" food in water; raids trash | P1 |
| virginia-opossum | Virginia opossum | row: fox — coarse white-gray, white pointed face, black ears, naked pink tail | east, texas, plains, rockies, california, pnw | C | 65-90 cm incl. tail | night | slow amble; plays dead; mother carries young on her back | P1 |
| striped-skunk | Striped skunk | row: fox — glossy black, white V of two stripes, plume tail | all | C | 60-75 cm | spring and fall | slow waddle; stamps and raises its tail as a warning; digs lawn holes | P1 |
| spotted-skunk | Eastern and western spotted skunks | row: fox — small, broken white stripes and spots | appalachia, southeast, ozarks, california, pnw | R | 40-55 cm | Res | handstand warning | P3 |
| hooded-hognosed-skunks | Hooded and hog-nosed skunks | row: fox — one broad white back stripe and white tail; naked pig nose | texas, desert-sw | O | 55-80 cm | night | roots with its nose | P3 |
| ringtail | Ringtail | row: fox — cat-like body, big ringed eyes, 14-16 black and white tail rings | texas, desert-sw, great-basin, california | O | 75 cm incl. tail | night | climbs canyon walls and cabins | P3 |
| coati | White-nosed coati | row: fox — long mobile white-tipped snout, ringed tail held straight up | desert-sw | O | 1-1.3 m incl. tail | day; troops of up to 20+ | troops trot with tails up; snuffle in leaf litter | P3 |
| american-badger | American badger | row: fox — flat, low, grizzled silver, white head stripe, huge front claws | plains, midwest, texas, rockies, great-basin, desert-sw, california, pnw | O | 70 cm | dawn and dusk | digs furiously, throwing dirt | P3 |
| fisher-marten | Fisher and American (pine) marten | row: fox — long, low; chocolate frosted (fisher), golden with orange throat (marten) | new-england, upstate-ny, midwest, rockies, pnw | O | 60-100 cm incl. tail | Res | bounding lope; crosses roads | P3 |
| mink-weasel | Mink and long-tailed weasel | row: fox — small, long, thin | all | O | 30-50 cm | weasels white in winter in the north | bounding along stream banks | P3 |
| wolverine | Wolverine | row: fox — heavy, dark, pale side bands | rockies, pnw | R | 0.8-1.1 m | Res | lopes over snow | P3 |
| river-otter | North American river otter | row: fox — sleek dark brown, thick tapering tail | all | O | 1-1.3 m | family groups | porpoises, slides down banks, rolls; on docks on salt water | P2 |
| sea-otter | Southern sea otter | row: fox — dark brown, frosted pale head | california, pnw | C | 1-1.4 m | rafts | floats on its back in kelp, cracking shells on its chest; grooms | P2 |

### 11.4 Bears (bear†)

| id | Name | Build | Regions | C | Size | Seasons / states | Animation & behaviour | P |
|---|---|---|---|---|---|---|---|---|
| black-bear | American black bear (incl. Florida and Louisiana) | new: bear† — black (white chest blaze) in the east; black, cinnamon, brown or blond in the west; tan muzzle | appalachia, new-england, upstate-ny, mid-atlantic, southeast, florida, gulf, midwest, ozarks, rockies, pnw, california, desert-sw | C | 1.5-1.8 m long, 60-250 kg | dens in winter in the north; spring and fall most visible | pigeon-toed walk, gallop; stands to sniff; climbs; raids trash and feeders; sow with 1-3 cubs that scramble up trees | P1 |
| grizzly-bear | Grizzly bear | row: bear† — shoulder hump, dished face, silver-tipped fur, long claws | rockies | R | 1.8-2.5 m, 150-350 kg | dens in winter | digs; sow with cubs in valley meadows | P2 |

### 11.5 Deer, elk, moose, pronghorn, sheep and goats (deer base)

| id | Name | Build | Regions | C | Size | Seasons / states | Animation & behaviour | P |
|---|---|---|---|---|---|---|---|---|
| white-tailed-deer | White-tailed deer (bucks carry antlers†) | have: deer | east, texas, plains, rockies, pnw, desert-sw | C | 1.6-2 m long, ~1 m at shoulder | red-tan summer, gray-brown winter; antlers Sep-Feb; spotted fawns May-Aug | walks and browses; freezes, stamps, then bounds with the tail up as a white flag | P1 |
| key-deer | Key deer | row: deer — dog-sized | florida | R | 60-80 cm at shoulder | Res | tame, in yards on Big Pine Key | P3 |
| coues-deer | Coues white-tailed deer | row: deer — small, gray, big white flag | desert-sw | O | ~75 cm at shoulder | Res | sky-island oak woodland | P3 |
| mule-deer | Mule deer | have: muleDeer | west, plains, texas | C | 1.5-2 m | gray-brown; antlers fork into Y's | stots: bounces on all four legs at once | P1 |
| black-tailed-deer | Black-tailed (Columbian) deer | row: muleDeer — tail black on top | pnw, california | C | 1.4-1.8 m | Res | yards at dusk; stots | P2 |
| axis-deer | Axis deer | row: deer — chestnut-orange with bold white spots all year; long lyre antlers | texas | C | 80-90 cm at shoulder | Res | herds of 10-50; shrill alarm barks | P3 |
| sika-deer | Sika deer | row: deer — small, dark chestnut, faint spots, flared white rump | mid-atlantic | C | 70-80 cm at shoulder | whistles in fall | small groups at marsh edges | P3 |
| exotic-ungulates | Fallow deer, blackbuck and nilgai | row: deer — spotted (fallow), black-and-white with spiral horns (blackbuck), big gray-blue antelope (nilgai) | texas | O | 0.8-1.4 m at shoulder | Res | herds on ranches | P3 |
| elk | Elk (Rocky Mountain and restored eastern herds) | row: deer — big, tan-gray body, chocolate neck mane and legs, cream rump; antlers† | rockies, pnw, great-basin, plains, appalachia, ozarks, midwest | C | 2.4 m long, 1.5 m at shoulder | bugling rut Sep-Oct; antlers shed Mar; calves Jun | herds graze meadows at dawn and dusk; a bull bugles with neck stretched and head back; bulls spar | P1 |
| roosevelt-tule-elk | Roosevelt and tule elk | row: elk — darker and bigger (Roosevelt), pale and small (tule) | pnw, california | C | 2-2.5 m | rut Sep-Oct | herds in roadside meadows and river bars | P2 |
| moose | Moose | row: deer — tallest deer, dark brown-black, long pale legs, humped shoulders, overhanging muzzle, throat bell; palmate antlers† | new-england, upstate-ny, midwest, rockies, great-basin, pnw, plains | O | 1.8-2.1 m at shoulder | summer in water; antlers shed Dec-Jan | wades into ponds and plunges its head under to feed; long-legged trot; stands in the willows | P1 |
| pronghorn | Pronghorn | row: deer — tan back, white belly and rump, two white throat bands; pronged horns† | plains, rockies, great-basin, desert-sw, texas | C | 1.3 m long, 85 cm at shoulder | horn sheaths shed Nov | the fastest runner, a flowing gallop; flares its white rump; crawls under fences | P1 |
| bighorn-sheep | Bighorn sheep (Rocky Mountain and desert) | row: deer — stocky brown, white rump and muzzle; rams' massive curled horns† | rockies, great-basin, desert-sw, pnw, plains, texas | O | 1.5 m long, 70-130 kg | rams clash Nov-Dec | picks along cliff ledges and roadside cuts; ewe-lamb groups | P1 |
| mountain-goat | Mountain goat | row: deer — shaggy white coat, beard, black dagger horns† | rockies, pnw, plains | O | 1 m at shoulder | sheds in ragged patches in summer | climbs sheer cliffs, nannies with kids | P2 |
| aoudad | Aoudad (Barbary sheep) | row: deer — tawny, long throat fringe, swept-back horns† | texas | O | 0.8-1 m at shoulder | Res | canyon walls in Palo Duro | P3 |
| sheep-goats | Sheep and goats (farm and range) | row: deer — woolly (sheep) | rockies, great-basin, all | C | 0.6-0.9 m at shoulder | sheared in spring; summer mountain herds with herders | flocks graze and bunch | P3 |
| horse | Horses (incl. Kentucky Thoroughbreds) | row: deer — big, long neck and head, mane and hair tail (quad-tails) | all | C | 1.5-1.7 m at shoulder | winter coats | graze; swish tails; canter in paddocks behind plank fences | P2 |
| wild-horse | Wild horses and island ponies (mustangs; Assateague, Corolla, Shackleford, Cumberland, Theodore Roosevelt NP and Salt River bands) | row: horse — thick-necked; bays, sorrels, pintos, grays; small round-bellied ponies | great-basin, mid-atlantic, southeast, plains, desert-sw | C | 1.2-1.5 m at shoulder | Res | bands of 2-20 with a stallion; graze dunes and marsh; swim | P2 |
| wild-burro | Wild burro | row: horse — gray-brown donkey, dark shoulder cross, pale muzzle | desert-sw, great-basin | C | 1-1.2 m at shoulder | Res | walks town streets (Oatman) | P3 |

### 11.6 Bison, cattle, pigs and javelina (bovid†)

| id | Name | Build | Regions | C | Size | Seasons / states | Animation & behaviour | P |
|---|---|---|---|---|---|---|---|---|
| bison | American bison | new: bovid† — shaggy woolly forequarters and head, high hump, lighter rear, short curved horns†, beard | plains, rockies | C | 3 m long, 1.8 m at the hump, 500-900 kg | sheds in ragged clumps in spring; orange-red calves ("red dogs"); bull rut in July | herds graze slowly; roll in dust wallows; bulls bellow | P1 |
| holstein | Holstein dairy cow | row: bovid† — black-and-white | upstate-ny, new-england, mid-atlantic, appalachia, midwest | C | 1.5 m at shoulder | — | grazes; lies and chews | P2 |
| beef-cattle | Angus, Hereford and Brahman-cross cattle | row: bovid† — black, red-and-white, gray with a hump (Brahman) | all | C | 1.3-1.5 m at shoulder | — | graze; cluster at stock tanks; follow a pickup | P2 |
| texas-longhorn | Texas longhorn | row: bovid† — mottled; horns† spreading 1.5-2 m | texas | O | 1.4 m at shoulder | — | ranch emblems by the gate | P3 |
| feral-hog | Feral hog (and farm hogs) | row: bovid† — bristly, long snout, razor-back ridge, tusks; striped piglets | texas, gulf, florida, southeast, ozarks, plains, california, appalachia, midwest | C | 1-1.8 m, 50-150 kg | piglets any season | sounders root up the ground; trot in a line | P2 |
| javelina | Collared peccary (javelina) | row: bovid† — small, grizzled gray-black, pale collar, piggy snout | texas, desert-sw | C | 50-60 cm tall, 20-25 kg | Res | herds of 6-15 in washes and yards, eating prickly pear; clack teeth | P2 |

### 11.7 Armadillo, bats and a monkey

| id | Name | Build | Regions | C | Size | Seasons / states | Animation & behaviour | P |
|---|---|---|---|---|---|---|---|---|
| armadillo | Nine-banded armadillo | new: armadillo† — gray-tan to pinkish shell with 7-11 hinged bands, pointed head, upright ears, long scaled tail | texas, gulf, florida, southeast, ozarks, plains, appalachia, midwest | C | 75 cm incl. tail | dusk and night (daytime in cool weather) | snuffling trot; digs lawns; jumps straight up when startled | P1 |
| big-brown-bat | Big brown bat | new: bat† — brown | all | C | 30-35 cm wingspan | dusk Apr-Oct | erratic fluttering under streetlights and over ponds | P2 |
| mexican-free-tailed-bat | Mexican (Brazilian) free-tailed bat | row: bat† — narrow wings | texas, desert-sw, southeast, gulf, plains, great-basin, california | C | 30 cm wingspan | Mar-Oct; colonies in attics and under bridges | dusk emergence: a smoke-like ribbon of millions, miles long | P2 |
| eastern-red-bat | Eastern red bat | row: bat† — rusty red | east | C | 30 cm wingspan | summer | flutters round streetlights | P3 |
| myotis-bats | Little brown, Indiana, gray, Yuma and canyon bats | row: bat† — small brown | all | C | 22-28 cm wingspan | cave colonies; gray bats stream over rivers | erratic flutter over water | P3 |
| big-eared-bats | Ozark big-eared and pallid bats | row: bat† — huge ears, tan | ozarks, desert-sw, great-basin, california | O | 30-40 cm wingspan | — | slow fluttering flight | P3 |
| long-nosed-bats | Lesser long-nosed and Mexican long-tongued bats | row: bat† — long snout | desert-sw | C | 35 cm wingspan | late summer | hovers at hummingbird feeders at night | P3 |
| florida-bonneted-bat | Florida bonneted bat | row: bat† — big | florida | R | 50 cm wingspan | — | high fast flight | P3 |
| rhesus-macaque | Rhesus macaque | new: primate† — tan-brown, pink face, short tail | florida | R | 50 cm | Res | troops of 10-50 on river banks; sit and groom; leap through branches | P3 |

## 12. Birds

All birds are rows on the bird plan (`birdGeometry`). The Build cell names the nearest existing
row (`songbird`, `sandpiper`, `hawk`, `roadrunner`, `quail`, `ibis`) or `bird` when none is close,
then the palette or shape. Seasons use the README codes: Res resident, Sum summer, Win winter, Mig
passing through.

### 12.1 Songbirds by palette

The songbird is one small body; a species is its palette (cap, face, back, wing, breast, tail),
its size and its habits. The generic tinted songbird stays as the far fallback.

**Red, rose and pink**

| id | Name | Build | Regions | C | Size | Seasons / states | Animation & behaviour | P |
|---|---|---|---|---|---|---|---|---|
| songbird | Songbird (generic, tinted) | have: songbird | all | C | 12-25 cm | — | hops on grass; flushes to cover | P2 |
| northern-cardinal | Northern cardinal | row: songbird — male all red with crest and black mask, thick red-orange cone bill; female buff with red tinges | east, texas, plains, desert-sw | C | 22 cm | Res; red on snow | hops under hedges and feeders; sings "cheer cheer" from a treetop; crest raised | P1 |
| pyrrhuloxia | Pyrrhuloxia | row: songbird — gray cardinal with red crest and face, yellow bill | texas, desert-sw | C | 21 cm | Res | perches on mesquite tops | P3 |
| summer-tanager | Summer tanager | row: songbird — male all strawberry-red | southeast, gulf, appalachia, ozarks, midwest, desert-sw | C | 18 cm | Sum | catches bees in the canopy | P3 |
| scarlet-tanager | Scarlet tanager | row: songbird — red body, black wings | new-england, upstate-ny, appalachia, ozarks, midwest | C | 17 cm | Sum | sings high in oaks | P3 |
| vermilion-flycatcher | Vermilion flycatcher | row: songbird — male scarlet with dark brown mask and back | texas, desert-sw | O | 14 cm | Res | sallies from a low perch near water; tail dips | P3 |
| house-finch | House finch | row: songbird — male raspberry head and breast, streaky brown body | all | C | 14 cm | Res | small flocks at feeders, porches and cacti; warbling song | P2 |
| purple-cassins-finch | Purple and Cassin's finches | row: songbird — rosier, crisper | california, pnw, rockies, new-england | O | 15 cm | Res / Win | small flocks | P3 |
| pine-grosbeak-crossbill | Pine grosbeak and red crossbill | row: songbird — plump rosy-red; crossed bill (crossbill) | rockies, pnw | O | 16-23 cm | Res, nomadic | flocks pry at cones | P3 |
| rosy-finches | Brown-capped, black and gray-crowned rosy-finches | row: songbird — dark brown with pink-rose belly and wings | rockies | O | 15 cm | alpine snowfields in summer; town feeders in winter | flocks on snow | P3 |
| rose-breasted-grosbeak | Rose-breasted grosbeak | row: songbird — black and white with a rose-red bib | new-england, upstate-ny, appalachia, midwest | C | 19 cm | Sum | sings like a robin in a hurry | P3 |

**Blue**

| id | Name | Build | Regions | C | Size | Seasons / states | Animation & behaviour | P |
|---|---|---|---|---|---|---|---|---|
| eastern-bluebird | Eastern bluebird | row: songbird — sky-blue back, rusty-orange throat and breast | east, texas, plains | C | 17 cm | Res; winter flocks | perches on fence lines and nest boxes; drops to the grass | P2 |
| western-bluebird | Western bluebird | row: songbird — deep blue head and throat, rusty breast and back | california, desert-sw, great-basin, pnw | C | 17 cm | Res | fence posts and oaks | P3 |
| mountain-bluebird | Mountain bluebird | row: songbird — male all sky-turquoise | rockies, great-basin, plains, pnw | C | 18 cm | Sum Apr-Oct | hovers over meadows, drops on insects | P2 |
| indigo-bunting | Indigo bunting | row: songbird — male all deep electric blue; female plain brown | east, texas, plains | C | 14 cm | Sum | sings from wires along roads and power-line cuts | P2 |
| lazuli-bunting | Lazuli bunting | row: songbird — turquoise head and back, orange breast, white bars | rockies, great-basin, pnw | C | 14 cm | Sum | sings from shrub tops | P3 |
| blue-grosbeak | Blue grosbeak | row: songbird — deep blue, chestnut wing bars | desert-sw | C | 16 cm | Sum | riparian thickets | P3 |
| painted-bunting | Painted bunting | row: songbird — male blue head, red underparts, lime back; female bright green | southeast, florida, gulf, texas, ozarks, plains | C | 13 cm | Sum (coast, TX); Win at Florida feeders | sings from shrub tops; shy at feeders | P2 |
| blue-warblers | Cerulean and black-throated blue warblers | row: songbird — sky-blue (cerulean); dark blue with black throat | appalachia, ozarks, new-england, upstate-ny | O | 12-13 cm | Sum | sings high in oak canopies | P3 |
| blue-gray-gnatcatcher | Blue-gray gnatcatcher | row: songbird — tiny, blue-gray, long flicking white-edged tail | great-basin, east | C | 11 cm | Sum | flicks its tail side to side | P3 |

**Yellow, olive and green**

| id | Name | Build | Regions | C | Size | Seasons / states | Animation & behaviour | P |
|---|---|---|---|---|---|---|---|---|
| american-goldfinch | American goldfinch | row: songbird — male lemon-yellow, black cap and wings (summer); olive-buff (winter) | all but florida | C | 12 cm | Res north, Win south | bouncing flight calling "po-ta-to-chip"; hangs on thistles and sunflowers | P2 |
| lesser-goldfinch | Lesser goldfinch | row: songbird — black or green back, bright yellow below | texas, desert-sw, california, great-basin | C | 10 cm | Res | flocks at feeders | P3 |
| pine-siskin | Pine siskin | row: songbird — streaky brown, yellow wing flashes | rockies, pnw | C | 12 cm | nomadic flocks | flocks at feeders and cones | P3 |
| evening-grosbeak | Evening grosbeak | row: songbird — yellow, black and white, huge pale bill | rockies, pnw, midwest | O | 18 cm | Res / Win irruptions | flocks crack seeds | P3 |
| western-tanager | Western tanager | row: songbird — yellow with red-orange head, black wings and back | rockies, great-basin, california, pnw | C | 18 cm | Sum | conifer canopy | P3 |
| yellow-warbler | Yellow warbler | row: songbird — all yellow | all | C | 12 cm | Sum | sings "sweet sweet sweet" from willows | P3 |
| common-yellowthroat | Common yellowthroat | row: songbird — yellow throat, black mask | east | C | 12 cm | Sum | skulks in marsh edges | P3 |
| prothonotary-warbler | Prothonotary warbler | row: songbird — glowing golden-yellow head and body, blue-gray wings | southeast, gulf, ozarks, midwest | C | 13 cm | Sum | the swamp warbler; nests in stumps over water | P2 |
| southern-warblers | Pine, yellow-throated and Swainson's warblers, northern parula | row: songbird — olive-yellow; yellow throat; parula blue-gray with yellow breast | southeast, gulf, florida, ozarks | C | 11-14 cm | Res (pine) / Sum | parula and yellow-throated sing from Spanish moss | P3 |
| yellow-rumped-warbler | Yellow-rumped warbler | row: songbird — gray-brown with a yellow rump spot (winter) | all | C | 14 cm | Win flocks south and on coasts; Sum north and mountains | flocks in wax myrtle and juniper | P3 |
| palm-warbler | Palm warbler | row: songbird — brown-olive, yellow undertail | florida | C | 13 cm | Win | wags its tail constantly on lawns | P3 |
| eastern-forest-warblers | Hooded, Kentucky, worm-eating, prairie and golden-winged warblers, yellow-breasted chat | row: songbird — yellow face in a black hood (hooded); yellow with black sideburns (Kentucky) | appalachia, ozarks, mid-atlantic, southeast | C | 12-19 cm | Sum | sing from understory and old fields | P3 |
| northern-warblers | Black-throated green, Blackburnian (flaming orange throat), Canada, chestnut-sided warblers, American redstart (orange tail flashes) | row: songbird | new-england, upstate-ny, appalachia, midwest | C | 12-13 cm | Sum; May fallouts | flit and flash tails; redstart fans its tail | P3 |
| kirtlands-warbler | Kirtland's warbler | row: songbird — blue-gray back with black streaks, lemon breast | midwest | R | 15 cm | Sum | bobs its tail in young jack pine | P3 |
| golden-cheeked-warbler | Golden-cheeked warbler | row: songbird — black and white, brilliant golden face | texas | R | 12 cm | Sum Mar-Jun | sings in Ashe juniper-oak woods | P3 |
| western-warblers | Lucy's, black-throated gray, Townsend's, MacGillivray's, Wilson's and orange-crowned warblers | row: songbird — gray; yellow-and-black (Townsend's); yellow with black cap (Wilson's) | desert-sw, great-basin, california, pnw | C | 10-13 cm | Sum / Win (Townsend's) | flit through riparian and conifer canopy | P3 |
| vireos | Red-eyed, blue-headed, white-eyed, Bell's, warbling and black-capped vireos | row: songbird — olive-gray; black cap with white spectacles (black-capped) | east, texas, desert-sw, california, pnw | C | 11-15 cm | Sum | sing all day from the canopy | P3 |
| verdin | Verdin | row: songbird — tiny gray, yellow head, rusty shoulder | desert-sw, texas | C | 11 cm | Res | flits through mesquite and palo verde | P3 |
| kinglets | Golden-crowned and ruby-crowned kinglets | row: songbird — tiny olive, crown stripe | all | C | 10 cm | Win south; Res north | flick wings; hover-glean twigs | P3 |
| green-jay | Green jay | row: songbird — bright green body, blue crown, black bib, yellow outer tail | texas | C | 27 cm | Res | noisy family groups at feeders | P2 |
| great-kiskadee | Great kiskadee | row: songbird — lemon-yellow belly, rufous wings, bold black-and-white striped head | texas | C | 25 cm | Res | calls "kis-ka-dee" from wires over ponds; plunges for fish | P3 |
| kingbirds | Western, Couch's and gray kingbirds | row: songbird — gray head, yellow belly (western, Couch's); gray and white, big bill (gray) | plains, texas, rockies, great-basin, desert-sw, california, pnw, florida | C | 21-23 cm | Sum | sally from fence wires; chase hawks | P3 |
| meadowlarks | Eastern and western meadowlarks | row: songbird — streaky brown back, bright yellow breast with a black V; white outer tail | all but florida | C | 24 cm | Res | sings from fence posts; flutter-glide over grass | P2 |
| dickcissel | Dickcissel | row: songbird — sparrow with yellow breast, black bib, rufous shoulder | plains, midwest, texas, gulf | C | 16 cm | Sum | on every fence post and sunflower in July | P3 |

**Orange**

| id | Name | Build | Regions | C | Size | Seasons / states | Animation & behaviour | P |
|---|---|---|---|---|---|---|---|---|
| american-robin | American robin | row: songbird — brick-orange breast, slate-gray back, dark head, broken white eye ring, yellow bill | all | C | 25 cm | Res across the middle; Sum far north; winter flocks of thousands in the south | runs, stops, tilts its head, pulls a worm; winter flocks strip holly and juniper | P1 |
| varied-thrush | Varied thrush | row: songbird — robin-like with bold orange eyebrow and wing bars, black breast band | pnw, california | C | 24 cm | Win lowland yards; Sum mountain forests | eerie single-note buzzing whistle | P2 |
| baltimore-oriole | Baltimore and orchard orioles | row: songbird — flaming orange and black (Baltimore); chestnut and black (orchard) | east, plains | C | 17-19 cm | Sum | hangs woven nests from elm tips | P3 |
| western-orioles | Bullock's and hooded orioles | row: songbird — orange with black throat; hooded nests sewn under palm fronds | west, plains, texas | C | 18-20 cm | Sum | hangs at feeders | P3 |
| valley-orioles | Altamira, Audubon's and spot-breasted orioles | row: songbird — flaming orange with black bib and wings | texas, florida | O | 21-25 cm | Res | Altamira hangs long woven nests | P3 |
| black-headed-grosbeak | Black-headed grosbeak | row: songbird — cinnamon-orange breast, black head | west | C | 19 cm | Sum | sings from canopy; at feeders | P3 |
| spotted-towhee | Spotted and eastern towhees | row: songbird — black hood, rufous sides, white spots (spotted) | all | C | 20 cm | Res | double-scratch hop in leaf litter | P3 |

**Brown and streaky**

| id | Name | Build | Regions | C | Size | Seasons / states | Animation & behaviour | P |
|---|---|---|---|---|---|---|---|---|
| house-sparrow | House sparrow | row: songbird — male gray crown, chestnut nape, black bib; female plain buff | all | C | 16 cm | Res | chattering flocks at fast-food lots; dust baths | P2 |
| song-sparrow | Song sparrow (incl. dark sooty northwestern form) | row: songbird — streaky brown, central breast spot | all | C | 15 cm | Res | males sing from shrub tops | P2 |
| chipping-sparrow | Chipping sparrow | row: songbird — rusty cap, black eye line, plain gray breast | all | C | 13 cm | Sum north, Win south | small flocks on lawns | P3 |
| field-sparrows | Field, savannah, grasshopper, vesper, lark, Brewer's, Lincoln's and sagebrush sparrows, American tree sparrow | row: songbird — streaky brown look-alikes | all | C | 13-17 cm | by species | flush from grass, sing from stems | P3 |
| white-throated-sparrow | White-throated sparrow | row: songbird — striped crown, white throat, yellow lores | east, texas, plains, midwest | C | 17 cm | Win; Sum north woods | scratches in leaves; "Old Sam Peabody" song | P3 |
| crowned-sparrows | White-crowned, golden-crowned, fox and Harris's sparrows | row: songbird — bold black-and-white crown; gold forehead; sooty fox; black face | west, texas, plains | C | 15-19 cm | Win; white-crowned Res on the coast and Sum near treeline | flocks under feeders | P3 |
| black-throated-sparrow | Black-throated sparrow and olive sparrow | row: songbird — gray, black throat, white face stripes | desert-sw, texas, great-basin | C | 13-15 cm | Res | desert flats | P3 |
| dark-eyed-junco | Dark-eyed junco (slate-colored, Oregon, gray-headed, pink-sided) | row: songbird — slate hood or black hood with brown back; pink bill | all | C | 15 cm | Win flocks; Res in mountains | hops under feeders; flashes white outer tail feathers | P2 |
| southwest-towhees | California, Abert's and canyon towhees | row: songbird — plain brown; black face (Abert's) | california, desert-sw | C | 21-23 cm | Res | scratch under shrubs and in yards | P3 |
| thrushes | Hermit, wood, Swainson's and Bicknell's thrushes, veery | row: songbird — brown, spotted breast, rusty tail | east, west | C | 17-19 cm | Sum; hermit Win south | sing fluting songs at dusk | P3 |
| brown-thrasher | Brown thrasher | row: songbird — rusty back, streaked white breast, yellow eye, long tail and bill | east, plains, texas | C | 28 cm | Res south, Sum north | scratches through leaves | P3 |
| desert-thrashers | Curve-billed, long-billed and sage thrashers | row: songbird — gray-brown, down-curved bill, orange eye | desert-sw, texas, great-basin, pnw | C | 22-28 cm | Res / Sum (sage) | "whit-wheet" from cholla; sings from sage tops | P3 |
| cactus-wren | Cactus wren | row: songbird — biggest wren, heavy black spots, bold white eyebrow, cocked barred tail | desert-sw, texas | C | 21 cm | Res | perches on cholla and saguaro tops; harsh chugging calls; football nests in cholla | P2 |
| eastern-wrens | Carolina and house wrens | row: songbird — warm rusty-brown, white eyebrow (Carolina); plain barred (house) | all | C | 12-14 cm | Res (Carolina); Sum (house) | cocked tail; very loud "tea-kettle" from porches | P3 |
| western-wrens | Bewick's, canyon, rock and Pacific wrens | row: songbird — rusty with white throat (canyon); dark stubby (Pacific) | west, texas | C | 10-14 cm | Res | canyon wren's falling song echoes off cliffs; rock wren bobs; Pacific wren's huge song | P2 |
| wrentit | Wrentit | row: songbird — plain gray-brown, long cocked tail, pale eye | california | C | 15 cm | Res | heard far more than seen: a bouncing-ball song in chaparral | P3 |
| brown-creeper | Brown creeper | row: songbird — bark-brown, curved bill | pnw | C | 13 cm | Res | spirals up a trunk, flies to the next base | P3 |
| horned-lark | Horned lark | row: songbird — brown, black mask and tiny black "horns" | plains, great-basin | C | 18 cm | Res | runs along gravel roads; flocks lift and land | P3 |
| winter-field-birds | Lapland and chestnut-collared longspurs, snow bunting | row: songbird — snow bunting white with brown wash and black wingtips | plains, new-england, upstate-ny | C | 15-17 cm | Win (longspurs, snow bunting); Sum (chestnut-collared) | flocks swirl like snow over fields and beaches | P3 |
| bobolink | Bobolink | row: songbird — male black below, buttery nape, white back | new-england, upstate-ny, midwest, plains | O | 18 cm | Sum | bubbling flight song over hayfields | P3 |
| cedar-waxwing | Cedar waxwing | row: songbird — silky fawn, black mask, crest, yellow tail tip, red waxy wing tips | all | C | 18 cm | nomadic; Win south | flocks of 10-100 strip berry trees; pass berries | P3 |

**Gray, white, and black-and-white**

| id | Name | Build | Regions | C | Size | Seasons / states | Animation & behaviour | P |
|---|---|---|---|---|---|---|---|---|
| northern-mockingbird | Northern mockingbird | row: songbird — soft gray, white wing patches and outer tail, long tail | south, mid-atlantic, appalachia, ozarks, desert-sw, california, plains | C | 25 cm | Res | sings day and night from TV antennas; flashes wing patches; chases other birds | P2 |
| gray-catbird | Gray catbird | row: songbird — slate-gray, black cap, rusty undertail | east, plains | C | 22 cm | Sum | mews from thickets; cocks its tail | P3 |
| chickadees | Black-capped and Carolina chickadees | row: songbird — black cap and bib, white cheeks, gray back | all but desert-sw, florida | C | 12-13 cm | Res | lead mixed winter flocks; hang upside down | P2 |
| western-chickadees | Mountain, chestnut-backed and boreal chickadees | row: songbird — white eyebrow (mountain); chestnut back (chestnut-backed); brown cap (boreal) | rockies, great-basin, california, pnw, new-england, upstate-ny, midwest | C | 12-13 cm | Res | acrobatic at feeders and conifers | P3 |
| titmice | Tufted, black-crested, oak, juniper and bridled titmice | row: songbird — gray crest; black crest (black-crested) | east, texas, california, great-basin, desert-sw | C | 13-16 cm | Res | "peter peter"; mixed flocks | P3 |
| bushtit | Bushtit | row: songbird — tiny gray, long tail | west, texas | C | 11 cm | Res | flocks of 10-40 pour through shrubs | P3 |
| nuthatches | White-breasted, red-breasted, brown-headed and pygmy nuthatches | row: songbird — blue-gray back, black or brown cap | all | C | 10-15 cm | Res | walk head-first down trunks; brown-headed's squeaky-toy calls | P3 |
| eastern-phoebe | Eastern, black and Say's phoebes | row: songbird — gray-brown; sooty black with white belly (black); peachy belly (Say's) | all | C | 17 cm | Res / Sum | wag tails; sally from porches, bridges and fountains | P3 |
| eastern-kingbird | Eastern kingbird | row: songbird — black above, white below, white tail tip | east, plains, midwest | C | 21 cm | Sum | sallies from fence wires; harasses hawks | P3 |
| scissor-tailed-flycatcher | Scissor-tailed flycatcher | row: songbird — pearl-gray, salmon flanks, very long forked tail (bird-display) | texas, plains, ozarks, gulf | C | 33 cm incl. tail | Sum Mar-Oct; fall roosts of hundreds | on wires along roads; tail streams and scissors in flight | P2 |
| flycatchers | Great crested, ash-throated, Acadian, Pacific-slope, olive-sided and gray flycatchers, eastern and western wood-pewees | row: songbird — olive-gray | all | C | 13-21 cm | Sum | sally from a perch and return | P3 |
| loggerhead-shrike | Loggerhead shrike | row: songbird — gray, black mask, black-and-white wings, hooked bill | south, plains, desert-sw, great-basin | C | 22 cm | Res | perches on wires; impales prey on thorns and barbed wire | P3 |
| american-dipper | American dipper | row: songbird — plain slate-gray, stubby tail, white eyelid flash | rockies, pnw, california | C | 19 cm | Res | bobs on midstream rocks; walks underwater | P2 |
| canada-jay | Canada (gray) jay | row: songbird — fluffy gray, white face, dark nape | new-england, upstate-ny, midwest, rockies, pnw | O | 28 cm | Res | comes to people for food at picnic tables | P3 |

**Black and iridescent**

| id | Name | Build | Regions | C | Size | Seasons / states | Animation & behaviour | P |
|---|---|---|---|---|---|---|---|---|
| european-starling | European starling | row: songbird — glossy black, green-purple sheen, white speckles in winter, yellow bill in spring | all | C | 21 cm | Res; huge winter flocks | waddles on lawns probing; murmurations wheel at dusk | P2 |
| red-winged-blackbird | Red-winged blackbird | row: songbird — male black with red-and-yellow epaulets; female streaked brown | all | C | 22 cm | Res; huge mixed winter flocks | sings from cattail tops, puffing out its red shoulders | P2 |
| tricolored-blackbird | Tricolored blackbird | row: songbird — red-and-white shoulder | california | R | 22 cm | Res | huge Valley colonies | P3 |
| yellow-headed-blackbird | Yellow-headed blackbird | row: songbird — black, brilliant yellow head and breast, white wing patch | plains, great-basin, pnw | C | 25 cm | Sum | rusty-gate song from cattails | P3 |
| brewers-blackbird | Brewer's blackbird | row: songbird — glossy purple-green black, white-yellow eye | west, plains | C | 23 cm | Res | the California "parking-lot bird", walking under café tables | P3 |
| common-grackle | Common grackle | row: songbird — glossy bronze-purple black, yellow eye, keeled tail | east, plains, texas | C | 30 cm | Res; huge roosts | struts on lawns; noisy flocks | P3 |
| great-tailed-grackle | Great-tailed and boat-tailed grackles | row: songbird — big, males blue-black with a long V tail; females brown | texas, desert-sw, plains, gulf, southeast, florida, mid-atlantic, california, great-basin | C | 40-45 cm | Res; evening roosts in parking-lot trees | males fluff, point bills to the sky, whistle and click | P2 |
| cowbirds | Brown-headed and bronzed cowbirds | row: songbird — black with brown head; red-eyed (bronzed) | all | C | 19-22 cm | Res | follow cattle; small flocks on lawns | P3 |
| phainopepla | Phainopepla | row: songbird — glossy silky black, crest, red eye; white wing patches in flight | desert-sw | C | 20 cm | Win-spring | sits atop mistletoe-laden mesquites | P3 |
| lark-bunting | Lark bunting | row: songbird — male black with big white wing patches | plains | C | 17 cm | Sum | song flights over shortgrass | P3 |
| exotic-songbirds | Common myna and red-whiskered bulbul | row: songbird — brown with black head and yellow face (myna) | florida | O | 20-25 cm | Res | parking lots | P3 |

### 12.2 Jays, crows and magpies

| id | Name | Build | Regions | C | Size | Seasons / states | Animation & behaviour | P |
|---|---|---|---|---|---|---|---|---|
| blue-jay | Blue jay | row: songbird — bright blue crest and back, white face and belly, black necklace, barred wings and tail | east, texas, plains, rockies | C | 28 cm | Res; fall migrating flocks along shores | loud; family groups; carries acorns; crest up when alarmed | P1 |
| stellers-jay | Steller's jay | row: songbird — charcoal-black crested head (white brow streaks inland, blue streaks on the coast), deep blue body | pnw, california, rockies, great-basin | C | 30 cm | Res | bold and noisy in campgrounds and yards; hops branch to branch up a conifer | P1 |
| california-scrub-jay | California scrub-jay | row: songbird — bright blue head, wings, tail and necklace, gray-brown back, no crest | california, pnw | C | 28 cm | Res | hops on lawns; caches acorns | P2 |
| woodhouses-scrub-jay | Woodhouse's scrub-jay | row: songbird — paler | great-basin, desert-sw, texas | C | 28 cm | Res | P-J and yards | P3 |
| florida-scrub-jay | Florida scrub-jay | row: songbird — blue head, wings and tail, gray-brown back | florida | R | 28 cm | Res | sentinels on shrub tops; tame family groups | P3 |
| pinyon-mexican-jay | Pinyon and Mexican jays | row: songbird — dull all-blue (pinyon); blue-gray (Mexican) | great-basin, desert-sw | O | 27-30 cm | Res | big noisy wandering flocks | P3 |
| clarks-nutcracker | Clark's nutcracker | row: songbird — pale gray, black-and-white wings and tail, long pointed bill | rockies, great-basin, pnw | C | 30 cm | Res | at overlooks and treeline; caches pine seeds | P3 |
| black-billed-magpie | Black-billed magpie | row: bird — black and white, very long iridescent green tail | rockies, great-basin, plains, pnw | C | 50 cm incl. tail | Res | struts on lawns and fences; flashes white wing patches; picks at roadkill | P2 |
| yellow-billed-magpie | Yellow-billed magpie | row: bird — black and white, bright yellow bill and eye skin | california | C | 45 cm incl. tail | Res | groups on Valley farms and oaks | P3 |
| american-crow | American crow | row: bird — all glossy black, fan tail | all but desert-sw | C | 45 cm | Res; winter roosts of thousands | walks, hops; families mob hawks and owls; evening roost commutes | P1 |
| fish-crow | Fish crow | row: bird — smaller crow | mid-atlantic, southeast, florida, gulf | C | 40 cm | Res | nasal "uh-uh"; flocks on beaches and lots | P3 |
| common-raven | Common and Chihuahuan ravens | row: bird — bigger than a crow, shaggy throat, heavy bill, wedge tail | west, appalachia, new-england, texas, plains | C | 50-60 cm | Res | pairs tumble in updrafts; deep croaks; raid picnic tables at overlooks | P2 |

### 12.3 Doves and pigeons

| id | Name | Build | Regions | C | Size | Seasons / states | Animation & behaviour | P |
|---|---|---|---|---|---|---|---|---|
| mourning-dove | Mourning dove | row: songbird — soft pinkish-tan, black wing spots, long pointed white-edged tail, small head | all | C | 30 cm | Res | perches on wires; walks on lawns bobbing its head; wings whistle on take-off | P1 |
| rock-pigeon | Rock pigeon | row: bird — blue-gray, two black wing bars, iridescent neck; patchwork variants | all | C | 32 cm | Res | flocks wheel together over downtowns and grain elevators; walks bobbing; males puff and turn | P1 |
| eurasian-collared-dove | Eurasian collared-dove | row: songbird — pale sandy-gray, black half-collar, square tail | all | C | 32 cm | Res | loud "coo-COO-coo" from wires on every farmstead | P2 |
| white-winged-dove | White-winged dove | row: songbird — tan-gray, white wing bar, blue eye skin | texas, desert-sw, florida, gulf | C | 29 cm | Res; Sum in the desert | coos "who-cooks-for-you"; eats saguaro fruit | P3 |
| small-doves | Inca and common ground doves, spotted dove | row: songbird — small, scaly (Inca), chestnut wing flash | texas, desert-sw, florida, gulf, southeast, california | C | 16-21 cm | Res | pairs on lawns | P3 |
| band-tailed-pigeon | Band-tailed pigeon | row: bird — gray, white neck crescent, yellow bill | pnw, california | O | 35 cm | Res | flocks at berry trees and feeders | P3 |
| white-crowned-pigeon | White-crowned pigeon | row: bird — slate-gray, bright white crown | florida | R | 33 cm | Sum | Keys hammocks | P3 |

### 12.4 Woodpeckers, kingfisher, trogon and parrots

| id | Name | Build | Regions | C | Size | Seasons / states | Animation & behaviour | P |
|---|---|---|---|---|---|---|---|---|
| downy-hairy-woodpecker | Downy and hairy woodpeckers | row: songbird — checkered black and white, white back stripe; red nape spot (males) | all | C | 15-23 cm | Res | hitch up trunks on stiff tails; drum; bounding flight | P2 |
| red-bellied-woodpecker | Red-bellied woodpecker | row: songbird — zebra-barred back, buff face, red cap and nape | east, texas, plains | C | 24 cm | Res | rolling "kwirr"; at feeders | P2 |
| golden-fronted-woodpecker | Golden-fronted and ladder-backed woodpeckers | row: songbird — zebra back, buff face, yellow-orange nape (golden-fronted); small ladder back | texas, desert-sw | C | 18-25 cm | Res | on mesquite, utility poles, yucca stalks | P2 |
| gila-woodpecker | Gila woodpecker | row: songbird — tan-gray head and belly, zebra-barred back, small red cap (males) | desert-sw | C | 23 cm | Res | excavates nest holes in saguaros; noisy on palms and feeders | P1 |
| flickers | Northern flicker (yellow- and red-shafted) and gilded flicker | row: songbird — brown, black bars and spots, black bib; yellow or salmon wing linings | all | C | 30 cm | Res | eats ants on lawns; bounding flight with a white rump flash | P2 |
| pileated-woodpecker | Pileated woodpecker | row: bird — crow-sized, black, white face stripes, flaming red crest | east, pnw | O | 45 cm | Res | chisels huge rectangular holes in snags; wild laughing call | P2 |
| red-headed-woodpecker | Red-headed woodpecker | row: songbird — all-crimson head, black back, big white wing patches | east, plains | O | 22 cm | Res | open oak woods, river bottoms, golf courses | P3 |
| acorn-woodpecker | Acorn woodpecker | row: songbird — clown face: black back, white forehead, red cap, white eye | california, desert-sw | C | 22 cm | Res | noisy family groups stock granary trees and poles with thousands of acorns | P2 |
| red-cockaded-woodpecker | Red-cockaded woodpecker | row: songbird — black-and-white ladder back, big white cheek | southeast, gulf | R | 21 cm | Res | family groups at resin-candled colony trees | P3 |
| western-woodpeckers | Lewis's, Nuttall's, white-headed, black-backed, American three-toed and Arizona woodpeckers | row: songbird — dark green-black with a pink belly (Lewis's); white head (white-headed) | west, upstate-ny, midwest | O | 18-28 cm | Res | Lewis's flycatches like a crow | P3 |
| sapsuckers | Yellow-bellied, red-naped, red-breasted and Williamson's sapsuckers | row: songbird — red head and breast (red-breasted) | all | C | 20-23 cm | Res / Win | drill rows of sap wells | P3 |
| belted-kingfisher | Belted kingfisher | row: songbird — blue-gray, shaggy crest, white collar, blue breast band; big bill | all | C | 33 cm | Res | rattles from wires over creeks; hovers, then plunges | P2 |
| elegant-trogon | Elegant trogon | row: bird — metallic green, rose-red belly, long copper tail | desert-sw | R | 30 cm | Sum | sits still in sky-island sycamores | P3 |
| monk-parakeet | Monk parakeet | row: songbird — bright green, gray face and breast, blue flight feathers, long pointed tail | florida, texas, gulf, midwest, mid-atlantic, new-england | O | 29 cm | Res, local colonies | noisy flocks build bulky stick nests on light towers and substations | P3 |
| parrots-parakeets | Nanday, white-winged, mitred, yellow-chevroned, red-masked parakeets; red-crowned and lilac-crowned parrots; green parakeet | row: songbird — mostly green, red or black faces | florida, california, texas | O | 20-35 cm | Res, local | raucous evening flocks to roosts | P3 |
| rosy-faced-lovebird | Rosy-faced lovebird | row: songbird — bright green, rosy face, blue rump | desert-sw | C | 15 cm | Res | flocks nest in palm skirts | P3 |

### 12.5 Hummingbirds, swifts, swallows and nightjars

| id | Name | Build | Regions | C | Size | Seasons / states | Animation & behaviour | P |
|---|---|---|---|---|---|---|---|---|
| ruby-throated-hummingbird | Ruby-throated hummingbird | row: songbird — tiny, iridescent green, male's red gorget; needle bill (bird-hover) | east, texas, plains | C | 8-9 cm | Sum | hovers at feeders and flowers; feisty chases | P2 |
| anna-hummingbird | Anna's hummingbird | row: songbird — green, gray belly; male rose-pink crown and throat | california, pnw, desert-sw, great-basin | C | 10 cm | Res; at feeders in snow | hovers; males climb and dive in J-shaped display | P2 |
| western-hummingbirds | Black-chinned, broad-tailed (wing trill), rufous (orange), calliope, Costa's (violet gorget), Allen's | row: songbird — by gorget and back | west, texas | C | 8-10 cm | Sum / Mig (rufous Jul-Aug) | hover, chase; broad-tailed's metallic wing trill | P2 |
| southwest-hummingbirds | Broad-billed, buff-bellied, magnificent and blue-throated hummingbirds | row: songbird — red bill (broad-billed, buff-bellied); big (magnificent) | desert-sw, texas | O | 9-14 cm | Sum / Res | hover at canyon feeders | P3 |
| chimney-swift | Chimney swift | row: bird — dark "cigar with wings" | east, plains | C | 13 cm | Sum; huge fall roosts in chimneys | stiff fluttering twitter over towns at dusk; pours into a chimney | P3 |
| western-swifts | White-throated and Vaux's swifts | row: bird — black with white throat and flanks (white-throated) | west | C | 11-17 cm | Sum; Vaux's Mig Sep | screaming flocks at canyon rims; Vaux's funnel into a school chimney | P3 |
| barn-swallow | Barn swallow | row: songbird — steel-blue back, rusty throat, deep forked tail | all | C | 17 cm | Sum | swoops low over fields and water; nests under eaves | P2 |
| tree-violet-green-swallow | Tree and violet-green swallows | row: songbird — iridescent blue-green or green-violet above, white below | all | C | 12-14 cm | Sum north; Win flocks (tree) in Florida | swoop over water | P3 |
| cliff-cave-swallow | Cliff and cave swallows | row: songbird — square tail, pale orange rump | west, plains, texas, gulf, desert-sw | C | 13-14 cm | Sum | colonies of mud-jar nests under bridges | P3 |
| other-swallows | Northern rough-winged and bank swallows | row: songbird — plain brown | all | C | 12-14 cm | Sum | over rivers | P3 |
| purple-martin | Purple martin | row: songbird — glossy blue-black | east, texas, plains, pnw | C | 20 cm | Sum (arrives Jan-Feb in Texas); roosts of 100,000+ under the Lake Pontchartrain Causeway | colonies at gourd racks and martin houses | P2 |
| nighthawks | Common and lesser nighthawks | row: bird — long pointed wings with a white or buff bar | all | C | 22-24 cm | Sum | erratic bat-like flight over towns at dusk; "peent" | P3 |
| nightjars | Eastern whip-poor-will, chuck-will's-widow, common poorwill, common pauraque | row: bird — mottled bark-brown | east, west, texas | C | 20-30 cm | Sum (heard at night) | calls its name over and over after dusk; sits on night roads | P3 |
| cuckoos | Yellow-billed and mangrove cuckoos | row: songbird — long tail with white spots | east, florida, texas | C | 30 cm | Sum | skulks in canopy | P3 |

### 12.6 Ducks, geese and swans

| id | Name | Build | Regions | C | Size | Seasons / states | Animation & behaviour | P |
|---|---|---|---|---|---|---|---|---|
| canada-goose | Canada goose (and cackling goose) | row: bird — +neck, +swim, flat bill; black neck and head, white chinstrap, brown-gray body | all | C | 1 m; 1.5 m wingspan | Res park flocks; migrants in V's spring and fall | grazes lawns; hisses with neck low by its goslings in May; honking V's overhead | P1 |
| mallard | Mallard (incl. feral farm ducks) | row: bird — +swim, flat bill; drake green head, white collar, chestnut breast; hen mottled brown | all | C | 58 cm | Res | dabbles and tips up; waddles; pairs and flocks on every pond | P1 |
| american-black-mottled-duck | American black and mottled ducks | row: mallard — dark chocolate (black duck); darker hen-like (mottled) | new-england, mid-atlantic, florida, gulf, texas | C | 55 cm | Res | salt marsh and ponds | P3 |
| wood-duck | Wood duck | row: mallard — drake's green crest with white stripes, red eye, chestnut breast | east, california, pnw | C | 50 cm | Res | perches in trees over wooded ponds | P2 |
| dabbling-ducks | Gadwall, northern pintail, American wigeon, green-winged, blue-winged and cinnamon teal, northern shoveler | row: mallard — by drake pattern | all | C | 35-65 cm | Win (millions on the Gulf); Sum potholes | dabble; wigeon graze lawns | P3 |
| diving-ducks | Canvasback, redhead, scaup (incl. lesser) and ruddy duck | row: mallard — +dive | all | C | 40-55 cm | Win rafts; Sum potholes | dive and pop up | P3 |
| sea-ducks | Long-tailed duck, bufflehead, common and Barrow's goldeneyes, surf, white-winged and black scoters, mergansers (red-breasted, hooded, common) | row: mallard — +dive; pied and clown-billed patterns | new-england, mid-atlantic, midwest, pnw, california, rockies | C | 35-70 cm | Win rafts on bays and lakes | dive; rafts ride the swell | P3 |
| common-eider | Common eider | row: mallard — big; drake white back and breast, black belly and cap | new-england | C | 60 cm | Res Maine; Win to Cape Cod | rafts near rocks; crèches of ducklings | P3 |
| harlequin-duck | Harlequin duck | row: mallard — slate-blue, chestnut sides, white clown stripes | rockies, pnw | R | 40 cm | Sum rushing streams; Win rocky shores | rides rapids | P3 |
| whistling-ducks | Black-bellied and fulvous whistling ducks | row: mallard — long pink legs, chestnut body, black belly, white wing stripe | florida, gulf, texas, southeast | C | 50 cm | Res (black-bellied); Sum (fulvous) | perch on wires and rooftops; whistling flocks | P2 |
| muscovy-duck | Muscovy duck | row: mallard — black-and-white blotchy, red warty face (bird-bare-head) | florida | C | 70-85 cm | Res | every retention pond and apartment lawn | P3 |
| egyptian-goose | Egyptian goose | row: canada-goose — tan-gray, dark eye patch | florida | O | 70 cm | Res | lawns and ponds in pairs | P3 |
| snow-goose | Snow and Ross's geese | row: canada-goose — white, black wingtips, pink bill | upstate-ny, mid-atlantic, southeast, gulf, texas, plains, desert-sw, california, pnw | C | 70 cm | Win, Mig in tens of thousands | lift off fields in white blizzards | P2 |
| white-fronted-goose | Greater white-fronted goose | row: canada-goose — gray-brown, white face band | gulf, plains, california | C | 70 cm | Win | huge flocks | P3 |
| brant | Brant | row: canada-goose — small, black head and neck, white necklace | mid-atlantic | C | 60 cm | Win Oct-Apr | flocks graze bayside lawns and golf courses | P3 |
| mute-swan | Mute swan | row: canada-goose — white, S-curved neck, orange bill with black knob | mid-atlantic, new-england | C | 1.5 m | Res | pairs glide; wings arched | P3 |
| tundra-trumpeter-swans | Tundra and trumpeter swans | row: canada-goose — white, straight neck, black bill | mid-atlantic, southeast, midwest, rockies, pnw, great-basin, california, ozarks | C | 1.3-1.6 m | Win flocks; Res (trumpeter) in the north | flocks on fields; whooping calls | P2 |

### 12.7 Loons, grebes, cormorants, rails and coots

| id | Name | Build | Regions | C | Size | Seasons / states | Animation & behaviour | P |
|---|---|---|---|---|---|---|---|---|
| common-loon | Common loon | row: bird — +swim, +dive; black head, red eye, checkered black-and-white back, white necklace | new-england, upstate-ny, midwest, rockies, pnw, mid-atlantic | C | 80 cm | Sum northern lakes; Win plain gray on the ocean | sits low; dives; runs across the water to take off; chicks ride on the back; wails at night | P1 |
| other-loons | Red-throated and Pacific loons | row: common-loon — slimmer | mid-atlantic, california, pnw | C | 60-65 cm | Win | dive offshore | P3 |
| grebes | Pied-billed, horned, red-necked, western and Clark's grebes | row: bird — +swim, +dive; long swan neck (western, Clark's) | all | C | 30-65 cm | Res / Win | western grebes "rush" side by side across the water in spring | P3 |
| eared-grebe | Eared grebe | row: bird — +swim; gray-white (fall), black with golden ear plumes (summer) | great-basin, desert-sw, plains | C | 33 cm | Mig Sep-Nov: 1-2 million on the Great Salt Lake | huge rafts dive for brine shrimp | P2 |
| double-crested-cormorant | Double-crested cormorant (and neotropic) | row: bird — +neck, +swim; black, orange throat skin, hooked bill | all | C | 70-80 cm | Res / Sum | sits low in water; dives; perches on pilings with wings spread to dry | P2 |
| pacific-cormorants | Brandt's and pelagic cormorants | row: double-crested-cormorant | california, pnw | C | 70-85 cm | Res | colonies on rocks | P3 |
| anhinga | Anhinga | row: bird — +neck; black with silver-white wing streaks, snake-like neck, dagger bill, fan tail | southeast, florida, gulf | C | 85 cm | Res | swims with only its neck showing; perches with wings spread | P2 |
| american-coot | American coot | row: bird — +swim; slate-black, white bill | all | C | 40 cm | Win | pumps its head as it swims; patters across the water | P3 |
| gallinules | Purple and common gallinules | row: bird — iridescent purple-blue (purple), red-and-yellow bill, long yellow toes | florida, gulf, texas | C | 33 cm | Res | walks on lily pads | P3 |
| rails | Clapper, king rails and sora | row: bird — gray-brown chicken-like marsh bird, long bill | mid-atlantic, southeast, gulf | C (heard) | 20-40 cm | Res / Win (sora) | clattering calls from hidden marsh | P3 |
| limpkin | Limpkin | row: ibis — brown with white spots, long slightly curved bill | florida, southeast, gulf | C | 65 cm | Res | stalks apple snails at pond edges; screams at night | P3 |

### 12.8 Herons, egrets, ibises, storks and cranes

| id | Name | Build | Regions | C | Size | Seasons / states | Animation & behaviour | P |
|---|---|---|---|---|---|---|---|---|
| great-blue-heron | Great blue heron (incl. "great white heron" morph) | row: ibis — +neck, dagger bill; blue-gray, white face with black plume stripe | all | C | 1.2 m tall; 1.8 m wingspan | Res; colonies of stick nests | stalks slowly, freezes, then strikes with the neck; flies with neck folded and legs trailing | P1 |
| great-egret | Great egret | row: ibis — +neck; all white, yellow bill, black legs | all but rockies | C | 1 m | Res south and coasts; Sum north | stalks and strikes; breeding plumes | P1 |
| snowy-egret | Snowy egret | row: ibis — +neck; white, black bill, black legs with yellow "golden slippers" | new-england, mid-atlantic, south, california, great-basin, desert-sw | C | 60 cm | Res south; Sum north | active: shuffles its feet and dashes | P1 |
| cattle-egret | Cattle egret | row: ibis — stocky white, yellow bill; buff plumes in breeding season | south, plains, california | C | 50 cm | Res / Sum | follows cattle and tractors | P2 |
| little-blue-tricolored-heron | Little blue and tricolored herons | row: ibis — +neck; slate-blue; blue with white belly | mid-atlantic, southeast, florida, gulf, texas | C | 60-65 cm | Sum / Res | stalk marsh pools | P3 |
| reddish-egret | Reddish egret | row: ibis — +neck; shaggy rusty head, pink-and-black bill | florida, texas | O | 75 cm | Res | dances drunkenly, wings spread | P3 |
| green-heron | Green heron | row: ibis — small, hunched, dark green, chestnut neck | east, texas, california | C | 45 cm | Sum / Res | hunches at pond edges | P3 |
| night-herons | Black-crowned and yellow-crowned night-herons | row: ibis — stocky, black cap; black-and-white face (yellow-crowned) | mid-atlantic, southeast, florida, gulf, texas, california, desert-sw | C | 60 cm | Res / Sum | roost hunched in city trees; stalk New Orleans streets for crawfish | P3 |
| white-ibis | White ibis | have: ibis | southeast, florida, gulf, texas | C | 60 cm | Res | flocks probe wet lawns and ditches in lines | P2 |
| dark-ibises | Glossy and white-faced ibises | row: ibis — dark bronze-purple with green sheen | mid-atlantic, gulf, texas, great-basin, california | C | 55-60 cm | Sum / Res | flocks in rice fields | P3 |
| roseate-spoonbill | Roseate spoonbill | row: ibis — spoon bill; bubblegum pink, red shoulders, bare greenish head | florida, gulf, texas, southeast | C | 80 cm | Res | sweeps its bill side to side in shallow water; groups in ditches | P1 |
| wood-stork | Wood stork | row: ibis — white, black flight feathers, bare gray head (bird-bare-head), thick down-curved bill | florida, southeast | C | 1 m | Res | stands hunched in ditches; soars in kettles | P2 |
| sandhill-crane | Sandhill crane (incl. Florida and Mississippi forms) | row: ibis — +neck; tall gray, red crown, feather "bustle" at the rear | florida, plains, midwest, rockies, great-basin, desert-sw, appalachia, california, texas, pnw, upstate-ny | C | 1.2 m tall | Res Florida; Mig Feb-Apr (Platte: 600,000+); Win flocks | walks suburban lawns with a colt; bugles; dances with wing-flaps and leaps; flies neck stretched | P1 |
| whooping-crane | Whooping crane | row: sandhill-crane — white, black wingtips, red crown, black face | texas, gulf, plains | R | 1.5 m tall | Win Aransas Nov-Mar; Mig Apr, Oct-Nov | family groups in coastal marsh | P3 |

### 12.9 Hawks, eagles, falcons and kites

| id | Name | Build | Regions | C | Size | Seasons / states | Animation & behaviour | P |
|---|---|---|---|---|---|---|---|---|
| red-tailed-hawk | Red-tailed hawk (incl. dark western morphs) | have: hawk | all | C | 50 cm; 1.2 m wingspan | Res | perches on highway light poles; soars over fields; stoops on prey | P2 |
| red-shouldered-hawk | Red-shouldered hawk | row: hawk — rusty barred breast, checkered wings, banded tail | east, texas, california | C | 45 cm | Res | very vocal "kee-ah" in wooded suburbs | P2 |
| broad-winged-hawk | Broad-winged hawk | row: hawk — chunky, broad black-and-white tail bands | east | C | 40 cm | Sum; Mig Sep kettles of thousands | kettles spiral up thermals | P3 |
| accipiters | Cooper's and sharp-shinned hawks | row: hawk — blue-gray back, rusty barred breast, long banded tail, short wings | all | C | 28-45 cm | Res | ambushes feeder birds through yards | P3 |
| buteos-open-country | Swainson's, ferruginous, rough-legged, white-tailed and zone-tailed hawks | row: hawk — dark bib (Swainson's); pale with rusty legs (ferruginous) | plains, texas, rockies, great-basin, desert-sw, california, pnw | C | 50-60 cm | Sum (Swainson's); Win (rough-legged) | huge fall kettles (Swainson's); hover (rough-legged) | P3 |
| harris-hawk | Harris's hawk | row: hawk — dark chocolate, chestnut shoulders and thighs, white tail base and tip | texas, desert-sw | C | 50 cm | Res | family groups of 2-7 perch on light poles and saguaros and hunt together | P2 |
| northern-harrier | Northern harrier | row: hawk — slim, white rump | upstate-ny, plains, great-basin, pnw | O | 45 cm | Win / Res | low tilting flight over marsh and fields | P3 |
| kites | Swallow-tailed, Mississippi, white-tailed and snail kites | row: hawk — elegant black-and-white with long forked tail (swallow-tailed); pale gray (Mississippi); white, black shoulders (white-tailed) | southeast, florida, gulf, texas, plains, california | C | 35-60 cm | Sum (swallow-tailed, Mississippi); Res (white-tailed, snail) | swallow-tailed glides over swamps; Mississippi kites catch cicadas over towns; white-tailed hovers | P2 |
| american-kestrel | American kestrel | row: hawk — small falcon, rusty back, blue-gray wings, two black face bars (bird-hover) | all | C | 25 cm | Res | perches on wires; hovers over roadsides | P2 |
| falcons | Peregrine, prairie and aplomado falcons, merlin | row: hawk — blue-gray, black helmet (peregrine) | all | O | 25-50 cm | Res / Win (merlin) | spectacular stoops from bridges and towers | P3 |
| crested-caracara | Crested caracara | row: hawk — black cap and body, white neck, bare red-orange face, long yellow legs | florida, texas, gulf | C | 55 cm | Res | walks fields and roadkill; perches on fence posts | P2 |
| osprey | Osprey | row: hawk — dark brown above, white below, white head with dark eye stripe; kinked "M" wings (bird-hover) | all | C | 55 cm; 1.6 m wingspan | Sum north; Res Florida and Gulf | hovers, plunges feet-first, carries a fish head-first to a platform nest | P1 |
| bald-eagle | Bald eagle | row: hawk — dark brown body, white head and tail, huge yellow bill; young blotchy | all | C | 80-95 cm; 2 m wingspan | Res near big water; winter gatherings of dozens at dams and salmon rivers | soars on flat wings; sits in tall pines; snatches fish | P1 |
| golden-eagle | Golden eagle | row: hawk — all dark brown, golden nape | rockies, great-basin, plains, pnw, california, appalachia | O | 80-95 cm; 2 m wingspan | Res / Win | soars over open valleys and ridges | P3 |

### 12.10 Vultures and condor

| id | Name | Build | Regions | C | Size | Seasons / states | Animation & behaviour | P |
|---|---|---|---|---|---|---|---|---|
| turkey-vulture | Turkey vulture | row: hawk — black-brown, bare red head (bird-bare-head), two-toned wings with silver flight feathers | all | C | 70 cm; 1.8 m wingspan | Sum north; Res south and west; big roosts on towers | teeters on wings held in a V, rarely flapping; groups circle; hunched on roadkill and roosts, wings spread to sun | P1 |
| black-vulture | Black vulture | row: hawk — black, bare gray wrinkled head, short square tail, white wingtip stars | south, mid-atlantic, appalachia, ozarks, midwest, plains, desert-sw, new-england | C | 65 cm; 1.5 m wingspan | Res | flap-flap-glide; groups on water towers | P2 |
| california-condor | California condor | row: hawk — huge, black, white triangles under the wings, bare pink-orange head, wing tags | california, great-basin | R | 1.3 m; 3 m wingspan | Res | soars over canyon rims in small groups | P3 |

### 12.11 Owls

| id | Name | Build | Regions | C | Size | Seasons / states | Animation & behaviour | P |
|---|---|---|---|---|---|---|---|---|
| great-horned-owl | Great horned owl | row: bird — upright, ear tufts, yellow eyes, white throat bib | all | C | 55 cm | Res; deep hoots in winter | sits still at dusk; head swivels; silent flight | P2 |
| barred-owl | Barred owl | row: bird — round head, dark eyes, barred chest | east, pnw | C | 50 cm | Res | "who-cooks-for-you"; sometimes hunts by day | P2 |
| screech-owls | Eastern and western screech-owls | row: bird — small, ear tufts, gray or rufous | all | C | 20 cm | Res | peers from tree holes and nest boxes; trills | P3 |
| barn-owl | Barn owl | row: bird — pale, heart-shaped face | all | C | 35 cm | Res | ghostly flight over fields; nest boxes in vineyards | P3 |
| burrowing-owl | Burrowing owl | row: bird — long-legged, sandy-brown with white spots, yellow eyes | florida, plains, texas, desert-sw, great-basin, california, pnw | O | 23 cm | Res / Sum | stands at burrow mouths by day; bobs; on prairie dog mounds | P2 |
| snowy-owl | Snowy owl | row: bird — white with black flecks, yellow eyes | new-england, upstate-ny, midwest, plains, pnw | R | 60 cm | Win irruptions | sits on dunes, fields and airports | P3 |
| short-long-eared-owls | Short-eared and long-eared owls | row: bird — tawny, moth-like flight | upstate-ny, great-basin, pnw | O | 35-40 cm | Win | dusk flights over open fields | P3 |
| northern-forest-owls | Great gray, northern hawk, boreal, northern pygmy, northern saw-whet, flammulated and spotted owls | row: bird — great gray's huge round gray face; pygmy day-active | midwest, rockies, pnw, california | R | 15-70 cm | Res / Win irruptions | great gray hunts meadows at dusk | P3 |
| elf-owl | Elf and ferruginous pygmy-owls | row: bird — the world's smallest owl, gray-brown, yellow eyes | desert-sw | C | 13-17 cm | Sum | peeks from saguaro holes at dusk | P3 |

### 12.12 Turkey, quail, grouse and chickens

| id | Name | Build | Regions | C | Size | Seasons / states | Animation & behaviour | P |
|---|---|---|---|---|---|---|---|---|
| wild-turkey | Wild turkey (eastern, Osceola, Rio Grande, Merriam's) | row: quail — big; bronze-black iridescent, bare blue-and-red head (bird-bare-head), wattle, beard; fanned tail (bird-display) | all | C | 1-1.2 m | gobbling Mar-May; flocks in yards | walks in flocks; toms strut with fanned tails, puffed and drumming; run, then explode into flight | P1 |
| northern-bobwhite | Northern bobwhite | row: quail — chunky rusty-brown, male's white throat and eyebrow | east, texas, plains | O | 25 cm | coveys | "bob-WHITE" whistle; covey bursts into flight | P3 |
| gambels-quail | Gambel's quail | have: quail | desert-sw, great-basin, texas | C | 25 cm | coveys; chicks in spring | coveys run across roads and gravel yards; male calls from a post | P2 |
| california-quail | California quail | row: quail — scaled belly, forward-curving black plume, black-and-white face | california, pnw, great-basin | C | 25 cm | coveys of 10-50 | coveys run across trails; a sentinel male calls "chi-CA-go" from a fence | P1 |
| other-quail | Scaled and Montezuma quail | row: quail — blue-gray with white "cotton top" (scaled); clown face (Montezuma) | texas, desert-sw | O | 22-25 cm | coveys | run rather than fly | P3 |
| plain-chachalaca | Plain chachalaca | row: roadrunner — brown chicken-like, long tail, small head | texas | C | 55 cm | Res | deafening dawn choruses in brushy parks | P3 |
| greater-roadrunner | Greater roadrunner | have: roadrunner | texas, desert-sw, plains, gulf, ozarks, california | C | 55 cm | Res | runs fast on roadsides and walls; tail cocked; crest raised | P2 |
| ring-necked-pheasant | Ring-necked pheasant | row: quail — male iridescent green-purple head, red wattle, white ring, coppery body, long tail | plains, midwest, great-basin, pnw | C | 85 cm incl. tail | Res | explosive flush from ditches | P2 |
| partridges | Gray partridge and chukar | row: quail — gray, rusty face (gray partridge); barred flanks, black necklace, red bill (chukar) | plains, great-basin, pnw | C | 30-35 cm | coveys | chukars call "chuk-chuk-chukar" from rocky slopes | P3 |
| forest-grouse | Ruffed, spruce, dusky and sooty grouse | row: quail — mottled brown or gray; fan tail with a black band | new-england, upstate-ny, appalachia, rockies, pnw, midwest | O | 40-50 cm | Res; drumming and hooting in spring | ruffed grouse drums on a log; explosive flush | P3 |
| prairie-grouse | Greater and lesser prairie-chickens, sharp-tailed grouse | row: quail — brown-barred; orange throat sacs and neck "horns" (bird-display) | plains, texas | R | 40-45 cm | spring leks Mar-May | males boom and dance on leks at dawn | P3 |
| greater-sage-grouse | Greater sage-grouse | row: quail — big, mottled gray-brown, black belly; male white ruff, spiky tail, yellow-green air sacs | great-basin, rockies, pnw | R | 60-75 cm | spring leks Mar-Apr | males strut, inflate and pop their air sacs at dawn | P3 |
| white-tailed-ptarmigan | White-tailed ptarmigan | row: quail — mottled gray-brown in summer, pure white in winter, red eye combs | rockies, pnw | R | 30 cm | white in winter | sits motionless among tundra rocks | P3 |
| chickens-peafowl | Chickens, feral roosters and peafowl | row: quail — junglefowl roosters; peacock's tail train | all | C | 0.4-2 m incl. train | Res | roosters roam Key West streets and crow; peacocks fan | P3 |

### 12.13 Pelicans and seabirds

| id | Name | Build | Regions | C | Size | Seasons / states | Animation & behaviour | P |
|---|---|---|---|---|---|---|---|---|
| brown-pelican | Brown pelican | row: bird — +neck, pouch bill; gray-brown body, white and yellow head | south, mid-atlantic, california, pnw | C | 1.2 m; 2 m wingspan | Res south; Sum north to VA/NJ and Washington | lines skim the waves in ground effect; plunge-dives with a splash; sits on pilings with the bill on its chest | P1 |
| american-white-pelican | American white pelican | row: brown-pelican — white, black flight feathers, huge orange bill | florida, gulf, texas, plains, great-basin, rockies, desert-sw, california, pnw | C | 1.6 m; 2.7 m wingspan | Win south; Sum colonies north | flocks fish together, herding and dipping in unison; soar in wheeling flocks | P2 |
| northern-gannet | Northern gannet | row: bird — white, black wingtips, buff head, dagger bill | new-england, mid-atlantic | C | 95 cm | Mig / Win offshore | plunge-dives like an arrow | P3 |
| magnificent-frigatebird | Magnificent frigatebird | row: hawk — black, deeply forked tail, narrow crooked wings, red throat pouch (males) | florida | C | 1 m; 2.3 m wingspan | Res | hangs motionless high over beaches and harbors | P3 |
| alcids | Common murre, pigeon and black guillemots, rhinoceros auklet, marbled murrelet | row: bird — +swim, +dive; penguin-like black and white; red feet | new-england, california, pnw | C | 30-45 cm | Res | pigeon guillemots on Puget piers; dive | P3 |
| puffins | Atlantic and tufted puffins | row: bird — black, white face; huge striped or orange-red bill | new-england, pnw | R | 30-38 cm | Sum colonies | stand on rocks; whir low over the sea | P3 |
| sooty-shearwater | Sooty shearwater | row: bird — dark, stiff-winged | california | C | 45 cm | Sum offshore, streams of thousands | shears low over waves | P3 |

### 12.14 Gulls, terns and skimmers

| id | Name | Build | Regions | C | Size | Seasons / states | Animation & behaviour | P |
|---|---|---|---|---|---|---|---|---|
| herring-gull | Herring gull | have: gull (life sim; rebuild on the bird plan) | new-england, upstate-ny, mid-atlantic, midwest, southeast | C | 60 cm | Res / Win | lands on the sand by the surf; soars; steals food | P2 |
| ring-billed-gull | Ring-billed gull | row: bird — gull: white, pale gray back, yellow bill with a black ring | all | C | 45 cm | Res / Win | flocks in fast-food parking lots and ball fields | P2 |
| laughing-gull | Laughing gull | row: bird — gull: black hood (summer), dark gray back, dark red bill | mid-atlantic, southeast, florida, gulf, texas, new-england | C | 40 cm | Sum Apr-Oct north; Res south | raucous "ha-ha-ha" flocks on boardwalks, stealing fries | P1 |
| great-black-backed-gull | Great black-backed gull | row: bird — gull: the biggest; black back, pink legs | new-england, mid-atlantic, upstate-ny | C | 75 cm | Res | lords it over the herring gulls | P3 |
| california-gull | California gull | row: bird — gull: medium-gray back, yellow-green legs, red and black bill spots | great-basin, california, pnw, desert-sw | C | 50 cm | Res; Great Salt Lake colonies | every Utah parking lot, field and landfill | P1 |
| western-glaucous-gulls | Western and glaucous-winged gulls (and their "Olympic gull" hybrids) | row: bird — gull: dark gray back (western); gray wingtips (glaucous-winged) | california, pnw | C | 60-65 cm | Res | on every roof, ferry and dumpster | P2 |
| other-gulls | Heermann's, Franklin's, Bonaparte's, short-billed and yellow-footed gulls | row: bird — gull: dark gray body, white head, red bill (Heermann's); black hood, pink breast (Franklin's) | california, pnw, plains, upstate-ny, great-basin | C | 33-55 cm | by species | Franklin's flocks follow plows | P3 |
| terns | Common, least, Forster's, roseate, black, Caspian, royal, sandwich and elegant terns | row: bird — white, pale gray back, black cap, forked tail; red or orange bills (bird-hover) | new-england, mid-atlantic, south, california, pnw, upstate-ny, midwest, plains, great-basin | C | 22-53 cm | Sum / Res south | hover, then dive; colonies on beaches; least terns nest on gravel roofs | P2 |
| black-skimmer | Black skimmer | row: bird — black above, white below, red-and-black knife bill, lower half longer | mid-atlantic, southeast, florida, gulf, texas | C | 45 cm | Sum / Res | slices the water with its lower bill in flight | P3 |

### 12.15 Shorebirds

| id | Name | Build | Regions | C | Size | Seasons / states | Animation & behaviour | P |
|---|---|---|---|---|---|---|---|---|
| sanderling | Sanderling | have: sandpiper | new-england, mid-atlantic, south, california, pnw | C | 20 cm | Win / Mig | runs in and out with the surf line like clockwork | P2 |
| small-sandpipers | Dunlin, semipalmated, western, least and purple sandpipers | row: sandpiper — gray-brown; slate with orange legs (purple) | new-england, mid-atlantic, south, california, pnw, great-basin | C | 15-22 cm | Mig / Win; Bay flocks of tens of thousands | flocks probe mudflats and wheel together | P3 |
| turnstones-knot | Ruddy and black turnstones, red knot, surfbird, wandering tattler | row: sandpiper — patterned; red knot robin-red in May | mid-atlantic, california, pnw, new-england | O | 21-27 cm | Mig; red knots at horseshoe crab eggs mid-May | flip stones and wrack | P3 |
| willet-dowitcher | Willet and short-billed dowitcher | row: sandpiper — bigger; willet's black-and-white wing flash | mid-atlantic, south, california, plains | C | 28-38 cm | Res / Win | sewing-machine probing (dowitcher) | P3 |
| curlews-godwits | Long-billed curlew, whimbrel, marbled godwit | row: ibis — absurdly long down-curved bill (curlew); upturned (godwit) | great-basin, plains, texas, california, pnw | C | 40-60 cm | Sum (curlew on fields); Win coasts | probe deep in mud and fields | P3 |
| avocet-stilt | American avocet and black-necked stilt | row: ibis — black and white; upturned bill and cinnamon head (avocet); absurdly long pink legs (stilt) | great-basin, plains, california, gulf, texas, desert-sw | C | 35-45 cm | Sum / Res | avocets sweep their bills; stilts yap and hover-mob | P2 |
| phalaropes | Wilson's and red-necked phalaropes | row: sandpiper — +swim | great-basin, plains | C | 18-23 cm | Mig Jul-Aug: hundreds of thousands | spin in circles on the water | P3 |
| upland-sandpiper | Upland sandpiper | row: sandpiper — perches on fence posts | plains | O | 30 cm | Sum | wings held up on landing | P3 |
| killdeer | Killdeer | row: sandpiper — brown back, two black breast bands, orange rump | all | C | 25 cm | Res | gravel lots and roofs; broken-wing act; loud "kill-deer" | P2 |
| plovers | Piping, Wilson's and snowy plovers | row: sandpiper — sand-colored, single or partial neck band | new-england, mid-atlantic, southeast, gulf, midwest, california | R | 16-20 cm | Sum (piping, fenced beaches) | chicks run like cotton balls; run-stop feeding | P3 |
| oystercatchers | American and black oystercatchers | row: sandpiper — black head, brown back, white belly (American); all black (black); thick orange-red bill | mid-atlantic, southeast, gulf, texas, california, pnw | O | 45 cm | Res | loud whistling pairs on jetties and rocks | P3 |

## 13. Reptiles and amphibians

None of these exists yet. They need four new body plans: `sprawler†` (crocodilians, lizards,
salamanders), `turtle†`, `snake†` and `frog†`. Each animates in the vertex shader like the quad
and bird plans: a side-to-side body wave for sprawlers and snakes, hinged legs for turtles and
frogs.

### 13.1 Crocodilians and lizards (sprawler†)

| id | Name | Build | Regions | C | Size | Seasons / states | Animation & behaviour | P |
|---|---|---|---|---|---|---|---|---|
| american-alligator | American alligator | new: sprawler† — dark olive-black armoured back of ridged scutes, broad rounded snout, pale belly; yellow-banded young | southeast, florida, gulf, texas, ozarks | C | 2-4 m (males 4+) | basks on sunny banks, even in winter; bellows May; nest mounds summer | floats with only eyes and snout up, sinks without a ripple; high walk on land; belly slide into water; jaws open to bask | P1 |
| american-crocodile | American crocodile | row: sprawler† — lighter gray-olive, narrow snout, lower teeth showing | florida | R | 3-4 m | Res | basks with its mouth open | P3 |
| green-anole | Green anole | row: sprawler† — small, bright green (brown when cool), pointed snout, long tail | southeast, florida, gulf, texas, appalachia, ozarks | C | 12-20 cm | all year when warm | bobs its head; flashes a pink throat fan; turns brown | P1 |
| brown-anole | Brown anole | row: sprawler† — brown with a diamond back, orange-red dewlap edged yellow | florida, southeast, gulf, texas | C | 15-20 cm | all year | on every wall, fence and shrub in Florida; head-bobbing males | P1 |
| knight-anole | Knight anole | row: sprawler† — big, bright green, yellow shoulder stripe | florida | O | 40-50 cm | Res | high on tree trunks | P3 |
| fence-lizards | Eastern fence lizards (incl. prairie and plateau lizards) | row: sprawler† — gray-brown, rough scales; blue belly patches (males) | mid-atlantic, appalachia, southeast, ozarks, midwest, plains, rockies, great-basin | C | 12-18 cm | spring-fall, sunny days | push-up displays on fence posts and rock walls | P2 |
| western-fence-lizard | Western fence lizard ("blue-belly") and sagebrush lizard | row: sprawler† — gray-brown spiny scales, blue belly patches | california, pnw, great-basin, rockies | C | 12-20 cm | spring-fall | push-ups on every fence, rock and log | P2 |
| spiny-lizards | Texas, desert, crevice, granite and rose-bellied spiny lizards | row: sprawler† — big, spiny, banded; black collar (desert) | texas, desert-sw, great-basin, california | C | 15-30 cm | spring-fall | spirals round tree trunks; push-ups | P2 |
| small-desert-lizards | Side-blotched and ornate tree lizards | row: sprawler† — small brown-gray, dark blotch behind the foreleg, blue flecks | desert-sw, great-basin, california | C | 10-15 cm | sunny mornings | the most-seen lizard on trails; push-ups | P2 |
| collared-lizard | Collared lizard ("mountain boomer") | row: sprawler† — big head; male turquoise-green body, yellow head, two black collars | ozarks, plains, texas, desert-sw, great-basin | C | 25-35 cm | May-Sep on hot rocks | basks on boulders; runs upright on its hind legs | P2 |
| leopard-zebra-tailed-lizards | Long-nosed leopard and zebra-tailed lizards, desert iguana | row: sprawler† — spotted; curled black-and-white striped tail | desert-sw, great-basin | C | 20-40 cm | hot noon (desert iguana) | dashes with tail curled up | P3 |
| chuckwalla | Chuckwalla | row: sprawler† — fat, flattened, loose-skinned, dark with red-orange or gray tail | desert-sw, great-basin | C | 30-40 cm | spring-fall | basks on boulders; wedges into cracks | P3 |
| gila-monster | Gila monster | row: sprawler† — heavy beaded skin in pink-orange and black bands, fat tail | desert-sw, great-basin | R | 45-55 cm | spring mornings and after monsoon rains | slow waddle; flicks a black forked tongue | P3 |
| horned-lizards | Texas, regal, desert, short-horned and coast horned lizards | row: sprawler† — flat round body, crown of horns, sandy with dark spots | texas, plains, desert-sw, great-basin, rockies, california | R | 8-12 cm | sunny days by ant mounds | sits still; squirts blood from its eyes | P3 |
| lesser-earless-lizard | Lesser earless lizard | row: sprawler† — small, sandy | plains | O | 10-12 cm | summer | dashes on sand | P3 |
| whiptails | Whiptails (Texas spotted, western, Sonoran spotted, New Mexico, plateau striped, California) and six-lined racerunner | row: sprawler† — striped, very long tail | texas, desert-sw, great-basin, california, plains, ozarks, mid-atlantic, southeast, midwest | C | 15-30 cm | hot days | fast jerky foraging, never still | P3 |
| skinks | Five-lined, broad-headed, Great Plains, ground, western and Gilbert's skinks | row: sprawler† — shiny; young black with five yellow stripes and a bright blue tail; old males orange-headed | east, plains, texas, west | C | 10-30 cm | spring-fall | darts under woodpiles and porches | P3 |
| alligator-lizards | Northern, southern and Texas alligator lizards | row: sprawler† — long body, tiny legs, banded brown-orange plates | california, pnw, rockies, texas | C | 25-35 cm | spring-fall | slow; bites | P3 |
| house-geckos | Mediterranean and tropical house geckos, banded gecko | row: sprawler† — translucent pinkish-tan, warty, big eyes, sticky toes | south, desert-sw, california | C | 10-12 cm | night | several at a porch light; chirps; walks up walls | P3 |
| green-iguana | Green iguana | row: sprawler† — green, gray or orange; spiny crest, cheek scale, dewlap, banded tail | florida | C | 1-1.5 m | falls stunned from trees in cold snaps | groups bask on seawalls and pool decks | P2 |
| big-invasive-lizards | Black spiny-tailed iguana, Argentine tegu, Nile monitor, curly-tailed lizard | row: sprawler† — gray-black banded (iguana); black-and-white beaded (tegu); tail curled over its back (curly-tail) | florida | O | 0.2-2 m | Res | bask on rocks and walls; monitors in canals | P3 |

### 13.2 Salamanders and newts (sprawler†)

| id | Name | Build | Regions | C | Size | Seasons / states | Animation & behaviour | P |
|---|---|---|---|---|---|---|---|---|
| red-eft | Red-spotted newt (red eft) | row: sprawler† — eft bright orange-red with black-ringed red spots; adult olive-green in water | new-england, upstate-ny, appalachia, mid-atlantic, midwest | C | 6-8 cm (eft) | efts on wet trails after summer rain | slow-walking efts by the dozen | P2 |
| spotted-salamander | Spotted salamander | row: sprawler† — blue-black, two rows of yellow spots | new-england, upstate-ny, mid-atlantic, appalachia, midwest | O | 15-20 cm | "Big Night" migrations on rainy nights Mar-Apr | mass crossings of roads to vernal pools | P3 |
| red-backed-salamander | Eastern red-backed salamander | row: sprawler† — slim, dark with a red-orange back stripe | new-england, upstate-ny, mid-atlantic, appalachia, midwest | C | 8 cm | under logs and stones | darts when a log is lifted | P3 |
| stream-salamanders | Dusky, seal, black-bellied, slimy, three-lined, Ozark zigzag salamanders | row: sprawler† — brown-gray to black, mottled; slimy black with white flecks | appalachia, ozarks, southeast | C | 8-15 cm | night on wet rocks | under every streamside rock in the Smokies | P3 |
| red-cheeked-salamander | Red-cheeked (Jordan's) salamander | row: sprawler† — slate-black, bright red cheeks | appalachia | O | 10 cm | trails after rain at night | — | P3 |
| marbled-salamander | Marbled, blue-spotted and Jefferson salamanders | row: sprawler† — black with silver-white crossbands (marbled) | mid-atlantic, southeast, midwest | O | 10-15 cm | autumn breeding | — | P3 |
| hellbender | Eastern and Ozark hellbenders | row: sprawler† — flat, wrinkly, mottled brown-olive, loose side folds | appalachia, upstate-ny, ozarks, midwest | R | 30-60 cm | Res | under big flat rocks in clear rivers | P3 |
| mudpuppy | Mudpuppy | row: sprawler† — red feathery gills | upstate-ny, midwest | O | 20-30 cm | Res | in lakes and rivers | P3 |
| tiger-salamander | Tiger salamander (incl. barred) | row: sprawler† — big, black with yellow bars | plains, midwest, rockies, great-basin | C | 15-25 cm | in window wells after rain | slow walk | P3 |
| cave-salamanders | Cave, grotto, dark-sided and long-tailed salamanders | row: sprawler† — bright orange with black spots (cave); blind pale (grotto) | ozarks | O | 10-15 cm | at cave mouths and spring runs | — | P3 |
| spring-salamanders | Barton Springs and Texas blind salamanders | row: sprawler† — small, gilled, pale or eyeless | texas | R | 6-13 cm | single spring systems | — | P3 |
| dwarf-salamanders | Dwarf salamanders | row: sprawler† — tiny | gulf | O | 5-8 cm | — | — | P3 |
| west-coast-newts | California, coast range, rough-skinned and red-bellied newts | row: sprawler† — rough brown back, bright orange belly | california, pnw | C | 15-20 cm | crosses roads on rainy winter nights | walks slowly in the open; arches to flash its orange belly | P2 |
| west-coast-salamanders | Ensatina, arboreal, California slender, northwestern, long-toed, western red-backed, Dunn's, Olympic torrent and Van Dyke's salamanders | row: sprawler† — orange-brown with a pinched tail base (ensatina); worm-like (slender) | california, pnw, rockies | C | 5-15 cm | under logs in the wet season | — | P3 |
| giant-salamanders | Coastal giant salamander | row: sprawler† — marbled brown-purple | california, pnw | O | 20-30 cm | in streams | — | P3 |
| california-tiger-salamander | California tiger salamander | row: sprawler† — black with pale spots | california | R | 15-20 cm | vernal pools | — | P3 |

### 13.3 Turtles and tortoises (turtle†)

| id | Name | Build | Regions | C | Size | Seasons / states | Animation & behaviour | P |
|---|---|---|---|---|---|---|---|---|
| painted-turtle | Painted turtle (incl. western painted) | new: turtle† — olive-black smooth shell with red edges, yellow neck stripes | all but desert-sw, florida | C | 15-20 cm shell | basks spring-fall | rows basking on logs, necks stretched; slide off when approached; swim with the head up | P1 |
| red-eared-slider | Red-eared slider | row: turtle† — olive shell with yellow lines, red stripe behind the eye | all | C | 15-28 cm shell | basks | stacks on logs; slides off | P1 |
| yellow-bellied-slider | Yellow-bellied slider | row: turtle† — olive-black, yellow patch behind the eye | southeast, florida, gulf | C | 20-28 cm shell | basks | stacks of turtles on every pond log | P1 |
| cooters | River, Texas river, peninsula, Florida red-bellied and northern red-bellied cooters | row: turtle† — dark shells with yellow-red markings | mid-atlantic, southeast, florida, gulf, texas, ozarks | C | 25-30 cm shell | basks | on logs in rivers | P2 |
| snapping-turtle | Snapping turtle | row: turtle† — mossy ridged shell, big head, long saw-toothed tail | east, plains, texas, pnw | C | 25-45 cm shell | crosses roads to lay eggs Jun | slow plod on roads; lunges | P2 |
| alligator-snapping-turtle | Alligator snapping turtle | row: turtle† — three high saw-toothed ridges, huge hooked beak | gulf, texas, ozarks | R | 40-80 cm shell, 70+ kg | Res | lies on the bottom wiggling a pink worm-like tongue lure | P3 |
| map-turtles | Map turtles (Mississippi, Ouachita, northern, Cagle's) | row: turtle† — saw-backed ridge, yellow head lines | upstate-ny, midwest, gulf, ozarks, appalachia, texas | C | 10-25 cm shell | basks | bask on river snags | P3 |
| softshells | Spiny, smooth and Florida softshells | row: turtle† — flat leathery pancake shell, snorkel nose | florida, gulf, texas, plains, midwest, appalachia, ozarks | C | 30-60 cm shell | basks on banks | surfaces among bread-feeding ducks | P3 |
| mud-musk-turtles | Eastern and yellow mud turtles, common musk turtle (stinkpot) | row: turtle† — small, dark | mid-atlantic, southeast, gulf, ozarks, texas, plains | C | 8-13 cm shell | — | walk the bottom | P3 |
| box-turtles | Eastern, three-toed, Gulf Coast and ornate box turtles | row: turtle† — high domed brown-black shell, yellow-orange pattern; ornate's yellow sunburst lines | east, plains, texas | C | 12-15 cm shell | on roads after rain May-Jun | slow walk; closes its hinged shell | P2 |
| rare-pond-turtles | Wood, spotted, Blanding's and bog turtles | row: turtle† — sculpted scutes, orange neck (wood); yellow polka dots (spotted) | new-england, upstate-ny, mid-atlantic, midwest | R | 10-25 cm shell | — | — | P3 |
| diamondback-terrapin | Diamondback terrapin | row: turtle† — gray-black ringed shell, pale spotted skin, "mustache" | new-england, mid-atlantic, southeast, gulf | C | 12-23 cm shell | females cross causeways to nest Jun-Jul | heads poke up in marsh creeks | P2 |
| western-pond-turtle | Western (northwestern) pond turtle | row: turtle† — plain olive-brown, flattened | california, pnw | R | 15-20 cm shell | basks | — | P3 |
| gopher-tortoise | Gopher tortoise | row: turtle† — high domed brown-gray shell, shovel front legs, elephant hind feet | florida, southeast, gulf | C | 25-35 cm shell | burrow aprons of white sand | plods between burrows on roadsides and medians | P2 |
| desert-tortoise | Desert tortoise | row: turtle† — high domed brown shell with growth rings | desert-sw, great-basin | R | 25-35 cm shell | after summer rains | plods; retreats into its burrow | P3 |
| texas-tortoise | Texas tortoise | row: turtle† — tan shell, yellow-orange-centred plates | texas | R | 15-20 cm shell | — | plods through brush | P3 |
| loggerhead-sea-turtle | Loggerhead sea turtle | row: turtle† — flippers; reddish-brown shell, big head | southeast, florida, gulf, mid-atlantic | C (nesting) | 1 m shell | nests May-Aug; hatchlings Jul-Oct at night; tractor-mark tracks and staked nests | hauls up the beach, digs, returns; hatchlings scramble to the surf | P2 |
| green-sea-turtle | Green sea turtle | row: turtle† — flippers; smooth olive-brown shell, small head | florida, texas, gulf, california | C | 1 m shell | nests summer; at seawalls and jetties | surfaces to breathe; glides | P3 |
| other-sea-turtles | Kemp's ridley and leatherback | row: turtle† — small gray-olive round shell (ridley); huge ridged leathery (leatherback) | texas, gulf, florida, mid-atlantic | R | 0.6-2 m | nesting Apr-Jul (ridley on Padre Island) | hatchling releases | P3 |

### 13.4 Snakes and legless lizards (snake†)

| id | Name | Build | Regions | C | Size | Seasons / states | Animation & behaviour | P |
|---|---|---|---|---|---|---|---|---|
| common-garter-snake | Common garter snake (incl. red-sided, Puget striped) | new: snake† — dark with three yellow-green to cream stripes | all but desert-sw | C | 50-70 cm | spring-fall on sunny days | slithers; basks in coils; flicks its tongue | P2 |
| other-garter-snakes | Plains, Butler's, western terrestrial, northwestern, coast, valley, Sierra, giant and San Francisco garters; ribbon snakes | row: snake† — striped variants | plains, midwest, rockies, great-basin, california, pnw, south, ozarks | C | 40-100 cm | spring-fall | near water | P3 |
| rat-snake | Rat snakes (black, gray, yellow, Texas) | row: snake† — glossy black with white chin; gray blotched; yellow striped; brown-gray blotched | east, texas, plains | C | 1.2-1.8 m | spring-fall | climbs barns, trees and attics; kinks when still | P2 |
| racer | Racers (black, southern black, blue, olive, yellow-bellied) | row: snake† — slim, satin black with white chin, or blue, olive, brown | all | C | 1-1.5 m | spring-fall | very fast; races off with head raised | P3 |
| coachwhip | Coachwhip ("red racer") and whipsnakes (Sonoran, striped) | row: snake† — long, slender, tan to red-pink | texas, desert-sw, great-basin, plains, ozarks, california | C | 1-2.5 m | day | fast, head up | P3 |
| gopher-snake | Gopher snake and bullsnake (incl. Pacific and Great Basin) | row: snake† — tan or yellow with dark brown blotches | plains, west, texas | C | 1.2-2 m | spring-fall | hisses and vibrates its tail like a rattlesnake | P2 |
| water-snakes | Water snakes (northern, banded, broad-banded, brown, diamondback, green, blotched) and queen snake | row: snake† — thick, brown-banded or blotched | east, texas, plains | C | 0.6-1.5 m | spring-fall | basks in groups on branches over water | P2 |
| copperhead | Copperhead (incl. broad-banded and Trans-Pecos) | row: snake† — pinkish-tan with darker hourglass bands, coppery head | appalachia, southeast, mid-atlantic, ozarks, texas, plains, midwest, gulf, new-england, upstate-ny | C | 60-90 cm | summer nights | sits motionless in leaf litter and woodpiles | P2 |
| cottonmouth | Cottonmouth (water moccasin) | row: snake† — thick, dark olive to black; banded young with a yellow tail tip | southeast, florida, gulf, texas, ozarks, mid-atlantic, plains, midwest | C | 75-120 cm | spring-fall | swims with its body high on the water; gapes to show the white mouth | P2 |
| timber-rattlesnake | Timber (canebrake) rattlesnake | row: snake† — yellow or black morph, dark chevrons, black tail, rattle | appalachia, ozarks, new-england, upstate-ny, mid-atlantic, southeast, gulf, texas, plains, midwest | O | 0.9-1.5 m | den sites spring and fall | coils; rattles | P3 |
| diamondback-rattlesnakes | Eastern and western diamondback rattlesnakes | row: snake† — diamonds edged cream or white; "coon-tail" (western) | texas, desert-sw, southeast, florida, gulf, plains | C | 1-2 m | spring and summer evenings | coils under bushes, rattling | P2 |
| western-rattlesnakes | Prairie, western, Great Basin, northern and southern Pacific, red diamond, speckled, Mojave, tiger, black-tailed, rock, ridge-nosed, Hopi and midget faded rattlesnakes | row: snake† — greenish-tan with brown blotches (prairie); brick-red (red diamond); white-ringed tail (Mojave) | plains, rockies, great-basin, desert-sw, california, pnw, texas | C | 0.5-1.5 m | spring-fall; none high up | coil and rattle on trails | P2 |
| sidewinder | Sidewinder | row: snake† — small, pale, horn-like scales over the eyes | desert-sw, great-basin | C | 50-80 cm | night in summer | sidewinds, leaving J-shaped tracks on dunes | P3 |
| small-rattlesnakes | Pygmy and western pygmy rattlesnakes, eastern and western massasaugas | row: snake† — small, gray with dark blotches and a rusty back stripe | southeast, florida, gulf, ozarks, texas, plains, midwest, upstate-ny | O | 40-75 cm | — | — | P3 |
| coral-snakes | Eastern, Texas and Arizona coral snakes | row: snake† — red, yellow and black bands ("red touches yellow") | southeast, florida, gulf, texas, desert-sw | R | 50-80 cm | — | burrows in leaf litter | P3 |
| kingsnakes | Kingsnakes (eastern, speckled, prairie, California, desert banded) | row: snake† — glossy black with yellow chain bands or a yellow dot on every scale; black-brown with white bands (California) | east, texas, plains, california, desert-sw, great-basin | C | 0.9-1.5 m | spring-fall | — | P3 |
| tricolor-snakes | Milk, scarlet kingsnake and mountain kingsnakes (Utah, California) | row: snake† — red, black and white or tan with red-brown saddles | east, great-basin, california | O | 0.5-1 m | — | — | P3 |
| corn-snake | Corn snake | row: snake† — orange-red with red blotches edged black | southeast, florida | O | 1-1.5 m | — | — | P3 |
| hognose-snakes | Eastern and western hognose snakes | row: snake† — thick, upturned snout | mid-atlantic, appalachia, southeast, midwest, plains | O | 50-90 cm | — | flattens a cobra-like neck, then plays dead | P3 |
| pine-snake | Northern pine snake | row: snake† — cream with black blotches | mid-atlantic | R | 1.5 m | — | — | P3 |
| green-snakes | Smooth and rough green snakes | row: snake† — slim bright green | east, texas, plains | O | 40-80 cm | — | lies still in shrubs | P3 |
| small-snakes | DeKay's brown, ring-necked, northern red-bellied, lined, Texas brown and rough earth snakes, night, glossy, long-nosed and patch-nosed snakes | row: snake† — small; ring-necked's bright orange belly | all | C | 20-100 cm | — | under boards and in city lots | P3 |
| fox-snake | Fox snake | row: snake† — tan with brown blotches, copper head | midwest | O | 1-1.5 m | — | mistaken for a rattler | P3 |
| indigo-snakes | Eastern and Texas indigo snakes | row: snake† — 2 m glossy blue-black, red chin (eastern) | florida, texas | R | 2-2.5 m | — | — | P3 |
| blind-snakes | Texas and Brahminy blind snakes | row: snake† — tiny, worm-like | texas, florida | O | 15-25 cm | — | in flowerpots and after rain | P3 |
| boas | Rubber and rosy boas | row: snake† — smooth olive-brown like rubber; rosy striped | rockies, pnw, california | O | 40-80 cm | — | slow; balls up | P3 |
| burmese-python | Burmese python | row: snake† — huge, tan with dark giraffe-like blotches | florida | O | 3-5 m | sunny winter mornings on levees | stretched on Everglades roads at night | P3 |
| legless-lizards | Eastern, slender and California glass and legless lizards | row: snake† — shiny tan-green, stiff | southeast, gulf, midwest, plains, ozarks, california | O | 30-100 cm | — | moves stiffly; tail snaps off | P3 |
| amphiumas-sirens | Amphiumas ("congo eels") and sirens | row: snake† — dark gray eel with tiny legs | southeast, gulf | R | 50-100 cm | in ditches and crawfish ponds | wriggles in mud | P3 |

### 13.5 Frogs and toads (frog†)

| id | Name | Build | Regions | C | Size | Seasons / states | Animation & behaviour | P |
|---|---|---|---|---|---|---|---|---|
| american-bullfrog | American bullfrog | new: frog† — green-olive, big round eardrum | all | C | 10-20 cm | deep "jug-o-rum" night calls in summer | sits at the water's edge; leaps and plops in; floats with eyes up | P2 |
| green-frog | Green and bronze frogs | row: frog† — green-brown, ridges down the back | east | C | 7-10 cm | "loose banjo string" call | squeaks and jumps | P3 |
| leopard-frogs | Northern, southern, plains, Rio Grande and lowland leopard frogs, pickerel frog | row: frog† — green or brown with dark spots | all | C | 6-11 cm | spring-fall | leaps from grass | P3 |
| wood-frog | Wood and mink frogs | row: frog† — tan-brown with a dark robber's mask (wood) | new-england, upstate-ny, appalachia, midwest | C | 5-7 cm | quacking chorus the first warm night in March | — | P3 |
| southern-pond-frogs | Pig and carpenter frogs | row: frog† — big; grunting calls (pig) | florida, southeast, gulf, mid-atlantic | C | 8-15 cm | summer nights | — | P3 |
| american-toad | American, Fowler's, southern, Gulf Coast, Woodhouse's, Great Plains, Texas, red-spotted and Arizona toads | row: frog† — warty brown, big parotoid glands | all | C | 5-11 cm | under porch lights at night; trilling spring chorus | hops; sits under lights catching insects | P2 |
| western-toad | Western (boreal, California) toad | row: frog† — warty gray-olive, pale back stripe | california, pnw, rockies | O | 7-12 cm | mass migrations of toadlets | — | P3 |
| cane-toad | Cane (giant) toad | row: frog† — 15-20 cm brown warty, huge glands | florida, texas | C | 15-20 cm | Res | on lawns at night | P3 |
| sonoran-desert-toad | Sonoran Desert (Colorado River) toad | row: frog† — smooth olive-green, white jaw wart | desert-sw | C | 15-19 cm | monsoon nights | at porch lights and pools | P3 |
| small-toads | Oak and narrowmouth toads | row: frog† — tiny; orange back stripe (oak) | southeast, florida, plains | O | 2-4 cm | after rain | — | P3 |
| spadefoots | Couch's, plains and Great Basin spadefoots | row: frog† — bright yellow-green with black marbling (Couch's) | desert-sw, texas, plains, great-basin | C | 5-8 cm | after summer storms | deafening choruses in temporary pools | P3 |
| spring-peeper | Spring peeper | row: frog† — tiny tan with a dark X | east | C | 2-3 cm | deafening night chorus Feb-Apr | heard more than seen | P3 |
| gray-treefrog | Gray and Cope's gray treefrogs | row: frog† — gray-green, warty, yellow-orange flash under the thighs | east, plains | C | 4-6 cm | trilling summer nights | clings to porches and gutters | P3 |
| southern-treefrogs | Green, squirrel and barking treefrogs | row: frog† — bright green with a white side stripe (green) | southeast, florida, gulf, texas | C | 3-6 cm | "quonk" chorus; on windows at night | clings to windows and banana leaves | P2 |
| cuban-treefrog | Cuban treefrog | row: frog† — big warty pale | florida | C | 5-14 cm | Res | on windows, in toilets | P3 |
| pacific-chorus-frog | Pacific chorus frog (Pacific, Sierran and Baja California treefrogs) | row: frog† — green, brown or gray with a dark eye stripe | california, pnw | C | 3-5 cm | the loud winter-spring chorus Jan-May; "the ribbit of Hollywood movies" | calls from every ditch and sprinkler | P2 |
| chorus-cricket-frogs | Chorus frogs (upland, boreal, western) and cricket frogs (Blanchard's) | row: frog† — tiny | east, plains, rockies, texas | C | 2-4 cm | early spring choruses | — | P3 |
| canyon-treefrog | Canyon treefrog | row: frog† — gray-tan with dark blotches matching sandstone | great-basin, desert-sw | C | 5 cm | bleating at night | on boulders by canyon pools | P3 |
| pine-barrens-treefrog | Pine Barrens treefrog | row: frog† — emerald with a lavender stripe edged white | mid-atlantic | R | 4 cm | honking June nights | — | P3 |
| chirping-frogs | Cliff, Rio Grande chirping frogs and greenhouse frog | row: frog† — tiny, chirping | texas, florida | C | 2-3 cm | — | on rock walls and in potted plants | P3 |
| western-pond-frogs | Red-legged (California, northern), Columbia and Oregon spotted, Cascades and yellow-legged frogs | row: frog† — brown with red-washed belly and legs (red-legged) | california, pnw, rockies, great-basin | R | 5-13 cm | — | — | P3 |
| tailed-frogs | Coastal and Rocky Mountain tailed frogs | row: frog† — small, in cold streams | pnw, rockies | R | 3-5 cm | — | — | P3 |
| african-clawed-frog | African clawed frog | row: frog† — flat, smooth, gray-olive, clawed toes | california | O | 6-12 cm | — | floats in ponds | P3 |

## 14. Insects and other invertebrates

The butterfly is two tinted wing cards; a species is its wing picture (an atlas cell, like the leaf
pictures) and its size and flight. Moths are the same plan, flying at dusk.

### 14.1 Butterflies and moths (butterfly)

| id | Name | Build | Regions | C | Size | Seasons / states | Animation & behaviour | P |
|---|---|---|---|---|---|---|---|---|
| butterfly | Butterfly (generic, tinted) | have: butterfly | all | C | 5-10 cm wingspan | summer | flutters over gardens; rests wings-up | P2 |
| monarch | Monarch (incl. western; caterpillars on crawler†) | row: butterfly — orange with black veins and white-dotted black borders | all | C | 10 cm wingspan | Sum on milkweed; streams south Sep-Oct; roosts hang in clusters in trees (and winter groves in coastal California) | flap-glide flight; clusters burst into orange flight on warm afternoons | P1 |
| tiger-swallowtails | Eastern, Canadian, western and two-tailed tiger swallowtails | row: butterfly — yellow with black tiger stripes, blue-orange hind edge, tails; some eastern females all black | all | C | 10-14 cm wingspan | May-Sep | sails over streets; males gather in "puddle clubs" on wet gravel | P2 |
| dark-swallowtails | Black, spicebush, pipevine, palamedes and polydamas swallowtails | row: butterfly — iridescent blue-black | east, texas, plains | C | 8-12 cm wingspan | May-Sep | puddle clubs | P3 |
| zebra-swallowtail | Zebra swallowtail | row: butterfly — black and white stripes, long tails | appalachia, ozarks, southeast, gulf, midwest | C | 6-10 cm wingspan | spring-summer near pawpaw | fast low flight | P3 |
| giant-swallowtail | Giant, anise and Oregon swallowtails | row: butterfly — dark with yellow bands (giant); yellow (anise, Oregon) | florida, gulf, texas, desert-sw, ozarks, midwest, california, pnw | C | 8-15 cm wingspan | spring-fall | — | P3 |
| cabbage-white | Cabbage white | row: butterfly — white, black tips and spots | all | C | 5 cm wingspan | Mar-Nov | flutters over gardens | P3 |
| mourning-cloak | Mourning cloak | row: butterfly — dark maroon-brown, cream border, blue spots | all but florida | C | 7-8 cm wingspan | the first butterfly of spring | basks on sunny trails | P3 |
| admirals | Red, white, Weidemeyer's and Lorquin's admirals | row: butterfly — black with orange or white bands | all | C | 5-7 cm wingspan | spring-fall | — | P3 |
| ladies | Painted lady and West Coast lady | row: butterfly — orange-pink patterned | all | C | 5-6 cm wingspan | mass spring migrations through the West after wet winters (millions) | streams across roads | P3 |
| buckeye-question-mark | Common buckeye, question mark, Milbert's tortoiseshell, hackberry and tawny emperors | row: butterfly — brown with eyespots and orange bars (buckeye) | all | C | 5-7 cm wingspan | summer | — | P3 |
| fritillaries | Great spangled, Diana, regal, Mormon and other fritillaries | row: butterfly — orange with black spots; regal's black hindwings | all but florida | C | 5-10 cm wingspan | summer | — | P3 |
| gulf-fritillary | Gulf fritillary and julia | row: butterfly — bright orange, silver-spotted undersides | south, california | C | 6-8 cm wingspan | Mar-Nov on passionflower | — | P3 |
| zebra-longwing | Zebra longwing (Florida's state butterfly) | row: butterfly — long narrow black wings with pale yellow stripes | florida, texas | C | 8 cm wingspan | Res | slow floating flight; roosts communally at night | P2 |
| queen-viceroy | Queen and viceroy | row: butterfly — dark chestnut monarch with white dots (queen); monarch look-alike (viceroy) | florida, texas, desert-sw, plains, midwest | C | 7-8 cm wingspan | summer | — | P3 |
| sulphurs | Cloudless, orange, clouded, dainty and orange-barred sulphurs, sleepy orange, dogfaces (southern, California) | row: butterfly — lemon or orange-yellow | all | C | 3-7 cm wingspan | cloudless sulphur in autumn | fast flight | P3 |
| blues-hairstreaks | Blues (Karner, acmon, cassius), atala and Colorado hairstreaks | row: butterfly — small, violet-blue; velvet black and blue with a red abdomen (atala); purple (Colorado) | all | C | 2-4 cm wingspan | — | — | P3 |
| skippers-small | Long-tailed, fiery and common checkered skippers; Baltimore and other checkerspots; Texas crescent; common wood-nymph | row: butterfly — small, darting | all | C | 2-5 cm wingspan | summer | darts | P3 |
| american-snout | American snout | row: butterfly — brown-orange with a beak-like snout | texas | C | 4-5 cm wingspan | huge South Texas migrations some years | streams across highways | P3 |
| tropical-butterflies | White peacock, Mexican bluewing, malachite, empress Leilia, California sister, Rocky Mountain parnassian | row: butterfly | florida, texas, desert-sw, california, rockies | O | 5-9 cm wingspan | — | — | P3 |
| big-silk-moths | Luna, cecropia, polyphemus, io and imperial moths | row: butterfly — pale green with long tails (luna); big eyespots | east | O | 8-15 cm wingspan | Jun at porch lights | flutters at porch and gas-station lights | P3 |
| sphinx-moths | White-lined sphinx and hummingbird moths | row: butterfly — hummingbird-sized, pink-striped hindwings | all | C | 6-9 cm wingspan | dusk on flowers | hovers at sacred datura and garden flowers | P3 |
| miller-moth | Miller moth (army cutworm) | row: butterfly — plain gray-brown | plains, rockies, great-basin | C | 4 cm wingspan | May-Jun swarms in houses and lights | swarms round lights | P3 |
| pest-moths | Spongy, winter and browntail moths | row: butterfly — plain; caterpillars on crawler† | new-england, upstate-ny, midwest | O | 2-5 cm wingspan | outbreak years defoliate oaks | — | P3 |

### 14.2 Fireflies (firefly)

| id | Name | Build | Regions | C | Size | Seasons / states | Animation & behaviour | P |
|---|---|---|---|---|---|---|---|---|
| common-firefly | Common eastern firefly ("big dipper", Photinus pyralis) | have: firefly | east, plains, texas | C | 1-1.5 cm | dusk to 10 pm, late May-Jul (earlier south) | males fly a rising J-shaped flash; females answer from the grass | P2 |
| synchronous-firefly | Synchronous fireflies (Photinus carolinus; Photuris frontalis at Congaree) | row: firefly — flash pattern | appalachia, southeast | R | 1-1.5 cm | about two weeks late May-mid Jun | thousands flash in unison: 5-8 quick flashes, then total dark | P3 |
| blue-ghost-firefly | Blue ghost firefly | row: firefly — steady blue-white glow | appalachia | R | 1 cm | May-Jun, just after dark | glides 30 cm above the leaf litter like floating sparks | P3 |
| western-fireflies | Western fireflies and glowworms (non-flashing, local) | row: firefly — dim or no flash | great-basin, rockies, desert-sw, california, pnw | R | 1 cm | Jun in wet meadows | faint glow, no display | P3 |

### 14.3 Dragonflies and damselflies (dragonfly†)

| id | Name | Build | Regions | C | Size | Seasons / states | Animation & behaviour | P |
|---|---|---|---|---|---|---|---|---|
| common-green-darner | Common green darner | new: dragonfly† — green thorax, blue abdomen | all | C | 7-8 cm | spring-fall; huge coastal migrations in Sep | patrols back and forth; hovers, darts, turns on a dime | P1 |
| skimmers | Common whitetail, twelve-spotted, widow, eight-spotted and flame skimmers, blue dasher, black saddlebags | row: dragonfly† — chalky white body; black-and-white wing spots; powder-blue; bright orange | all | C | 4-6 cm | summer | perches on twigs, darts out and back | P2 |
| pennants-meadowhawks | Halloween, four-spotted pennants, eastern pondhawk, variegated and cardinal meadowhawks, blue-eyed darner | row: dragonfly† — orange wings with brown bands (Halloween); red (meadowhawks) | all | C | 3-7 cm | summer | perches on stem tips, flicking wings | P3 |
| damselflies | Damselflies and ebony jewelwing | row: dragonfly† — slim; iridescent green-blue body, velvety black wings (jewelwing) | all | C | 3-5 cm | summer | weak fluttering flight along shady streams | P3 |

### 14.4 Cicadas, beetles, bees, wasps and other insects (bug†)

| id | Name | Build | Regions | C | Size | Seasons / states | Animation & behaviour | P |
|---|---|---|---|---|---|---|---|---|
| annual-cicada | Annual (dog-day) cicadas (Neotibicen; Apache cicada) | new: bug† — green and black, clear veined wings, wide-set eyes | east, plains, texas, desert-sw | C | 4-5 cm | loud buzzing choruses Jun-Sep afternoons; split brown shells on bark | heard more than seen; clings to bark; buzzes off | P1 |
| periodical-cicada | Periodical cicadas (13- and 17-year broods) | row: bug† — black body, red eyes, orange-veined wings | east, plains | R (C in a brood year) | 3 cm | May-Jun of an emergence year; shells everywhere | trillions; deafening; clumsy flights | P3 |
| small-western-cicadas | Sagebrush and Okanagana cicadas | row: bug† — small black-and-orange | great-basin, pnw, california | C | 2-3 cm | Jun | buzz from sage | P3 |
| katydids-crickets | Katydids (incl. fork-tailed bush katydid) and field crickets | row: bug† — leaf-green leaf-shaped (katydid); black (cricket) | all | C | 2-5 cm | night chorus Aug-Sep; cricket drifts under store lights in Texas | heard; hop | P3 |
| jerusalem-mormon-crickets | Jerusalem cricket and Mormon cricket | row: bug† — big amber head, striped abdomen (Jerusalem); fat flightless, brown, green, black or purple (Mormon) | california, great-basin, rockies, pnw | O | 5-7 cm | Mormon outbreaks Jun-Jul carpet roads | march in bands | P3 |
| grasshoppers | Grasshoppers (incl. band-winged kinds) | row: bug† — brown, green, yellow; yellow or red hindwings flash | all | C | 2-5 cm | late summer; clouds in drought | every step sends them clattering off | P2 |
| lubber-grasshoppers | Eastern and horse lubbers | row: bug† — fat, flightless; black with yellow and red stripes; big brown-and-yellow with red wings (horse) | southeast, florida, gulf, texas, desert-sw | C | 5-8 cm | spring-summer | crawls slowly on roadsides | P3 |
| praying-mantis | Praying mantises (Chinese, European, Carolina) | row: bug† — green or tan, raised forelegs | all | C | 5-10 cm | late summer; foam egg cases in winter | sways; strikes | P3 |
| spotted-lanternfly | Spotted lanternfly | row: bug† — gray-pink forewings with black spots, scarlet hindwings; nymphs black with white spots, then red | mid-atlantic, new-england, upstate-ny, appalachia, midwest, southeast | C | 2.5 cm | nymphs May-Jul; adults Aug-Nov | masses on trunks and walls; leaps, flashing scarlet | P2 |
| true-bugs | Brown marmorated stink bug, boxelder bug, western conifer seed bug, kudzu bug | row: bug† — shield-shaped mottled brown; black with red lines | all | C | 1-2 cm | crowd onto houses in fall | crawl | P3 |
| beetles | Japanese, May (June bug), dung and tiger beetles | row: bug† — metallic green with copper wing covers (Japanese); metallic green, fast (tiger) | all | C | 1-2.5 cm | Jun-Aug | groups skeletonize leaves; tiger beetles race on dirt roads | P3 |
| lady-beetles | Asian and convergent lady beetles | row: bug† — orange-red with black spots | all | C | 6 mm | swarm onto house walls Oct; winter clusters in Sierra canyons | clusters on rocks and logs | P3 |
| big-beetles | Palo verde root borer | row: bug† — huge brown longhorn | desert-sw | C | 7-9 cm | monsoon nights at lights | clumsy flight | P3 |
| tree-pest-beetles | Emerald ash borer, mountain pine and spruce beetles, tamarisk leaf beetle | row: bug† — tiny; seen as damage (snag, beetle-kill) | all | C | 0.5-1.5 cm | — | — | P3 |
| water-insects | Water striders and whirligig beetles | row: bug† — on the water surface | all | C | 1-2 cm | summer | skate and spin on pools | P3 |
| honey-bee | Honey bee (incl. Africanized) | row: bug† — golden-brown with dark bands | all | C | 1.2 cm | white hive boxes on field edges | buzzes flower to flower; swarms in spring | P2 |
| bumblebees | Bumblebees | row: bug† — fuzzy black and yellow (some orange) | all | C | 1.5-2.5 cm | spring-fall | bumbles flower to flower | P2 |
| carpenter-bees | Eastern and valley carpenter bees, mason bees | row: bug† — big shiny-bald black abdomen; valley male a fuzzy golden "teddy bear" | all | C | 1-2.5 cm | spring | males hover and bluff at decks and eaves | P3 |
| wasps-hornets | Paper wasps, yellowjackets and bald-faced hornets | row: bug† — wasp-waisted yellow-black or red-brown | all | C | 1-2 cm | colonies peak Aug-Sep | hover at soda cans and picnics | P3 |
| big-wasps | Cicada killer, tarantula hawk and velvet ants | row: bug† — 4 cm yellow-black (cicada killer); metallic blue-black with orange wings (tarantula hawk); fuzzy red-orange wingless (velvet ant) | all | C | 1-5 cm | summer | digs sand burrows; drags tarantulas | P3 |
| lovebugs | Lovebugs | row: bug† — black with red-orange thorax, flying joined in pairs | southeast, florida, gulf, texas | C | 1 cm | swarms May and Sep | joined pairs drift over roads | P3 |
| ants | Red imported fire ant, Texas leafcutter, red harvester, honeypot and Argentine ants | row: bug† — tiny; columns carrying green leaf bits (leafcutter) | south, desert-sw, great-basin, plains, california | C | 2-7 mm | — | trails and columns; swarm when a mound is disturbed | P3 |
| termites | Termites (incl. Formosan subterranean) | row: bug† — winged golden-brown alates | all | C | 1-1.5 cm | swarms at streetlights on May evenings and first rains | fill the air at lights | P3 |
| cockroaches | Palmetto bug (American cockroach) and Florida woods cockroach | row: bug† — 4 cm glossy red-brown | southeast, florida, gulf, texas | C | 3-4 cm | night | scuttles on porches; flies | P3 |
| biting-flies | Greenhead, deer and horse flies | row: bug† — big green eyes (greenhead) | all | C | 1-2 cm | Jul near salt marsh | circles the walker | P3 |
| crane-flies | Giant crane flies | row: bug† — long-legged "daddy-longlegs" flies | pnw | C | 2-3 cm | Sep swarms on houses and lawns | bob and dangle | P3 |
| aquatic-hatches | Mayflies (Hexagenia), stoneflies (salmonflies), caddisflies | row: bug† — delicate, upright wings, two long tail filaments (mayfly); orange-and-black (salmonfly) | midwest, rockies, pnw | C | 3-7 cm | Jun-Jul hatches; mayfly drifts under streetlights and on bridges, big enough for radar | rise in clouds; trout rise to them | P2 |

### 14.5 Swarms (swarm†)

| id | Name | Build | Regions | C | Size | Seasons / states | Animation & behaviour | P |
|---|---|---|---|---|---|---|---|---|
| mosquitoes | Mosquitoes (incl. Asian tiger mosquito) | new: swarm† — a cloud of tiny specks | all | C | specks | dusk; wet season | a cloud that follows and circles the walker | P3 |
| gnat-swarms | Black flies, no-see-ums, lake flies (midges), Moab's biting gnats | row: swarm† — dark specks; hazy columns over the shore | new-england, upstate-ny, midwest, southeast, florida, great-basin | C | specks | black flies mid-May-Jun; midges May | columns hang over shores; clouds round the head | P3 |
| brine-flies | Brine flies and brine shrimp | row: swarm† — black clouds and mats on the shore; orange streaks in the water | great-basin | C | specks | summer | mats lift as you walk | P3 |

### 14.6 Spiders and scorpions (spider†)

| id | Name | Build | Regions | C | Size | Seasons / states | Animation & behaviour | P |
|---|---|---|---|---|---|---|---|---|
| yellow-garden-spider | Yellow garden spider (Argiope) | new: spider† — black and yellow, a zigzag silk band in the web | all | C | 2.5 cm body | big webs Aug-Oct | sits head-down at the web centre; web sways in wind | P2 |
| orbweavers | Cross, marbled and spinybacked orbweavers | row: spider† — tan with a white cross (cross); white with red spines like a tiny crab (spinybacked) | all | C | 0.5-2 cm body | Aug-Oct webs on porches, hedges and trails | at the web centre | P3 |
| golden-silk-orbweaver | Golden silk orbweaver (banana spider) | row: spider† — long-legged yellow and brown, feather tufts | southeast, florida, gulf, texas | C | 2-4 cm body | Jul-Oct; golden webs across trails | — | P3 |
| joro-spider | Joro spider | row: spider† — yellow and blue-black banded, long banded legs | southeast, appalachia, gulf, mid-atlantic | C | 2-2.5 cm body, 10 cm leg span | Aug-Nov; golden webs stacked in tiers on porches and wires | — | P2 |
| tarantulas | Tarantulas (Texas brown, Oklahoma brown, desert Aphonopelma) | row: spider† — brown hairy | texas, plains, ozarks, desert-sw, great-basin, california | C | 10-12 cm leg span | males cross roads Sep-Oct and after monsoon rains | slow deliberate walk | P2 |
| house-spiders | Black and brown widows, brown recluse, Carolina wolf spider, giant house and hobo spiders | row: spider† — shiny black with red hourglass (widow) | all | C | 1-5 cm leg span | fall in houses (PNW) | — | P3 |
| scorpions | Striped bark, Arizona bark and giant desert hairy scorpions | row: spider† — claws and a curled tail; tan with stripes; glows blue-green under UV | texas, plains, ozarks, desert-sw, great-basin | C | 5-14 cm | night, summer | raises its tail; scuttles | P3 |
| sun-spiders-vinegaroons | Sun spiders and vinegaroons | row: spider† — fast tan (sun spider); whip-tailed (vinegaroon) | texas, desert-sw, great-basin | O | 3-8 cm | night | sun spiders sprint | P3 |

### 14.7 Caterpillars, millipedes, centipedes and worms (crawler†)

| id | Name | Build | Regions | C | Size | Seasons / states | Animation & behaviour | P |
|---|---|---|---|---|---|---|---|---|
| woolly-bear | Woolly bear caterpillar | new: crawler† — fuzzy black at both ends, rusty-orange middle band | all | C | 5 cm | crosses roads in Oct | ripples along; curls up when touched | P3 |
| monarch-caterpillar | Monarch caterpillar | row: crawler† — banded yellow, black and white | all | C | 4-5 cm | Jun-Sep on milkweed | munches; hangs in a J | P3 |
| stinging-caterpillars | Buck moth, puss ("asp") and io caterpillars | row: crawler† — black spiky (buck moth); furry tan teardrop (puss) | gulf, southeast, east | O | 3-6 cm | buck moths swarm in New Orleans live oaks in spring | — | P3 |
| tent-caterpillars | Spongy moth, western tent caterpillars and fall webworms | row: crawler† — hairy, blue and red dots (spongy moth) | new-england, upstate-ny, midwest, ozarks, pnw | C | 3-6 cm | silk tents in branch tips | swarm in tents | P3 |
| millipedes | Yellow-spotted millipedes (Apheloria, Harpaphe) | row: crawler† — glossy black with bright yellow side spots | appalachia, pnw | C | 5 cm | forest floor after rain | rippling legs | P3 |
| centipedes | Giant redheaded and giant desert centipedes | row: crawler† — orange-red or yellow with a black head | texas, desert-sw | O | 15-20 cm | night | fast | P3 |
| hellgrammites | Hellgrammites | row: crawler† — under stream rocks | appalachia, ozarks | C | 5-8 cm | — | — | P3 |
| earthworms | Earthworms and jumping worms | row: crawler† — pink-gray | all | C | 5-20 cm | stranded on sidewalks after rain | jumping worms thrash like snakes | P3 |

### 14.8 Slugs and snails (slug†)

| id | Name | Build | Regions | C | Size | Seasons / states | Animation & behaviour | P |
|---|---|---|---|---|---|---|---|---|
| banana-slug | Pacific banana slug | new: slug† — bright yellow to olive with black spots, two pairs of tentacles | pnw, california | C | 15-25 cm | wet season | glides with a slime trail; tentacles extend and retract | P1 |
| garden-slugs-snails | Leopard and European black slugs, brown garden snail, Pacific sideband snail | row: slug† — spotted; black; shelled | pnw, california | C | 3-20 cm | after rain | glide on walks and gardens | P3 |
| apple-snails | Florida and island apple snails (and their pink egg masses) | row: slug† — big round brown shell | florida, gulf, southeast | C | 5-10 cm | bright pink egg clutches on pilings, reeds and cypress knees | crawls on stems | P3 |
| tree-snails | Liguus tree snails | row: slug† — conical candy-striped shell | florida | R | 5 cm | — | on hammock trunks | P3 |

### 14.9 Crabs, crayfish and shrimp (crab†)

| id | Name | Build | Regions | C | Size | Seasons / states | Animation & behaviour | P |
|---|---|---|---|---|---|---|---|---|
| fiddler-crab | Atlantic marsh fiddler crab (and sand, mud and red-jointed fiddlers) | new: crab† — males with one oversized white-yellow claw | new-england, mid-atlantic, southeast, florida, gulf, texas | C | 2-3 cm | low tide on mud by the thousand | males wave the big claw; the whole flat scuttles to burrows at once | P1 |
| california-fiddler-crab | California fiddler crab | row: crab† — small | california | O | 2 cm | low tide in southern lagoons | waves | P3 |
| blue-crab | Atlantic blue crab | row: crab† — olive carapace with side points, bright blue claws (red tips on females) | mid-atlantic, southeast, florida, gulf, texas | C | 15-20 cm wide | summer | swims sideways with paddle legs; claws raised | P2 |
| ghost-crab | Atlantic ghost crab | row: crab† — sand-colored, square body, periscope eyes | mid-atlantic, southeast, florida, gulf, texas | C | 5 cm | dusk and night | darts across dry sand to burrow holes | P2 |
| sand-crabs | Mole crabs and sand crabs (Emerita) | row: crab† — egg-shaped gray | mid-atlantic, southeast, california | C | 2-3 cm | swash zone | burrow as each wave retreats | P3 |
| hermit-crabs | Hermit crabs | row: crab† — in a borrowed shell | southeast, florida, texas, california, pnw | C | 2-5 cm | — | tumbles in tide pools | P3 |
| shore-crabs | European green, Asian shore, striped shore, purple shore and marsh crabs | row: crab† — mottled green; small square with banded legs | new-england, mid-atlantic, california, pnw, gulf | C | 3-7 cm | under rocks | scuttle | P3 |
| mangrove-land-crabs | Mangrove tree crab and blue land crab | row: crab† — blue-gray (land crab) | florida | C | 3-10 cm | land crabs cross roads on rainy nights | climb mangroves | P3 |
| dungeness-rock-crab | Dungeness and red rock crabs | row: crab† — purple-tan, white-tipped claws | pnw | C | 15-20 cm wide | dock crabbing | — | P3 |
| lobsters | American and spiny lobsters | row: crab† — long tail; mottled greenish-brown | new-england, florida | C | 25-50 cm | at docks; traps and colored buoys everywhere | backs away with tail flips | P3 |
| crawfish | Red swamp crawfish and crayfish (incl. rusty, and red and blue Ozark forms) | row: crab† — long tail; dark red with bumpy claws | gulf, texas, southeast, ozarks, appalachia, midwest, upstate-ny, plains | C | 8-12 cm | crawfish season Mar-Jun; mud chimneys in yards | backs off with claws raised; visible on clear gravel | P1 |
| horseshoe-crab | Atlantic horseshoe crab | row: crab† — smooth brown helmet carapace, spiked tail | mid-atlantic, new-england, southeast, florida | C | 30-60 cm | spawns at high tide May-Jun (thousands on Delaware Bay); molts all summer | plods along the tide line; some lie flipped over | P2 |
| shrimp | Brown and white shrimp (and shrimp boats' flocks) | row: crab† — long tail, small | gulf, southeast, texas | C | 10-20 cm | — | flick backward; boats trail gulls and pelicans | P3 |

## 15. Seen from shore, docks and banks

Most of these are seen as a back, a fin, a spout or a splash. A model needs the silhouette at the
surface and the move that breaks it; the body under the water can be simple.

### 15.1 Marine mammals (swimmer†, pinniped†)

| id | Name | Build | Regions | C | Size | Seasons / states | Animation & behaviour | P |
|---|---|---|---|---|---|---|---|---|
| manatee | West Indian manatee | new: swimmer† — gray-brown wrinkled potato shape, round paddle tail, flippers, whiskered square snout; propeller scars, algae | florida, southeast, gulf | C | 3-4 m, 400-600 kg | crowds warm springs and outfalls Nov-Mar; summer in canals and creeks | drifts; slow rolls; snout breaks the surface to breathe | P1 |
| bottlenose-dolphin | Bottlenose dolphin | row: swimmer† — gray, curved dorsal fin, short beak | mid-atlantic, southeast, florida, gulf, texas, california | C | 2.5-3 m | Sum off northern beaches; Res south | pods of 5-20 roll past beyond the breakers; leap; strand-feed on mudbanks | P2 |
| common-dolphin | Common dolphin | row: swimmer† — hourglass flank pattern | california | C | 2-2.5 m | Res | big fast pods in the surf line | P3 |
| porpoises | Harbor and Dall's porpoises | row: swimmer† — small dark, small triangular fin; black and white (Dall's) | new-england, pnw | C | 1.5-2.2 m | Res | roll quietly (harbor); rooster-tail splash (Dall's) | P3 |
| orca | Orca (killer whale) | row: swimmer† — glossy black, white chin, belly and eye patch, gray saddle, tall dorsal fin | pnw, california | O | 6-9 m; fin to 1.8 m | Res and transient pods | pods surface in rhythm; spyhop; breach | P2 |
| humpback-whale | Humpback whale | row: swimmer† — dark, long white flippers, knobby head | new-england, mid-atlantic, california, pnw | O | 12-16 m | Nov-Apr off NJ and NY; spring-fall in the West | blows; breaches; raises its fluke to dive; lunge-feeds with gulls and pelicans | P2 |
| gray-whale | Gray whale | row: swimmer† — mottled gray with barnacle patches, no fin, knuckles along the back | california, pnw | C | 12-14 m | migration close to headlands Dec-May | heart-shaped blows; flukes up | P2 |
| other-whales | Fin, minke, blue and North Atlantic right whales | row: swimmer† — long and dark; no fin and V-shaped blow (right) | new-england, california, southeast | R | 8-30 m | by species | spouts offshore | P3 |
| harbor-seal | Harbor seal | new: pinniped† — spotted gray-silver to brown, round dog-like head | new-england, mid-atlantic, california, pnw | C | 1.5 m | Res; Win south of New England; pups in spring-summer | hauls out on ledges in a "banana" pose; head bobs in harbors | P2 |
| gray-seal | Gray seal | row: pinniped† — long "Roman nose" head, mottled gray | new-england, mid-atlantic | C | 2-2.5 m | herds of hundreds to thousands on Cape Cod bars | packed haul-outs | P3 |
| sea-lions | California and Steller sea lions | row: pinniped† — dark brown males with forehead bump; ear flaps; Steller's golden-tan, maned | california, pnw | C | 2-3 m | Res | bark and pile on docks and buoys; walk on their flippers | P2 |
| elephant-fur-seals | Northern elephant seal and northern fur seal | row: pinniped† — huge males with a drooping trunk nose | california, pnw | O | 3-5 m | breeding Dec-Mar; molting spring-summer | lie in heaps on rookery beaches; flip sand | P3 |

### 15.2 Fish (fish†)

| id | Name | Build | Regions | C | Size | Seasons / states | Animation & behaviour | P |
|---|---|---|---|---|---|---|---|---|
| pacific-salmon | Pacific salmon (Chinook, coho, sockeye, pink, chum) | new: fish† — red sides and green back, hooked jaw (coho); purple-green calico bars (chum) | pnw, california | C | 0.5-1 m | fall runs in urban creeks Sep-Dec | hold in current; leap at falls and fish ladders; spawn in gravel; dead fish on banks feed eagles | P2 |
| kokanee | Kokanee salmon | row: fish† — red body, green head, hooked jaw | rockies | C | 30-40 cm | spawning Oct | red schools in tributaries | P3 |
| trout | Cutthroat, rainbow and brown trout | row: fish† — speckled | rockies, ozarks, pnw, great-basin | C | 25-50 cm | — | rise to hatches | P3 |
| mullet | Mullet | row: fish† — gray, silver | florida, gulf, texas, southeast | C | 30-50 cm | — | leap again and again from glassy canals | P2 |
| southern-gamefish | Atlantic tarpon, snook, barracuda, sheepshead, redfish (red drum), speckled trout | row: fish† — big silver with an upturned mouth (tarpon); copper back with a black tail spot (redfish) | florida, gulf, texas | C | 0.3-2 m | — | tarpon roll near docks gulping air; redfish tail in shallow marsh | P3 |
| menhaden | Menhaden (bunker, pogies) | row: fish† — small silvery | mid-atlantic, gulf | C | 20-30 cm | — | rippling brown schools chased by ospreys, dolphins and whales | P3 |
| asian-carp | Asian (silver) carp | row: fish† — 60-90 cm silver | midwest | C | 60-90 cm | summer | leap out of the water at boat noise | P3 |
| great-lakes-fish | Round goby, alewife and sea lamprey | row: fish† — small; eel-like (lamprey) | midwest | O | 10-60 cm | alewife die-offs on beaches in summer | — | P3 |
| clear-river-fish | Longear sunfish, smallmouth bass, paddlefish, Ozark cavefish | row: fish† — vivid orange and turquoise (longear); white eyeless (cavefish) | ozarks | C | 10-150 cm | longear males guard gravel nests | hover over nests in clear water | P3 |
| gulf-sturgeon | Gulf sturgeon | row: fish† — armored, prehistoric | gulf | R | 1.5-2 m | summer | jumps clear of the river | P3 |
| socal-fish | Garibaldi, California sheephead, kelp bass, California grunion | row: fish† — brilliant orange (garibaldi); slim silver (grunion) | california | C | 15-90 cm | grunion spawn on beaches on spring and summer high-tide nights | grunion flip on wet sand | P3 |
| sharks | White, nurse, lemon, bonnethead, blacktip, bull and leopard sharks | row: fish† — dorsal fin; brown with barbels (nurse); silver-gray with dark saddles (leopard) | new-england, florida, gulf, texas, california | O | 1-5 m | blacktip migration off Palm Beach Jan-Mar; leopard sharks at La Jolla in summer | a fin cuts the surf line; nurse sharks laze at marinas | P3 |
| rays | Cownose, southern and Atlantic stingrays, spotted eagle, bat and round rays, smalltooth sawfish | row: fish† — flat, wing fins; black with white polka dots (eagle ray); toothed saw (sawfish) | mid-atlantic, florida, gulf, texas, california | C | 0.3-5 m | summer schools | flap wingtips at the surface; eagle rays leap | P3 |

### 15.3 Jellies (jelly†)

| id | Name | Build | Regions | C | Size | Seasons / states | Animation & behaviour | P |
|---|---|---|---|---|---|---|---|---|
| moon-jelly | Moon jelly | new: jelly† — clear disc with four rings | new-england, mid-atlantic, florida, gulf, texas, pnw | C | 10-40 cm | summer | pulses; washes up on beaches | P3 |
| other-jellies | Lion's mane, sea nettles (Atlantic and Pacific), cannonball ("cabbagehead"), comb, purple-striped and fried-egg jellies | row: jelly† — reddish with a mass of tentacles (lion's mane); firm white-blue dome with a brown rim (cannonball) | new-england, mid-atlantic, southeast, florida, gulf, texas, california, pnw | C | 5-50 cm | summer; cannonballs wash up by the thousand | pulse; comb jellies glitter with rainbow lights | P3 |
| floating-hydrozoans | Portuguese man o' war and by-the-wind sailor (Velella) | row: jelly† — blue-violet gas float with trailing tentacles; 5 cm blue float with a clear sail | southeast, florida, gulf, texas, california, pnw | O | 5-30 cm | washed up after onshore winds | bob and sail; strand by the million | P3 |

### 15.4 Tide pools and beach shells (tidepool†, shell†)

| id | Name | Build | Regions | C | Size | Seasons / states | Animation & behaviour | P |
|---|---|---|---|---|---|---|---|---|
| ochre-sea-star | Ochre sea star (and Atlantic sea stars, sunflower sea star) | new: tidepool† — purple or orange five-armed star | california, pnw, new-england | C | 15-30 cm | recovering from wasting disease | stays put; arms creep | P3 |
| anemones | Giant green, aggregating and plumose anemones | row: tidepool† — green disc of tentacles; white fluffy on pilings (plumose) | california, pnw | C | 5-25 cm | — | tentacles sway; close at low tide | P3 |
| urchins | Purple, red and green sea urchins, sand dollars, sea pansies | row: tidepool† — spiny ball; flat disc (sand dollar) | california, pnw, new-england, southeast, texas | C | 5-15 cm | — | spines stir | P3 |
| soft-tidepool | Chitons (incl. gumboot), sea hares, nudibranchs, giant Pacific octopus | row: tidepool† — plated oval; purple ink (sea hare) | california, pnw | O | 3-50 cm | — | creep; the octopus flows into a crack | P3 |
| oyster-beds | Eastern oyster beds | new: shell† — gray-white jagged mounds exposed at low tide | southeast, gulf, mid-atlantic, texas | C | mounds 0.3-1 m | low tide | static | P2 |
| mussels-barnacles | Blue, California, ribbed and zebra/quagga mussels; barnacles (incl. gooseneck) | row: shell† — black-blue beds; white crusts; drifts of striped shells on Great Lakes beaches | new-england, mid-atlantic, california, pnw, midwest, upstate-ny | C | 2-10 cm | — | barnacles feather in water | P3 |
| clams | Hard, surf, razor, coquina clams and geoducks | row: shell† — coquinas tiny and rainbow-coloured | mid-atlantic, southeast, pnw, texas | C | 1-20 cm | geoduck siphons squirt on Puget beaches at low tide | coquinas dig in after each wave | P3 |
| snails-marine | Periwinkles (common, marsh), dog whelk, mud snails, black turban, owl limpet | row: shell† — small dark cones | new-england, southeast, california | C | 1-5 cm | marsh periwinkles climb cordgrass ahead of the tide | creep up stems | P3 |
| beach-shells | Knobbed and lightning whelks, queen conch, shark teeth, whelk egg strings, skate egg cases ("mermaid's purses") | row: shell† — whelks; papery coin-chain egg strings; black horned cases | mid-atlantic, southeast, florida, texas | C | 2-30 cm | beachcombing | static | P3 |

## 16. Signs and homes

What animals leave behind is often all a walker sees: the lodge, not the beaver. Each sign belongs
next to its animal's placement.

| id | Name | Build | Regions | C | Size | Seasons / states | Animation & behaviour | P |
|---|---|---|---|---|---|---|---|---|
| beaver-lodge | Beaver lodge, dam and chewed stumps | new: sign† — stick dome in a pond, stick-and-mud dam, pencil-point stumps; drowned gray snags behind | all | C | lodge 2-3 m high; dam to 100 m | fresh peeled sticks in fall | water spills over the dam | P1 |
| crawfish-chimney | Crawfish chimneys (and rice-crawfish ponds with trap floats) | row: sign† — 5-15 cm towers of mud pellets in lawns and ditches | gulf, texas, southeast, plains, ozarks | C | 5-15 cm | spring after rain | static | P1 |
| osprey-nest | Osprey and eagle nests | row: sign† — huge stick nests on platforms, poles, channel markers and tall pines | all | C | 1-2 m across | used Mar-Sep (osprey) | a chick's head pops up | P1 |
| heron-colony | Heron and egret colonies | row: sign† — stick nests crowded in trees and on marsh islands | all | C | nests 0.5-1 m | spring-summer | adults come and go | P3 |
| fire-ant-mound | Fire ant mounds | row: sign† — sand-colored domes, especially after rain | south, ozarks, appalachia | C | 20-40 cm | — | ants swarm when stepped on | P2 |
| ground-mounds | Prairie dog mounds, pocket gopher mounds, harvester ant clearings, badger and armadillo diggings, hog rootings | row: sign† — bare cones and craters; cleared gravel circles | plains, west, texas, south | C | 0.2-1 m | — | static | P2 |
| burrows | Gopher tortoise burrow aprons and woodchuck burrows | row: sign† — white sand fan at a hole; banked earth | east | C | 0.3-1 m | — | static | P3 |
| squirrel-dreys | Squirrel dreys and cone middens | row: sign† — leaf balls in bare crowns; heaps of cone scales on stumps | all | C | 0.3-1 m | dreys show in winter | static | P3 |
| packrat-middens | Packrat middens and muskrat cattail houses | row: sign† — heaps of sticks and cactus joints in alcoves; cattail domes in marsh | all | C | 0.5-1.5 m | — | static | P3 |
| hanging-nests | Hanging and mud nests: orioles' woven bags, cactus wren footballs in cholla, cliff swallow mud jars under bridges, monk parakeet stick piles | row: sign† | all | C | 0.1-1 m | — | oriole nests swing | P3 |
| wasp-nests | Paper wasp and bald-faced hornet nests | row: sign† — gray paper; football-sized hanging nests | all | C | 0.1-0.5 m | summer-fall | wasps come and go | P3 |
| webs-tents | Orb webs, Joro tiered golden webs, tent caterpillar and fall webworm tents | row: sign† — silk cards | all | C | 0.3-2 m | Aug-Nov webs; tents spring and late summer | webs sway and catch light | P2 |
| tree-holes | Woodpecker holes: saguaro boots, pileated rectangles, acorn granary trees, red-cockaded resin candles, sapsucker wells | row: sign† — decals and cut-outs on trunks | all | C | 3-30 cm | — | static | P2 |
| shells-and-cases | Cicada shells, mantis egg cases, apple snail pink egg clutches, horseshoe crab molts | row: sign† — on bark, stems, pilings, the tide line | all | C | 1-30 cm | by season | static | P3 |
| browse-and-rubs | Browse lines on shrubs, antler rubs, elk-chewed aspen bark | row: sign† — stripped bark and a clean browse line | east, west | C | to 2 m | — | static | P3 |
| sea-turtle-nests | Sea turtle tracks and staked nests | row: sign† — tractor-mark tracks; stakes and tape | southeast, florida, gulf, mid-atlantic, texas | C | tracks 1 m wide | May-Oct | static | P3 |

## 17. Not modelled

Named in the sources but not built as models: felt, heard or handled elsewhere.

- **Too small to see:** ticks (deer/black-legged, lone star, American dog, Asian longhorned, Rocky
  Mountain wood, western black-legged), chiggers and seed ticks. They belong in hints and the sound
  of a summer field, not in the foundry.
- **Pests seen only as damage:** hemlock woolly adelgid (white wool dots; the gray hemlocks are the
  `snag` state), crape myrtle bark scale (sooty trunks: a bark tint on `crape-myrtle`), sudden oak
  death, polyphagous shot hole borer, goldspotted oak borer, Asian citrus psyllid, glassy-winged
  sharpshooter, Mediterranean fruit fly. Northern giant hornet: eradicated, so absent.
- **Under water or out of reach:** coral reef life (Keys snorkelling), hydrilla (submerged).
- **Ground colour, not life:** orange-red Piedmont clay, white quartz sand, black Corn Belt soil,
  caliche and limestone, red sandstone and pink sand, gypsum dunes, desert pavement, salt flats and
  the Great Salt Lake's pink north arm. These are ground paint and terrain, already outside this
  list.
- **Already handled:** people and dogs on leads (the life sim), and lobster buoys, crab traps and pot
  floats (`micro.ts`).

## Build order

The P1 rows as foundry work packages, in order. Each package is one genome, or a batch of rows on
one genome, and lands with validation, vertex budgets in `tests/foundry.test.ts`, a workbench row in
`/kit.html` and a reviewed montage (AGENTS.md rule 1). The first is built.

1. **The Pacific Northwest westside** — **built** 2026-10-04 (commit 94ce999; `docs/earth/LOG.md`
   "Regional life (2)"): the conifers as `flora.ts SPIRES` (not a separate genome: a tree kind each,
   drooping sprays on spiralling tiers), the hangers as `TreePlan.hang`, moss on bark as the region's
   `moss` term, the understory in `world/understory.ts`. Still open from it: **moss on boulders** and
   **moss carpets** in the ground paint (the ground under a wood still has the lawn wash). The `conifer†` genome with **Douglas fir**,
   then **western redcedar**, **western hemlock** and **Sitka spruce** as its rows. The bigleaf
   maple (`have`, maple v2) dressed by the new `hanger†` genome: **hanging moss** curtains and
   **licorice fern** along the limbs. **Vine maple** (mesquite multi-stem in maple leaves), **red
   alder** (birch with white-blotched bark). The understory: **sword fern** (fern), **salal** and
   **Oregon grape** (mound). The `surface†` term: **moss on bark** and **moss on boulders**, and
   **moss carpets** in ground paint.
2. **Live oaks and their hangers** — **built** 2026-10-05 (`docs/earth/LOG.md` "Regional life (3)"):
   the live oaks as `flora.ts OAKS` (a tree kind each, three grown forms: the southern live oak's
   grand open-grown umbrella with limbs resting on the ground, its street oak arching over, an old
   gnarled one; the plateau oak's single trunk, mott of three and pair; the coast live oak's round
   dome, two leaning trunks and an old one), the hangers as their own layer, `assets/hangers.ts`
   (grown on each tree's boughs and crown, instanced with the trees that carry them, the region's
   range rules in `hangerMix`), the strands' pendulum swing in `propMaterial` `hang`. The `liveoak†`
   genome with **southern live oak**, then **plateau** and **coast live oak**. On `hanger†`: **Spanish
   moss**, **resurrection fern**, **ball moss** and **lace lichen**.
3. **Northern and mountain forests on the existing genomes** — **built** 2026-10-05 (`docs/earth/LOG.md`
   "Regional life (3)"): the pines as `flora.ts PINES` (tiers of boughs ending in needle tufts), the
   spruces, firs and eastern hemlock as `SPIRES` rows, the aspen (a white stem with dark eyes, its
   leaves trembling: `propMaterial` flutter), the willow thickets (coloured stems), the `snag` (three
   dead forms), placed by `coniferMix` (the West by elevation band), `aspenShare` (clonal groves),
   `willowThickets` and `snagShare`. Pine rows: **eastern white pine**,
   **ponderosa**, **lodgepole**. Spruce rows: **red spruce**, **balsam fir**, **Engelmann spruce**,
   **subalpine fir**. `conifer†` row: **eastern hemlock**. Birch rows: **quaking aspen** (with its
   flutter), the shrub row **willow thickets**, and the dead **snag** state for beaver ponds,
   beetle-kill and adelgid ghosts.
4. **Eastern hardwoods and the flowering understory** — **built** 2026-10-05 (`docs/earth/LOG.md`
   "Regional life (4)"): the hardwoods on a leader as `flora.ts LEADERS` (tulip tree, sweetgum,
   shagbark hickory with its curling strips, yellow buckeye), the sycamore (white climbing limbs,
   flaking mottle) and the bur oak as `OAKS` rows, the dogwood's tiers, the redbud, crape myrtle (and
   its pollarded knuckles) and rosebay as `CLUMPS`, the southern pines as `PINES` rows (the longleaf's
   grass stage, bottlebrush and old flat top), the redcedar's spindle; their leaf pictures (stars,
   tulips, five leaflets, five fingers, hearts, long needles); blossom as a type and the new fall hues
   (`render/treeSeasons.ts`); the garden's rhododendron and azalea; placed by `broadMix` with `rangeIn`,
   `coniferMix`, `bankMix`, `redcedarShare`, `rosebayShare`, `understoryTrees`. The rows: Round rows:
   **tulip tree**, **sweetgum**,
   **shagbark hickory**, **yellow buckeye**. Oak rows: **American sycamore**, **bur oak**. Cherry
   rows: **flowering dogwood**, **eastern redbud**. Mesquite row: **crape myrtle**. Shrub rows:
   **rhododendron**, **rosebay rhododendron**; mound row: **azalea**. Southern pines: **loblolly**,
   **longleaf**, **slash**. Poplar row: **eastern red cedar**.
5. **Swamps and rivers** — **built** 2026-10-05 but for duckweed (`docs/earth/LOG.md` "Regional life
   (5)"): the cypresses as `flora.ts CYPRESSES` (a fluted, flaring foot as a shell round the trunk, knees
   round it, tiers of level boughs with flat feathery sprays; bald cypress young, grown in the swamp,
   ancient; pond cypress tall, the dome's hat, the marl prairie's dwarf), the water tupelo on the leader
   plan with its swollen bottle foot, the cottonwoods as `OAKS` rows with leaves that rattle; placed by
   `swampMix`, `swampForm` and `bankMix`. Still open: **duckweed** (a water-surface paint, not a tree).
   The rows: the `cypress†` genome with **bald cypress**, **cypress knees** and **water
   tupelo**; **duckweed** on the water. Oak rows: **eastern/plains cottonwood** and **Fremont
   cottonwood**.
6. **California's oaks and redwoods** — **built** 2026-10-05 (`docs/earth/LOG.md` "Regional life
   (6)"): the valley oak (its vast spread, outer branches hanging to the grass; a valley town's; an
   old one with a limb dead) and the blue oak (small, compact, pale-barked; one trunk, two, old and
   gnarled) as `OAKS` rows; the coast redwood (a young spire to the ground; the grove's bare column
   with its narrow crown high up; the old-growth giant with burls, a fluted flaring foot and its
   reiterated tops) and the giant sequoia (the town's young cone; the vast orange column with its
   rounded top; the fire-scarred ancient, top broken) as `SPIRES` rows with the new `foot`, `burls`,
   `scar` and the `round` and `reit` tops; the manzanita as a `CLUMPS` row (red twisting stems, an old
   one's dead and silver among them) with blossom 6, its urns in the winter (`season.ts winter`); the
   golden hills as the season's `hay` (the grass and the ground's straw wash gold June to November,
   green with the rains); placed by `broadMix` with `rangeIn`, `redwoodCountry` (the Coast Range and
   `ecoregions.ts caRedwoodBelt`), `sequoiaBand` (in groves), `manzanitaShare`, `westForm`. The rows:
   Oak rows: **valley oak**, **blue oak**. `conifer†` rows: **coast redwood**, **giant sequoia**.
   Clump row: **manzanita**. Grass: the **California annual grassland** (the golden hills, a season
   of the grass rather than a model).
7. **The desert** — **built** 2026-10-05 (`docs/earth/LOG.md` "Regional life (7)"): the saguaro
   (`columnar†`: a pleated column, `flora.ts fluted`, its arms leaving level and rising; a young spear,
   grown, old with a bowed arm, woodpecker holes and boots), the Engelmann prickly pear (`opuntia†`:
   flat pads each on the rim of the last; a clump, an old sprawl, a tree form on a trunk) and the
   teddy bear cholla (golden joints over a black dead trunk, fallen joints round it), the ocotillo
   (`cane†`: a vase of grey canes, sleeved in leaves after rain), the Joshua tree (`yucca†`: corky
   trunk, shaggy arms, spiky rosettes; one stem, branched, old) — far models only (`DESERT_FAR`),
   their flowers and fruit parts of their own (`BLOOM_PART`, blossom 7–10 by the calendar); the
   creosote (its old clonal ring), the Utah and Ashe junipers and the big sagebrush as `CLUMPS` rows,
   the two-needle piñon as a `PINES` row; placed by `desertMix`, `desertTrees` and `pjBand` (the
   piñon-juniper's band, below the ponderosa). The rows: `columnar†`: **saguaro**. `opuntia†`:
   **Engelmann prickly pear**, **teddy bear cholla**. `cane†`: **ocotillo**. `yucca†`: **Joshua
   tree**. Shrub row: **creosote**. Pine row: **two-needle piñon**. Clump rows (the models' mesquite
   row in the plan): **Utah juniper**, **Ashe juniper**. Clump row (the mound row): **big
   sagebrush**. (Mesquite and palo verde exist.)
8. **Palms** — **built** 2026-10-05 (`docs/earth/LOG.md` "Regional life (8)"): the cabbage palmetto
   (a round head of pleated, V-folded fans, `flora.ts fanFrond`, on a trunk booted high up; young
   from the ground, grown, old and tall), the saw palmetto (stiff fans on creeping stems; one crown, a
   clump, an old colony), and the feather palms (`featherFrond`): the royal palm (swollen grey column,
   green crownshaft), the queen palm (slim, drooping plumes, an old one's dates), the Canary Island
   date palm (massive trunk, its "pineapple", a huge crown); every frond kept above the ground
   (`keepUp`); MOTION 4, the fronds thrown about in a gust and leaning downwind (the coconut and fan
   palms too); placed by `broadMix` + `rangeIn`, `palmMix` (South Florida's tropics, the dry coasts'
   and warm deserts' planted palms only where January's mean is above 3.5 °C) and `palmettoShare`. The
   rows: Fanpalm rows: **cabbage palmetto**, **saw palmetto**. Palm rows: **Florida royal palm**,
   **queen palm**, **Canary Island date palm**.
9. **The ground layers** — **built** 2026-10-05 but for smooth cordgrass (`docs/earth/LOG.md`
   "Regional life (9)"): bracken (the new `frond` form: a stalk lifting a three-parted blade near level;
   copper in October, gone from December to April) and the cinnamon fern (a vase, its cinnamon spikes in
   May, gold in the fall) on the eastern and northern woods' floor (`understoryMix`; `Species.fall`,
   `dormant`); the prairie's big and little bluestem as the grass field's tall tufts (`prairieMix`:
   blue-green, then copper-red and orange as the autumn turns, bronze-tan in winter); wildflower drifts
   in the open grass (`wildflowerMix`, `treeSeasons.ts WILDFLOWERS` on the calendar's `uYear`: Texas's
   bluebonnets and paintbrush, California's poppies, lupine and goldfields, the desert's marigolds, the
   East's and Midwest's black-eyed Susans, coneflowers, goldenrod and asters, the mountains' and the
   Northwest's fireweed); kudzu as a tree kind (`vine†`: its curtain over the tree it killed, brown in
   winter) on the South's wood edges (`kudzuShare`). Still open: **smooth cordgrass** (the salt marsh:
   the grass keeps off the shore today). The rows: Fern rows: **bracken**, **cinnamon fern**. Clump
   rows: **big** and **little bluestem**, **smooth cordgrass**. Wildflower drifts: **Texas bluebonnet**
   (spike), **California poppy** (stem, cup head), **sky lupine** (spike). The `vine†` genome with
   **kudzu**.
10. **Fields** — **built** 2026-10-05 (`docs/earth/LOG.md` "Regional life (10)"): the farmland
   (WorldCover cropland) planted field by field (`world/fields.ts`: a 400 m block of the survey's grid,
   its crop by the region's `cropMix`, its rows north–south or east–west), each crop on its calendar
   (`CROP_CAL`, `cropStage` on the year): **corn** (`cane†` as a row's 2 m segment: walls of leaves,
   tassels; up in May, head-high by July, tan in October, stubble), **soybeans** (a low hedge; yellow in
   late September), **winter wheat** (the grass's tuft; green under the winter, gold in June, stubble),
   and spring wheat on the northern Plains; grown near the walker by the grass field (`grass.ts`
   crops, `cropMaterial`), and the fields' colour far off in the ground's wash (`groundPaint.ts`
   `cropWash`).
11. **Bird plan extensions and the backyard birds** — **built** 2026-10-05; the long neck, swim, bare
    head and hover came with package 12's birds that need them (`docs/earth/LOG.md`
    "Regional life (11)"). The bird plan (`fauna.ts birdGeometry`) gained the marks a bird is known by
    at twenty metres: a hood, a crown cap, a face mask, a necklace, a neck patch, a full breast, wing
    bars and barred wings, a crest swept back or curling forward, the bills (a seed-eater's thick cone,
    a crow's stout dagger, a woodpecker's chisel, a dove's slim), a fanned tail or a dove's long wedge
    with its tip's colour; and for every bird a neck, the wings closed along the flank when perched
    (the critter material), a leg each side so the walkers walk and the hoppers hop, a peck downward,
    each species' own wingbeat (`FLAP`). Songbird palette rows: **northern cardinal** (the female's
    tan a TINT), **blue jay**, **American robin**, **Steller's jay**, **Gila woodpecker** (the male's
    red cap a TINT), **mourning dove**. Bird rows: **American crow**, **rock pigeon** (each its own
    grey; the town's: weighted by how built-up, on the plaza as well as the grass). Placed by the
    songbird role's regional mix (`REGION_FAUNA`, `faunaMix`).
12. **Water and big birds** — **built** 2026-10-05 (`docs/earth/LOG.md` "Regional life (12)"). The
    bird plan's long neck (two tapering pieces with an S, bending at the base to graze or strike), the
    bills (a duck's flat, a heron's dagger, the spoon, the pelican's pouch, an eagle's hook), a cheek
    band, a wattle, black wingtips, a broad wing's silver trailing half, a bird with no legs; the
    critter material's flight modes (`FLIGHT`: soaring, gliding, flapping; each soarer's dihedral) and a
    display pose (a turkey tom's fan stood up). New roles in the sim (`sim/critters.ts`): `waterfowl`
    (swimming at the water's own level, `swimSink`; geese grazing the lawns by it; a loon diving),
    `wader` (at the water's edge, frozen between slow steps, flying off heavy), `gull` (the beach and the
    coastal lots, wheeling and coming down again; pelicans skimming in lines or rafted), `fowl` (turkey
    and crane flocks, running before they fly); raptors by species (the vultures' kettle, the eagle by
    big water, the osprey's hover and plunge). Each in its season (`faunaMix`'s month, `SEASON`). The
    rows: **Canada goose**, **mallard** (drake and hen), **common loon**; ibis rows **great blue
    heron**, **great egret**, **snowy egret**, **roseate spoonbill**, **sandhill crane**; hawk rows
    **turkey vulture**, **bald eagle**, **osprey** (with its **nest**, `sign†`: `assets/signs.ts`, on a
    platform pole at the water's edge, props.ts); quail rows **wild turkey** and **California quail**;
    **brown pelican**; gull rows **laughing gull** and **California gull**.
13. **Mammals on the existing bases** — **built** 2026-10-06 but for the beaver's dam (`docs/earth/LOG.md`
    "Regional life (13)"). The quad parameters (`fauna.ts Quad`): stripes laid on the back's own curve
    (`backStripe`), a mask, a forehead blaze, the tail types (ringed, naked, plume, paddle, stub), girth
    and leg length, a deer's mane, lower legs, rump, long muzzle, hump and bell; the `antlers†` and
    `horns†` add-ons on their own part (`ANTLER`, 9), worn by the bulls, bucks and rams in their months
    (the sim's `RACK`; the white-tailed and mule deer's racks too). Fox rows: **raccoon**, **Virginia
    opossum**, **striped skunk**. Squirrel rows: **fox squirrel**, **eastern chipmunk**, **woodchuck**,
    **American beaver** (with the `sign†` genome's **beaver lodge** in a pond; the dam is still open).
    **Black-tailed prairie dog** (on the squirrel plan), in towns (`signs.ts prairieTown`, the mounds).
    Deer rows: **elk**, **moose**, **pronghorn**, **bighorn sheep**. The sim's new `forager` and `herd`
    roles: the raccoon up a tree, the opossum playing dead, the skunk's warning, the prairie dog's
    sentries and jump-yip, the beaver's tail slap and dive, the elk bull's bugle, herds that run
    together.
14. **New mammal plans** — **built** 2026-10-06 (`docs/earth/LOG.md` "Regional life (14)"). `bear†`:
    **black bear** (`bearGeometry`: coat colour by region, standing up to look, a sow's cubs that climb).
    `bovid†`: **American bison** (`bisonGeometry`: woolly forequarters, hump, horns, wallows). `armadillo†`:
    **nine-banded armadillo** (`armadilloGeometry`: shields and nine bands, the startled jump).
    `swimmer†`: **West Indian manatee** (`manateeGeometry`: back and snout at the surface).
15. **Reptiles** — **built** 2026-10-06 (`docs/earth/LOG.md` "Regional life (15)"). `sprawler†`
    (`sprawlerGeometry`): **American alligator** (on the bank or floating, the belly slide in), then
    **green anole** and **brown anole** (up the trunks, the throat fan). `turtle†` (`turtleGeometry`):
    **painted turtle**, then **red-eared** and **yellow-bellied sliders** basking on a log (`signs.ts`
    `baskingLogs`), sliding off when you come.
16. **Small life** — **built** 2026-10-06 (`docs/earth/LOG.md` "Regional life (16)"). Butterfly row:
    **monarch** (`monarchGeometry`: the flap and glide, the fall streams south, California's winter
    roosts). `dragonfly†` (`dragonflyGeometry`): **common green darner** (its beat along the water's
    edge). `bug†` (`bugGeometry`): **annual cicada** (on the bark, its chorus) and its shell. `slug†`
    (`slugGeometry`): **Pacific banana slug** (tentacles drawn in when you come). `crab†`
    (`crabGeometry`): **Atlantic marsh fiddler crab** (the great claw waved, the flat down its burrows),
    then **crawfish** (claws up, backing off) with their **chimneys** (`sign†`: `signs.ts`
    `chimneyGeometry`, `crawfishChimneys`).

The P1 rows marked `have` (sugar and red maple, mesquite and palo verde, eastern gray squirrel,
eastern cottontail, white-tailed and mule deer, coyote) need no new model; they come into a package
only to be dressed or fixed, as the bigleaf maple is in package 1.

After the P1 packages, the P2 rows follow the same genomes in the same order: the rest of each
genome's rows first (they are cheap once the genome exists), then the P2 genomes (`floating†`,
`mangrove†`, `pinniped†`, `bat†`, `snake†`, `frog†`, `spider†`, `fish†`).

