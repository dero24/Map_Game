# What comes next, and why (2026-10-08; in the repo 2026-10-09)

A plain-language plan for Robby (what the whole game is: `FULL_SCOPE.md`). Written in his
`for_mapgame` folder while another agent fixed his bugs, brought into the repo on 2026-10-09: the
steps are items in `feature_list.json`, and `docs/earth/HANDOFF.md` "Start here" follows this
order. Until the harness cleanup (step 3) puts the order in the feature list as data, **this table
is the order**.

---

## The order

**Build, then play while the map work runs.** One agent at a time does the work; Robby plays the
latest prototype part while the next agent does map work, so he's always testing something new.

| # | The agent works on | Meanwhile, Robby | Code? |
|---|---|---|---|
| 1 | **The four bugs: done** (2026-10-08/09), and a second batch of six: people and animals lit by the night, crowds and traffic by place and hour, the crisp watercolor preset, the harbour's water (tiles v31), seawall railings, a city's evening, animals that stay, the suburbs against real photos. On `feature/four-reports`, pushed and live | Reviewed the before/afters | Done |
| 2 | **The gameplay design session** (`gameplay-one-plan`, **next**): read every gameplay doc, go through the differences section by section with Robby deciding each, then make it **one document** (details below). Taking the time it takes | Decides, section by section | No |
| 3 | **Harness cleanup** (`harness-cleanup`): ROADMAP rewritten from the agreed plan; HANDOFF trimmed to "where things stand now"; old LOG months archived; the work order as a list the startup check follows; unknown statuses rejected | — | Small |
| 4 | **Prototype part 1, the first minute** (`poc-first-minute`): step out and the town blooms; pencil things where they really live, with a setting for how many (see "How many pencil things?"); approach carefully and tap to collect (see "The Sea Bright prototype") | — | Yes |
| 5 | **The map data list** (`map-data-list`): one inventory of everything the game and world will ever want from the map (airports, gas stations, streams, hedges…), from the agreed plan, the world docs and Robby's notes from playing | **Plays part 1** with each pencil-thing setting, and notes what he wants to touch and collect | No |
| 6 | **Prototype part 2, touch and moments** (`poc-touch-moments`): sit on benches, the gulls' crumb moment, painting it with a gold edge, with Robby's notes from part 1 | — | Yes |
| 7 | **The one big cut, and "store broadly, send narrowly"** (`osm-big-cut`): cut the US map with the full list, check size and test towns, upload; tiles then pick only what the game uses | **Plays part 2** | Yes |
| 8 | **Prototype part 3, the van and jumping into a painting** (`poc-painted-place`): wake in the van, hang your painting, jump in and the moment replays, step back out | — | Yes |
| 9 | **The playtest** (`poc-playtest`, not multiplayer): two or three friends or family who have never seen the game each play the first ten minutes alone, on Robby's PC or phone, about 15 minutes each | Watches quietly and notes what they do and say: do they find the pencil things, notice the gulls' warning sign, say "whoa" stepping into their painting, get confused or bored? | — |
| 10 | **Then the world's features**, now that the data is stored (airports, gas stations and other public places, greenery…), in turns with building the game properly. The region pass (`region-match-pass`, its method in `docs/REGION_MATCH.md`) fits here: Robby, 2026-10-09, "regions will happen", not next | Plays each | Yes |
| 11 | **Micro-regions** (`micro-regions`): the ~85 EPA ecoregions (already built into the game) each get their own plants, ground, light and wildlife, done in batches by region, each with its reference and a before/after montage; aiming the reviewer's scores at 10/10 (see `FULL_SCOPE.md` "The world") | Reviews each batch | Yes |

**Why this order:**
- **The prototype doesn't need the map work.** Sea Bright's map is built into the game, not
  streamed, so the prototype can come early, and playing it improves the data list (what you want
  to touch and collect tells us what to store).
- The design session comes before the cleanup, so the ROADMAP is rewritten once, from the agreed
  plan.
- The design session comes before the data list, because the game decides what data is needed
  (pencil things, places to stop, things to touch).
- The harbour fix took tiles to v31 (v30 was skipped); the big cut bumps them again. That's fine:
  tiles just rebuild as people visit.

**One agent session at a time in this project folder.** Two at once (say, a prototype agent and a
data-list agent) would edit the same files and trip over each other. Robby playing isn't an agent,
so it never collides. (Two agents at once is possible with a separate copy of the repo, a git
worktree, but it's more to manage.)

---

## The design session (step 2): ending with one gameplay document

**Goal:** when it's done, there is exactly one gameplay design document, so no agent or person can
read the wrong one.

**1. Read everything about the game:**
- **Design docs** (what the game should be): `docs/GAMEPLAY_STREAMLINED.md`,
  `docs/GAMEPLAY_VISION.md`, `docs/GAME_DESIGN.md`, `docs/CORE_LOOP_REVIEW.md`,
  `docs/Other_Ideas.md`, `docs/LIST_OF_POTENTIAL_ITEMS_AND_PARTS.md`, and the two drafts
  `docs/FULL_SCOPE.md` and this file; in Robby's `for_mapgame` folder, `GAMEPLAY_VISION.md` (an
  older copy) and `MULTIPLAYER_PLAN.md` (not in the repo: ask whether to bring it in).
- **Partly gameplay:** `docs/INTERIORS_PLAN.md`, `docs/IMMERSION_BACKLOG.md`. Only their game parts
  count.
- **Code docs** (how the existing code works today): `docs/agent/gameplay.md`. Read it to know what's
  already built.

**2. Go through it with Robby:** list what each doc says that the plan leaves out or says
differently, section by section. Robby decides each one: kept, changed or dropped.

**3. Make it one document:**
- **One file**, the agreed plan, including the detail worth keeping (the rares table, time and
  weather, the edge cases, multiplayer) as sections of the same file, not separate files.
- **The old design docs moved to an archive folder** (`docs/archive/`), so they don't show up as
  current. Git keeps their history. The `for_mapgame` copies too, with Robby's OK.
- **The code doc stays separate.** It describes the code, not the plan; it's checked so it doesn't
  contradict the plan, and is updated as the game gets built.
- **Everything points to the one file:** `AGENTS.md`, `CLAUDE.md`, the feature list's items and
  notes, the handoff.
- **The feature list's game items match the plan**, the prototype's three parts included.

**Done when** Robby reads the one document and says it's right.

---

## The prototype: Sea Bright only, or everywhere?

**It's on a switch.** Add `?poc=1` to the link and the prototype is on; leave it off and the game
is exactly as it is today. Nobody sees it unless they use the switch.

**It's built to work anywhere, and tuned in Sea Bright first.** Most of it doesn't care where you
are:

| Part | Works anywhere? | Why |
|---|---|---|
| The world colouring in as you look at it | Yes | It's the drawing system, the same everywhere |
| Pencil things near you, where they really live | Mostly | Animals, trees and street things come from the asset foundry and the regional tables, which cover the lower 48. Kinds like benches need naming once, not per town |
| Tap to paint and collect, the field guide card | Yes | Not tied to a place |
| Sitting on a bench, touching things | Yes, where those things exist | Data per kind of thing, never per town |
| The gulls' crumb moment (bunch up, lift off, gold edge) | Where there are gulls | Coasts, lakes, parking lots. Other places get their own moments later (herons, deer, the drawbridge) |
| The van and jumping into a painting | Yes | The van is its own room; a painting keeps its spot and hour |

**Why start in Sea Bright:**
- **Its map is built into the game**, not streamed from the tile service. It loads fast and the
  same every time, so testing is reliable and doesn't need the big cut (step 7).
- **It has everything the first ten minutes needs:** gulls, herons, fiddler crabs, benches, the
  beach, the river.
- **It's the place we know best**, so it's easy to judge what feels right.

**Then:** once it feels good in Sea Bright, try the switch in a few other towns (a city, a
suburb, a desert road, the mountains) to see what breaks or feels empty. Fix those, and the
prototype becomes the real game, built properly, everywhere.

---

## The Sea Bright prototype: what it is (2026-10-08)

**One idea per beat.** Releasing animals into paintings, habitats and visitors are *not* in it
(they're later, see `FULL_SCOPE.md`): "your gull" means one thing only, the gull you collected.

**The first ten minutes, beat by beat:**
1. **Wake in the back of the van:** a cosy room (a bed, the map table, one empty wall), already
   bigger than a van could hold.
2. **Step out the back door: the town is pencil, and as you turn around it washes into
   watercolour.** The biggest moment of the prototype, the first "whoa".
3. **Look back:** the room you woke in is inside that small camper van.
4. **A few pencil things nearby,** where they really live: a gull on a post, a bench, a tree; a
   heron at the water's edge.
5. **Approach the gull carefully and tap it** (idea A): rush it and it flies off; move slowly or
   crouch and you get close. It washes into colour and lifts into your field guide as a card.
6. **Sit on a bench** (touching the world).
7. **On the beach, tap the gulls to toss a crumb:** they gather, bunch up and face the wind (the
   warning sign), then lift off together (the moment). **Paint it with Frame as they rise:** your
   first gold edge.
8. **Back in the van, hang the painting and jump into it,** like Mario 64. The painting fills your
   view in pencil and washes into colour around you: your beach, at that moment, its light and
   people, and **the gulls lift off again as you arrive.**
9. **Walk around** (about 250 m; past that the world is pencil), then **step back out through the
   frame** into the van.
10. **End on a hook:** outside at dusk, you hear the heron before you see it.

**Three parts, each playable on its own:**
| Part | What's in it |
|---|---|
| **1. The first minute** | The town blooming as you look (beat 2), pencil things where they really live with a setting for how many, approaching carefully, tapping to collect, the card |
| **2. Touch and moments** | Sitting on benches, the gulls' crumb moment with its warning sign, painting it with Frame, the gold edge; paintings remember their place, date, hour and weather |
| **3. The van and jumping in** | Waking in the van, looking back at it, hanging the painting, jumping in, the moment replaying, stepping back out |

**Getting it right:**
- **Five hero things that look great up close:** the gull, the heron, the fiddler crab, the bench
  and one tree, since you walk right up to them. Their cards painterly and close.
- **Golden hour** for the playtest (a setting), the game's best-looking light. (In the real game the
  world follows the real time of day.)
- **On a phone too:** tapping and approaching feel different on glass.
- **The switch:** all of it behind `?poc=1`; without it the game is unchanged.

**What to watch while people play:** how long until the first tap; whether they find the pencil
things without help; whether they slow down to approach the gull; whether they read the gulls'
warning sign; what they say when the town blooms, when they look back at the van, and when they
jump into their painting.

---

## How the map gets to the player (the short version)

1. **The raw map** (on Robby's PC): OpenStreetMap's file of the whole US, on D:.
2. **The 2-hour cut** (on the PC, about monthly): a script keeps what the game wants and sorts it
   into ~1 km squares. Result: the 35 GB extract.
3. **Upload:** the extract goes to cloud storage (Cloudflare R2).
4. **The tile service** (in the cloud): when a player needs a square, it builds a small tile from the
   extract (roads, buildings, trees…) and keeps a copy so the next player gets it instantly.
5. **Streaming:** as you walk, the game asks for the squares around you, a few megabytes as you
   move, like a map app. Nothing is installed; the 35 GB never goes to anyone's phone or PC.

**The version number** (v31 now): when we change how tiles are built, the number goes up so everyone
gets fresh tiles instead of old copies.

---

## "Store broadly, send narrowly" (step 7)

**The problem today:** one list decides both what goes into the 35 GB extract *and* what every tile
carries. So anything new from the map (gas stations, streams, hedges, airfields…) means changing
the list, re-cutting for 2 hours and re-uploading, every time.

**The fix:**
- **Store broadly:** the extract keeps everything on the full data list (step 5), whether the game
  uses it yet or not. It's bigger, but cloud storage is cheap.
- **Send narrowly:** each tile carries only what the game actually uses, so phones don't download
  data nothing uses yet.
- **Then a new feature is just code:** it starts using data that's already stored, plus a tile
  version bump. No re-cut, no waiting.

**What's missing from the map today** (a start for the step 5 list):
- **Public places:** airports and airfields, gas stations, EV chargers, rest areas, campgrounds
- **Greenery:** hedges, tree rows, orchards, vineyards; residential, commercial and industrial land
- **Water:** streams and small rivers drawn as lines (only rivers drawn as areas come through)
- **Rock and ice:** cliffs, bare rock, scree, glaciers
- **Smaller:** golf courses, pools and marinas mapped as bundled areas; heritage sites and
  attractions (good "stops for a reason")

**Two honest notes:**
- **It's not "once and for all", but it doesn't have to be frequent.** The point is that no feature
  ever *waits* for a cut. Re-cutting just brings the map up to date (see "Keeping the map up to
  date" below).
- **Data alone isn't a feature:** gas stations in the extract don't put gas stations in the game
  until the tile builder draws them. The list removes the data blocker; each feature still needs
  its building work.

---

## How many pencil things? (decide by playing)

**The question (Robby, 2026-10-08):** a 360 colours everything you can see, out to the horizon. So
why not leave *every* uncollected kind in pencil, so you can walk around and colour everything?

**Two layers, two jobs:**
- **Colouring is the reward for looking:** instant, free, the "wow" of a place coming alive.
- **Pencil things are the game:** they work because they're few and they stand out.

**Why not every uncollected kind:**
- Early on most nearby trees, benches, birds and cars would still be pencil, so a 360 would still
  look half-done, and the bloom would stop feeling magical.
- The first hour would be dozens of taps per street: a chore, not discovery.
- Rares stop standing out: the white squirrel only pops among grey squirrels already coloured.
- It's much harder to build: a pencil version of every material, not a few pencil copies.

**What's right about the idea:** you want plenty to do, and the feeling of colouring the world as
you walk.

**Middle ground:** more at the start, fewer later (about 6–8 pencil things in the first minutes,
settling to 3–5 as your collection grows). And make the 360 a moment: step out of the van, turn
around, and the town blooms, the first "whoa" before the first tap.

**Decide by playing:** prototype part 1 gets a setting for how many pencil things appear:
1. **3–5** (the current plan)
2. **6–8 early, 3–5 later**
3. **Every uncollected kind nearby** (within a short distance; the far view always coloured)

Robby plays each in Sea Bright for about ten minutes; how it feels decides it. Then the playtesters
play the winner.

---

## Keeping the map up to date

**It's not required.** The OpenStreetMap licence only asks for the credit on screen, not a fresh
map, and nothing breaks if the map is a few months old.

**Why update anyway:**
- **The real world changes:** new buildings, roads, parks. A missing new store in someone's hometown
  feels wrong.
- **Mappers fix mistakes daily.** If a player finds a missing building, the fix is to correct it on
  OpenStreetMap; it shows up at the next cut.
- **Patches fold in:** the v29 add-on retires at the next full cut.

**Why not too often:** each cut means a new tile version, so tiles rebuild as people visit. (Painted
places save their own tiles, so an update never changes them.)

**The plan:** no fixed schedule now. Re-cut when there's a reason: the big step-5 cut, before a
release, or when the map is noticeably out of date. Roughly every few months once the game is out.
Step 7 writes the routine down (the commands, in order, and how to check the result) so anyone can
run it.

---

## Also to settle or prepare

- **Add the new steps to the repo: done** (2026-10-09): the cleanup, the map data list, the big
  cut, the playtest and the micro-regions are items in `feature_list.json`, the prototype's three
  match this plan, and the handoff follows this order.
- **Saving the player's progress** (for the design session): collections, paintings and the van's
  rooms need to be saved somewhere. On the device only, or backed up to an account? It affects
  multiplayer and privacy later.
- **Playtesters for the prototype:** two or three people who haven't seen the game. Worth lining up
  early.
- **The branch:** work goes on from `feature/four-reports` (Robby's call, 2026-10-08); a
  `feature/` push publishes the game and runs the checks. `feature/lower48-alive` is left as it was.

**Parked (not forgotten):**
- The two older bugs: walking into walls (Chicago) and the Grandstaff terrain (Moab).
- Noticed in the second batch, not asked for: Times Square and Bryant Park count as half a city
  (their own nightlife would say more); a black square in Oak Park's sky; a pagoda-shaped conifer;
  which kinds the surveyed trees take (`docs/REGION_MATCH.md` §6).
- What the tile service costs if many people play: not urgent, but check before release.

---

## Harness cleanup (step 3), in a little more detail

The harness is the system that keeps agents on track between sessions: `feature_list.json` (every
item with its status and proof), `tools/init.mjs` (the start-of-session health check), `AGENTS.md`
(the map of docs), `HANDOFF.md` (what's next), `LOG.md` (history). It closely follows Anthropic's
"Effective harnesses for long-running agents" approach.

**What to fix:**
- **HANDOFF:** only "where things stand now". Replaced each time, never added to; history lives in
  the LOG and git.
- **ROADMAP:** only the current plan; old thinking deleted (git keeps old versions).
- **LOG:** older months moved to an archive file (it's ~4,600 lines).
- **The work order as data:** today the startup check only knows "the active item, else the lowest
  tier and rank", so an order like "bugs → design → cleanup" lives in prose and an agent can miss
  it. A `queue` list in the feature list, followed by the startup check, fixes that.
- **Checks:** reject statuses that aren't in the legend (one item says "done"); warn when HANDOFF and
  the feature list disagree about the active item.
- **AGENTS.md is fine** (~86 lines, a map pointing to other docs).

---

## Already decided (for reference)

- **Painted places keep their people and traffic.** The hour and weather are held, but life goes on
  as it was at that hour. Paint at dawn for a quiet place, on a summer evening for a busy one.
- **The van is bigger on the inside,** shown on the first morning: you wake in a room, step out the
  back door, turn around, and it's a small camper van.
- **One way to collect:** walk up to a pencil thing and tap it. Paintings are for making pictures
  and gold edges, not for collecting.
- **One gameplay plan,** agreed before any gameplay code (step 2).
- **Approaching animals is the skill** (idea A): rush them and they leave; slow down, crouch or sit
  and they come closer.
- **The real world follows the real day and night; a painting keeps its own moment.** So the bed's
  "choose when you wake" goes or changes.
- **Paintings are places you jump into,** like Mario 64; a gold-edged one replays its moment.
- **The goals:** finishing the collection, and a cozy base you furnish with what you collect.
- **Starting:** near you by IP address (city level, nothing stored; Cloudflare already knows the
  visitor's approximate city) as an option, or type any place; outside the US, a random US city.
  Robby's direction; the exact wording of the choice still gets his OK since it touches privacy.
- **The van drives itself** (its own GPS); long trips go in legs, one sleep per leg, and what you
  sleep through stays uncoloured. **A leg is a tank (~300 miles):** refuel by pulling up next to a
  real pump; each stop is a little place to explore; you can never run out (low fuel shows the
  nearest station, and on reserve the self-driving takes over to it). Details in `FULL_SCOPE.md`.
- **Micro-regions:** the ~85 EPA ecoregions get their own look and life (step 11).
- **Later, not in the prototype:** releasing animals into paintings, habitats, visitors, taking
  things apart and combining them (see `FULL_SCOPE.md`).
