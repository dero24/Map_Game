# Full scope: what the game is, and what's in 1.0 (draft, 2026-10-08)

What the whole game is, in one place, and where the line for 1.0 sits (in the repo 2026-10-09). A draft for the design
session (step 2 in `NEXT_STEPS.md`), which turns it and the other gameplay docs into the one
gameplay document in the repo. `NEXT_STEPS.md` is the order of work; this is the *what*.

---

## The game in one line

You travel the real America in a camper van. The world turns from pencil into watercolour as you
look at it; the few things still in pencil are yours to approach and collect; the moments you
paint become places you can jump back into; and your van becomes a cozy home filled with what you
found.

## What makes it unlike any other game

- **The real map:** every real road, building, park and beach in the lower 48 (OpenStreetMap).
- **The real calendar:** real sun, moon, seasons and time of day.
- **Real nature:** wildlife and plants by region, as common or rare as they really are there, in
  their real ranges and seasons.
- **Watercolour,** with pencil meaning "not yet".

## The core loop

**look → approach → collect → paint moments → jump back into them → make your van home**

| Verb | What it is |
|---|---|
| **Look** | Everything you look at colours in, out to the horizon, the first time you see it. A 360 colours the whole view |
| **Approach** | A few things near you are still pencil: kinds you haven't collected, where they really live (a heron at the marsh edge at dusk). Animals keep their real wariness: rush them and they leave; slow down, crouch or sit still and they come closer. Approaching well is the skill |
| **Collect** | Tap a pencil thing when you're close. It washes into colour and becomes a card in your field guide. The tap is the one way to collect |
| **Touch** | Tap anything coloured and it answers: sit on benches, ring bells, switch on lamps, toss crumbs to gulls, skip stones, open doors |
| **Paint moments** | Frame makes paintings. Moments (a heron's strike, gulls lifting off together, a drawbridge rising) each have a warning sign a few seconds ahead; paint one in time and it gets a gold edge |
| **Jump in** | Hang a painting in your van and jump into it, like Mario 64. You're back in that place at that moment: its light, weather and people, with life still going on. A gold-edged painting replays its moment as you arrive |
| **Make it home** | The van is bigger on the inside. What you collect furnishes it, and it grows as you reach milestones |

## The goals

1. **Finish the collection:** every kind, region by region, with its rare variants and gold-edged
   moments. It takes a real year of seasons and a trip across the country.
2. **A cozy base:** the van's rooms furnished with what you collected, a wall of paintings from
   everywhere you've been.

(A diary of your travels comes for free: your paintings and your coloured map.)

## State capitols: the big goals (a candidate long-game goal)

- **The 48 state capitols are the game's big goals,** like gyms in Pokémon: real, public, and in the
  map data (no hand list per town).
- **Each capitol holds its state's seal,** and each state has a **state set** from real, official
  data: the state bird, the state flower and the state tree. Find all three and bring them to the
  capitol to complete the state: 48 real sets, nothing invented.
- **Gentle, painterly powers,** one per region of life (16), earned at a capitol in that region, not
  48 separate ones (easier to design and balance). Ideas:
  - a brush that paints from farther away;
  - a lantern that shows pencil things at night;
  - paint that holds a moment longer;
  - a compass that hums near rares.
- **When:** after the core loop works. The design session weighs it next to the sketchbook riddles
  as the long-game goal.

## How much to collect

**Today** (the asset foundry, 2026-10-08): about **95 kinds of animals, 77 kinds of trees, 19 other
plants**, plus cars, boats, street furniture (benches, lamps, signs) and furniture inside buildings
by building type: roughly **250–300 kinds**. Enough for the prototype and a first region; not yet for
a year-long collection across the country (real US nature alone has about 800 bird species and 400
mammals).

**Target for 1.0: about 400–600 kinds,** grown by:
- **Micro-regions:** each of the ~85 ecoregions adds its signature plants and animals.
- **Variety within a kind:** rare colour variants (the white squirrel), each counted separately.
- **Moments and seasons:** a heron's strike is its own gold-edged card; a maple in autumn and in
  spring.
- **Things inside buildings and regional things:** a diner jukebox, a lobster buoy, a chile ristra.
- **State sets at the capitols:** each state's official bird, flower and tree.

Every new kind comes from the foundry and its data (never a hand list per town), with its own
budget so phones keep up.

## Time

- **The real world follows the real day and night.** It's dusk in the game when it's dusk where you
  are.
- **A painting keeps its own moment.** Paint a beach at golden hour and it stays golden hour inside;
  someone who only plays at night can still visit a sunny beach. That's a reason to paint.
- **Open question:** what the bed does, now that it can't change the time (sleep through a long drive?).

## Where you start

- **Near you, by IP address** (an option): city level only, nothing stored. The tile service runs on
  Cloudflare, which already knows a visitor's approximate city, so no GPS and no other service.
- **Or type any place** (or pick it on the map).
- **Outside the US:** a random US city.
- Seeing your own town turn to watercolour on minute one is the strongest "whoa" the game has.
- Robby's direction; the wording of the choice gets his OK since it touches privacy.

## The world

- **The lower 48**, streamed as you move; Sea Bright built into the game as the home and proving
  ground.
- **Every region looks and lives like itself:** its plants, animals, ground and light (Moab red rock,
  not a leafy Midwest town).
- **Micro-regions:** the 16 regions of life are groupings of the EPA's ecoregions, already built into
  the game. Their finer level splits the lower 48 into about 85 (and an even finer one into about
  960). Each of the ~85 gets its own plants, ground, light and wildlife, so every place looks
  specifically like itself: what a reviewer needs for a 10/10. Data per ecoregion, never per
  town. It can feed the game too: sets by micro-region ("the Sonoran desert set", "the Pine
  Barrens set").
- **Places to visit:** towns, parks, beaches, and public places (airports, gas stations, rest areas,
  campgrounds, marinas) once the map data is stored (`NEXT_STEPS.md` steps 5 and 7).
- **People and traffic** that follow the place and the hour.
- **Close up matters:** the game asks you to walk up to things, so the things you collect have to
  look good from two metres away.

## Travel

- **The van drives itself.** Set a destination at the map table (the van's own GPS) and it drives
  the real roads while you ride in the back; or take the wheel and drive yourself. Everything you
  see colours either way.
- **Long trips go in legs.** Jersey to California is many legs, not one nap. One sleep covers one
  leg, and anything you sleep through stays uncoloured on your map, so the choice is ride awake and
  see it, or skip a stretch.
- **A leg is a tank (about 300 miles).** Range gives the trip a real rhythm, like No Man's Sky's
  jumps:
  - **Refuel by pulling up next to a pump** at a real gas station (from the map data). No menu,
    just park beside it.
  - **Every fuel stop is a little place to explore,** with its own pencil things: the diner, a
    roadside sign, the local birds. Fuel turns into stops for a reason, not a meter to babysit.
  - **You can never run out.** When it's low, the van's GPS shows the nearest real station. If you're
    driving yourself and ignore it, the van runs on reserve and the self-driving takes over to the
    nearest pump. If it's driving itself, it plans its stops on its own.
- **Places you've been:** one sleep away (still a trip, not a teleport).
- **No portal gun.** Paintings aren't fast travel: they take you to the moment, not the place today.
- **Open question:** how much a tank costs, if anything (free fuel keeps it simple; the stop is the
  point).

---

## 1.0: in, and later

| In 1.0 | Later |
|---|---|
| Colouring by sight | Releasing animals into paintings, habitats, visitors |
| Pencil things where they really live, collected by careful approach and a tap | Taking collected things apart and combining them into new ones (the asset foundry's parts) |
| Touching things (sit, ring, feed, light, throw, open) | The old painter's sketchbook: riddle pages from map data, leading west |
| Moments with warning signs, gold edges | Shared sky events: real moonrise, tides, meteor showers, painted by everyone at once |
| Paintings you jump into, holding their moment | Living paintings on the wall (a fox crossing your Vermont wood) — maybe 1.1 |
| The van as a cozy base you furnish with what you collect, growing by milestones | The drone |
| The field guide across the lower 48, by real region and season | Multiplayer (`MULTIPLAYER_PLAN.md`) |
| The self-driving van, legs of a tank, refuelling at real pumps, sleeping through legs | Placing your things out in the real world (your own layer) |
| Micro-regions (~85) for how every place looks and lives | The even finer ecoregions (~960) |
| About 400–600 kinds to collect | State capitols, state sets and regional powers (or 1.0's long-game goal, if the design session picks it over the sketchbook riddles) |
| Start near you (IP city) or type a place | Activities (hoops, bowling, mini golf); fishing beyond skimming stones |
| Saving your progress (where: decided in the design session) | |

**Why this line:** it's one loop, and every 1.0 piece feeds it. The "later" column has some of the
best ideas (the parts-and-combining one could be a whole second game), but each is big, and none is
needed for the loop to work.

## The big idea for after 1.0: the foundry as a toy

The asset foundry builds everything from parts (a boat from a hull, a cabin, a mast; a car from its
body and gear). So collected things could someday be taken apart and recombined into things the
game never intended: a boat with a lighthouse lamp, a bench made of driftwood. Nobody else can do
this, because nobody else generates their whole world from parts. **Not in 1.0**; a small taste is:
what you collect furnishes your van.

---

## Open questions for the design session

- **Saving:** on the device only, or backed up to an account? (Affects multiplayer and privacy.)
- **The bed:** what it does now that the real world keeps real time.
- **How many pencil things:** decided by playing the prototype (`NEXT_STEPS.md`).
- **Approaching:** how wary each animal is; whether crouching is a button or just moving slowly.
- **Milestones:** what grows the van (a new region's first painting, a completed set) and what they
  give.
- **Sets:** how many kinds make a set, by kind of place (the harbour, the salt marsh, the backyard).
- **Phone or PC first** for the playtest.
- **The long-game goal:** state capitols with state sets and regional powers, or the old painter's
  sketchbook riddles, or both (and which, if any, is in 1.0).
- **How many kinds for 1.0:** is 400–600 right, and which families grow first?
