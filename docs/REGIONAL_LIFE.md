# Regional life: what grows and what lives, region by region

The lower 48 should look and feel like itself wherever you walk:

- upstate New York's maples and stone walls;
- the Pacific Northwest's moss-hung firs over sword ferns;
- Kentucky's horse-country fences under bur oaks;
- Savannah's live oaks dripping Spanish moss;
- the Hill Country's live oak and cedar;
- the saguaro and the Gila woodpecker in Tucson;
- cottonwoods along a Kansas creek.

This doc is the reference and the plan for that: the plants and animals of each region, what the
asset foundry (`src/assets/`, `docs/ASSET_FOUNDRY.md`) has and lacks, and how we measure that it
looks right.

Rules it keeps (AGENTS.md):

- **Variety from the foundry.** Mixes through `plantMix` / `faunaMix`, variants through `variantAt`,
  never per-town lists. Every new family gets validation and a vertex budget in
  `tests/foundry.test.ts`.
- **Regions as data.** Keyed by ecoregion code, never by place name.
- **Deterministic.** The same tree and the same deer for every visitor.
- **Public data only.** Species ranges from state wildlife agencies, USDA PLANTS, the USFS, the NPS,
  Audubon and iNaturalist. Region boundaries from the EPA's ecoregions (public domain).
- **Real data first.** OSM's mapped trees and woods, LiDAR crowns and WorldCover come first; the
  regional cast only fills in what they leave.

## 1. Where we are (2026-10-04)

**Measured.** The real-world comparison (`tools/real-compare.mjs`, `national-1`, 83 town-centre
photos in every state): the game shows **5% vegetation where the photos show 14%**, a third. It's
worst in the South (Tennessee −52 points, Texas −32, Louisiana −31). In a few dense cores the
opposite happens: a LiDAR crown or a mapped tree in its pit sits right at the lens where the photo
has none.

**What the foundry has:**

| Family | Now |
|---|---|
| Trees (`flora.ts` `TREE_KINDS`) | 24: round, oak, shrub, pine, spruce, palm, birch, mesquite, fan palm, maple, willow, elm, poplar, magnolia, cherry, and (2026-10-04) the Northwest's Douglas fir, western redcedar, western hemlock, Sitka spruce, red alder, vine maple, and (2026-10-05) the southern live oak, the plateau live oak and the coast live oak — 3 variants each, autumn colour by kind; moss on bark by region |
| Hangers (`assets/hangers.ts`) | (2026-10-05) Spanish moss, resurrection fern, ball moss, lace lichen: grown on each tree's limbs, two loads, a tone per tree, the strands swinging as pendulums; where by `hangerMix` (ranges.md) |
| Garden plants (`SPECIES`) | 12: hydrangea, rose, hibiscus, daylily, beach grass, lavender, coneflower, sunflower, hosta, agave, fern, boxwood; and the forest floor's sword fern, salal and Oregon grape (`understoryMix`, `world/understory.ts`) |
| Animals (`fauna.ts` `CRITTERS`) | 17: squirrel, rabbit, songbird, sandpiper, deer, butterfly, firefly, fox, hawk, coyote, jackrabbit, snowshoe hare, ground squirrel, mule deer, roadrunner, quail, ibis — plus the life sim's gulls, dogs and people |

**How a place picks its cast now** (2026-10-05, `ecoregions`): `styles.ts` `regionStyle` carries the
place's region of life — one of the sixteen below, its EPA ecoregion and its state, from a grid
baked off the EPA's map (`world/ecoregions.ts`; `docs/agent/world-data.md` "Regions of life"). The
casts read it: the tree kinds' weights and the moss (`styles.ts ECO_VEG`), the broadleaf street and
yard trees (`flora.ts broadMix`), the gardens (`plantMix`), the forest floor (`understoryMix`) and the
animals (`fauna.ts faunaMix`, with the range rules). Kentucky's woods are Appalachia's and Ohio's the
Midwest's; Savannah's coastal plain has oaks, magnolias and ibis where Raleigh's Piedmont has
tulip-tree country; Austin is Texas and Phoenix the desert; fireflies flash only east of the Plains.
Outside the lower 48 the casts fall back to the climate's (a climate class from coarse boxes, the
North American subregion `naSub`). The casts are the kinds the foundry has; each package adds its own
to its regions' rows.

**Missing, the worst first (by what the photos show):**

- **The density.** Yards, verges, field edges and woodlots carry a third of what's there.
- **Trees with a region's face:**
  - live oak with Spanish moss;
  - bald cypress and its knees;
  - Douglas fir, western red cedar and hemlock (in place of the generic spruce);
  - sycamore, sweetgum, tulip poplar;
  - the flowering understory: dogwood, redbud, crape myrtle;
  - cottonwood, aspen, ponderosa pine;
  - juniper and pinyon;
  - sabal palm and palmetto;
  - the desert's saguaro, prickly pear, cholla, ocotillo, Joshua tree and creosote;
  - sagebrush.
- **The layers under the trees:**
  - sword fern and bracken;
  - moss on trunks and boulders;
  - rhododendron and mountain laurel;
  - kudzu mantles over Southern roadside woods;
  - prairie grasses and wildflowers (Texas bluebonnets in spring).
- **The animals people actually see:**
  - raccoon, opossum, skunk, armadillo, black bear, moose, elk, bison, pronghorn and prairie dog;
  - wild turkey, crows, pigeons, Canada geese, ducks, herons and egrets, pelicans, vultures, owls,
    eagles and osprey, cardinals, blue jays and robins;
  - alligators, turtles, frogs and lizards;
  - monarchs, cicadas and dragonflies;
  - fiddler crabs;
  - dolphins and manatees seen from shore.

## 2. The regions

Sixteen regions over the lower 48, from the EPA's Level III ecoregions, grouped. A region is a
key such as `pnw-westside`, carried as data: a lat/lon → ecoregion code grid baked once, then a
code → region table. No place name is hardcoded.

| Key | Region | EPA Level III ecoregions (by number, grouped) |
|---|---|---|
| `new-england` | New England | 58 (outside New York), 59, 82 |
| `upstate-ny` | Upstate New York and the Adirondacks | 58 (in New York), 60, 61, 83 |
| `mid-atlantic` | The Mid-Atlantic coast | 63, 64, 84 |
| `appalachia` | Appalachia, Kentucky, the Smokies, the Blue Ridge | 62, 66, 67, 68, 69, 70, 71 |
| `southeast` | The Southeast Piedmont and coastal plain | 45, 65, 75 (Georgia and the Carolinas) |
| `florida` | Florida | 75 (in Florida), 76 |
| `gulf` | The Gulf Coast and the Louisiana bayous | 34, 35 (outside Texas), 73, 74, 75 (Alabama to Louisiana) |
| `texas` | Texas: Hill Country, coast, brush country, Panhandle | 29, 30, 31, 32, 33, 35 (in Texas) |
| `plains` | The Great Plains | 25, 26, 27, 28, 42, 43, 44, 46, 48 |
| `midwest` | The Midwest and Great Lakes | 47, 49, 50, 51, 52, 53, 54, 55, 56, 57, 72 |
| `ozarks` | The Ozarks and the Ouachitas | 36, 37, 38, 39, 40 |
| `rockies` | The Rocky Mountains | 15, 16, 17, 21, 41 |
| `desert-sw` | The Southwest deserts | 14, 23, 24, 79, 81 |
| `great-basin` | The Great Basin and the Colorado Plateau | 12, 13, 18, 19, 20, 22, 80 |
| `california` | California | 5, 6, 7, 8, 85 |
| `pnw` | The Pacific Northwest (west side rainforest, the Cascades, the dry east) | 1, 2, 3, 4, 9, 10, 11, 77, 78 |

(The groupings are the starting point, checked against the EPA's list when the grid is baked. A few
ecoregions cross a region line and split by state: 58 is the Adirondacks and northern New England, and
75 runs from the Carolinas round Florida to Louisiana. A region's list is data and can split later:
`pnw-westside` and `pnw-dryside`, `texas-hill` and `texas-coast`.)

## 3. How we'll know it looks right

**The green spots.**

- What: 64 curated public streets, parks and roads (`tools/real-spots.mjs` `GREEN`), three to six
  in each region. These are where a region's greenery is: leafy residential streets, parks, rural
  and forest roads, not downtowns.
- Run: `node tools/real-compare.mjs --kind=green --group=region`.
- Output: one montage a region (`shots/real/<region>-montage.jpg`), each photo beside the game from
  the same spot, lens, pitch, date and hour.
- Score: vegetation share photo against game, by region.

**The targets.**

- Every region's vegetation share within 5 points of its photos.
- The trees reading as the region's own on the montage: the reviewer names the species they see.

**The national run** keeps watch on the downtowns, so we don't plant a forest in Midtown.

## 4. The plan

Each step lands with its comparison numbers and a reviewed montage, and is tracked in
`feature_list.json`.

1. **Measure.** Run the green spots by region (`real-greenery-baseline`).
2. **Density first** (`regional-greenery`). Find where the missing two-thirds of the vegetation goes:
   - yard trees per lot;
   - verge and street trees by street type;
   - field edges and hedgerows;
   - woodlot interiors;
   - the far field.

   Fix it with the data first (OSM's woods and scrub, WorldCover, LiDAR crowns), then priors per
   region. The target is the vegetation share per region.
3. **Regions as data** (`ecoregions`) — **done** 2026-10-05. A baked lat/lon → EPA Level III grid
   (public domain, 0.05°) and a code → region table with the reference's state lines, so
   `regionStyle` carries the region key and the casts read it.
4. **The regional flora** (`regional-flora`). The new tree and plant families in §1's list, each
   with real dimensions, variants, autumn and winter looks, validation and a vertex budget. Then:
   - the layers: canopy, understory, ground cover, and hangers such as Spanish moss strands and moss
     on the bark (a shader term by the region's humidity);
   - each region's cast as weights (§5).
5. **The regional wildlife** (`regional-wildlife`). The new animal families on the jointed body plan
   (`fauna.ts`), each region's cast with how common each one is, and where and when it's seen:
   - common ones are everyday life;
   - occasional ones are a good day;
   - rare ones are the regional rares (`docs/GAMEPLAY_VISION.md` §3), keyed by region as data.

## 5. The regions' life

The reference, region by region, is [docs/regional-life/](regional-life/README.md), researched
2026-10-04 from public sources:

- **Flora**, layer by layer: canopy (forest, and street and yard trees apart), understory, ground
  cover, hangers and vines, and the seasons. Every plant has a modelling note.
- **Wildlife**: mammals, birds, reptiles and amphibians, insects and other invertebrates, and what's
  seen from shore. For each: how common (common, occasional, rare), where and when, group and
  behaviour, and a modelling note.
- **A signature per region.**
- **Range limits**: what never to place where, in [ranges.md](regional-life/ranges.md).

The signatures in brief:

| Region | File | What makes it read as itself |
|---|---|---|
| New England | [01](regional-life/01-new-england.md) | sugar and red maples in October; white pine and hemlock over granite, ferns and mossy stone walls; moose in a bog; loons |
| Upstate New York | [02](regional-life/02-upstate-ny.md) | Adirondack lakes, spruce-fir and white pine, beaver ponds with grey snags; sugar maples aflame; Finger Lakes gorges of shale, hemlock and moss |
| Mid-Atlantic coast | [03](regional-life/03-mid-atlantic.md) | ospreys over gold-green salt marsh; Pine Barrens pitch pine on white sand; laughing gulls, dunes and beach grass, blue hydrangeas |
| Appalachia | [04](regional-life/04-appalachia.md) | layered blue ridges in haze; cove forest of tulip poplar and buckeye over rhododendron and mossy boulders; black bears in town; elk |
| Southeast | [05](regional-life/05-southeast.md) | live oaks hung with Spanish moss; salt marsh, pluff mud and fiddler crabs; loblolly and longleaf pine on red clay; azaleas, dogwoods, crape myrtles |
| Florida | [06](regional-life/06-florida.md) | live oak and Spanish moss, cabbage palms, saw palmetto under slash pine; an alligator in the retention pond; ibis and sandhill cranes on lawns; manatees |
| Gulf Coast | [07](regional-life/07-gulf.md) | bald cypress swamp with knees and moss curtains; live oak alleys; brown pelicans on pilings; spoonbills in ditches; crawfish chimneys |
| Texas | [08](regional-life/08-texas.md) | live oaks with ball moss over limestone and Ashe juniper; bluebonnets in spring; mesquite and prickly pear; bald cypress on clear green rivers |
| Great Plains | [09](regional-life/09-plains.md) | grass to the horizon with a lone cottonwood, a windmill and a stock tank; Flint Hills tallgrass; prairie dog towns; bison; pronghorn |
| Midwest | [10](regional-life/10-midwest.md) | maple- and oak-shaded porches with fox squirrels; corn and soy to the horizon, red barns, woodlots; fireflies at dusk; northwoods lakes |
| Ozarks | [11](regional-life/11-ozarks.md) | clear spring rivers, white gravel bars, leaning sycamores; limestone bluffs with red cedar; redbud and dogwood in April |
| Rockies | [12](regional-life/12-rockies.md) | gold aspen against dark spruce and fir; ponderosa parks with orange bark; elk bugling; moose in the willows; bighorn on roadside cliffs |
| Southwest deserts | [13](regional-life/13-desert-sw.md) | saguaro with a Gila woodpecker's hole; Joshua trees and creosote; palo verde yellow in April; cholla glowing at sunset; ocotillo |
| Great Basin | [14](regional-life/14-great-basin.md) | silver sagebrush to the horizon; red-rock canyons with cottonwood ribbons; piñon-juniper mesas; the Great Salt Lake's birds |
| California | [15](regional-life/15-california.md) | golden summer hills with dark oaks; coast redwoods over sword fern; poppies and lupines; chaparral, manzanita and quail |
| Pacific Northwest | [16](regional-life/16-pnw.md) | towering Douglas fir, cedar and hemlock over sword ferns; bigleaf maples dripping moss and licorice fern; banana slugs; Steller's jays |

## 6. What the foundry builds, in order

**The full build list** is [docs/regional-life/models.md](regional-life/models.md): all 1,382
plants and animals the regions name, deduplicated, each with its genome, regions, real size, seasons,
animation and behaviour, and a priority, and the P1 rows as 16 numbered work packages. Below is the
same order by family.

Ordered by how many regions a family serves and how much of a frame it fills (the signatures above,
the comparison's montages). Each family lands with validation, a vertex budget in
`tests/foundry.test.ts`, real dimensions, and its seasons.

**Trees and their hangers:**

1. **Live oak**, broad and low, with **Spanish moss** strands and resurrection fern (southeast,
   Florida, Gulf, Texas; the coast live oak in California).
2. **The Northwest's conifers**: Douglas fir, western redcedar, western hemlock, Sitka spruce. Also
   **moss and lichen on bark and limbs**, a shader term by the region's damp (PNW, northern
   Rockies, Appalachian coves, New England).
3. **Aspen** (white bark with black eyes, gold in fall) and **ponderosa pine** (orange plated bark)
   for the Rockies, the Great Basin's mountains and the PNW's dry side.
4. **The eastern hardwoods**: tulip poplar, sycamore (white mottled limbs), sweetgum, hickory, and
   the flowering understory (dogwood, redbud, crape myrtle, rhododendron and azalea). For
   Appalachia, the southeast, the Ozarks, the Midwest and the Mid-Atlantic.
5. **Bald cypress** with knees (Gulf, Florida, Texas rivers); **cottonwood** on every western creek.
6. **The desert**: saguaro, prickly pear, cholla, ocotillo, Joshua tree, creosote, palo verde. And
   **piñon, juniper and sagebrush** (the Great Basin, the desert's mountains, Texas's Ashe juniper).
7. **Sabal palm and saw palmetto** (Florida, the southeast coast, the Gulf).

**The ground layers:** ferns (sword, bracken, cinnamon), moss carpets and mossy boulders, prairie
grasses (big and little bluestem), wildflower drifts by season (bluebonnets, poppies, lupine), and
kudzu mantles on Southern roadside woods.

**Animals, the most-seen first:**

- **Birds:** the songbird as species by palette (cardinal, blue jay, robin, mourning dove), American
  crow, rock pigeon, Canada goose and mallard, great blue heron and egrets, turkey vulture, wild
  turkey, bald eagle and osprey, brown pelican.
- **Mammals:** raccoon, opossum, fox squirrel and chipmunk, groundhog, armadillo, skunk, black bear,
  elk, moose, bison, pronghorn, prairie dog, bighorn.
- **Reptiles and amphibians:** alligator, turtles basking on a log, anoles.
- **Insects:** monarchs (the butterfly by species), dragonflies, cicadas (heard).

**Range rules as data** (from [ranges.md](regional-life/ranges.md)), checked by a test that places
none out of range. For example:

- flashing fireflies only east of the Plains;
- alligators north only to North Carolina's sounds;
- Spanish moss north only to southeast Virginia;
- saguaro only in the Sonoran.
