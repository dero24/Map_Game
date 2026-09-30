# Game design — Paint It Real

*The gameplay proposal, rewritten 2026-09-28 after Robby's review. It replaces "Seeds" (grow and
take-apart), the earlier "painter's road", and the repo brainstorm `docs/CONSTRUCTION.md`.*

*Three things are decided:*
- *painting is the verb;*
- *you earn what you can paint by painting the real thing from life;*
- *every verb works on a phone.*

*Everything else is a draft to build and argue with. The first playable slice will change it.*

What changed from "Seeds":

| Seeds said | Now |
|---|---|
| Take the world apart into words | Paint the real thing from life (P) to learn it. Nothing real is ever broken |
| Grow objects from words at a bench | Paint them into the world with the brush: a pencil outline that washes into colour and becomes real |
| Matter from dismantling | Paint, from the colour you uncover exploring new ground |
| Sketch on the bench | You never draw on the 3D world. You aim and it snaps, you walk lines, you draw on the map or on a page (§5) |

---

## 1. The one line

**You walk out your real front door into a watercolor version of your actual street. Anything
you paint from life, you can paint anywhere, and what you paint becomes real, where you
painted it, for everyone.**

It is three games at once, because those are the three kinds people keep playing:

- **an RPG.** Progression is your Almanac: the real things you've painted, in a country full of
  things you haven't yet. You also build a reputation with real towns.
- **a multiplayer world.** Everything anyone paints stays at real coordinates.
- **a creation platform.** You make objects and games from what you've learned, on real
  streets that already have interiors, traffic, weather and wildlife.

## 2. The premise (light)

You carry a watercolor brush, and what it paints becomes real. It has one rule: it can only
paint what you have painted from life. So the country is your subject, and your front door is
the first page.

There are no villains. There is weather, gravity, water, and someone three states over who
has painted something you haven't.

## 3. Why this engine

| What the engine has | What the design does with it |
|---|---|
| **The foundry.** Every object is a recipe → genome → geometry, with validation, extras (`gear`) and rare variants | Every paintable thing is a foundry family, and a painting is a recipe. Every new family is new vocabulary to find |
| **Paint-as-you-explore.** A pencil underdrawing that blooms into colour as you walk | The look of making things: new objects appear in pencil, and painting them in is the same wash. New ground is where paint comes from |
| **The Almanac.** Pencil cards for things you've seen, coloured cards for things you've painted with P | The progression: a coloured card is a kind you can paint |
| **The summon solvers.** A car finds the nearest lane facing your way; a boat finds open water with its bow away from the land; a plane finds a clear run | Placement: every family says where it goes, and the world finds the spot |
| **Site masks.** Water, paving, footprints, terrain, retaining walls, OSM tags | Where each thing may go, and where nothing may |
| **The lower 48 from real data**, with regional tables | Each region teaches kinds you can't paint at home, which is the reason to travel |
| **Interiors** chosen by building use, see-through glass, lights at night | The hidden layer: rare things you see through windows but can only paint by getting in |
| **Saving by place.** The garden saves by lat/lon; also `LifeSim.adopt`, the tile cache and R2 | Painted things stay where you painted them; later, for everyone |
| **Touch controls** and the atlas map | The phone layout already exists, and the map is where long lines get drawn |
| **Physics with weight, destruction, animation from recipes** (backlog B.1–B.3) | Painted things float, sag, tip and break. Physics is the only antagonist |

## 4. Two verbs, both painting

**Paint from life (P) to learn. Paint into the world (the brush) to make.** One visual rule
runs through both: pencil means you know of it but it isn't real yet; colour means it's real and
yours.

### 4a. Paint from life: how you learn

The Almanac already works this way. Only the last rule below is new.

- **Seeing** something recognisable up close gives you its card in pencil (the spotting log does
  this today).
- **Painting it** with P colours the card in, with where and when. For example: *"Skiff —
  Shrewsbury River, Sea Bright · 28 Sep, golden hour"* (`paintFrame` does this today).
- **A coloured card means you can paint that thing anywhere.** This is the new rule.

What one painting teaches:

- **Everything recognisable in the middle of the frame**, as long as it's near enough to see
  properly. A good painting of a harbour teaches several boats at once. How big something must
  be in the frame, and how much of it must show, can be tuned; the harness's id pass already
  measures both.
- **Kinds, extras and rare variants.**
  - Kinds: a pickup, a skiff, a pitch pine, a lifeguard stand.
  - Extras a kind can carry: a roof rack, a sail, a lantern on a pole (the foundry's `gear`).
  - Rare variants (`variantAt`): a copper-roofed lantern, a wooden runabout.
  - Colour, wear, and size within what the kind allows are always yours to choose.
- **Rules, from places.** Paint a basketball court and you learn `score`; paint a running track
  and you learn `race` and `lap` (§9).
- **Other players' work.** Paint another player's creation from life and you learn its extras.
  Your card credits them.
- **Things seen through glass or from far away stay pencil.** To paint them you have to get
  close, and often get in. That's the hidden layer (§7).

**The blank cards are what keeps you wanting things.** Each family shows every kind it has. The
ones you haven't met show a silhouette and where they live: "at docks and marinas", "on beaches
in summer", "in New England harbours", "at airfields".

The hints come from the same rules that place things in the world. So "the nearest marina is
1.2 km north" is always true, and there are no per-town lists. This is also why the 48-state
rollout matters: each region's tables are its vocabulary.

### 4b. Paint into the world: how you make

1. **Take out the brush.** It's one button. The world pales slightly toward pencil around the
   brush tip.
2. **Choose what.** You pick from chips, one for each coloured card.
   - The chips are sorted by what you're aiming at. Water puts boat, dock and buoy first; a gap
     puts plank and footbridge first; a wall, ladder and stairs; open grass, bench, tent and
     garden bed. Recent picks come next.
   - On a PC, you can type to filter. On a phone, the keyboard's mic gives you voice input.
   - A whole sentence also works: "a long red skiff with a lantern at the back". It goes through
     the grammar (§6) and ends up as the same chip and options.
3. **Place it.** A pencil outline (the "ghost") appears, already in a sensible spot. You nudge
   it; you never draw it (§5).
4. **Vary it.** A small options card offers:
   - size and colour;
   - the extras and variants you've earned;
   - "like this one", which copies a card's exact look.
5. **Paint it in.** Tap to start the wash.
   - To speed it up and steer where the colour runs, rub it with a finger or the mouse. On a
     gamepad, hold the trigger.
   - Colour spreads with a wet edge (the explore bloom, applied to the object). It takes one to
     three seconds.
   - When it dries, it's real: it has collision and weight, and you can use it.
   - Nothing is spent until it dries, and you can cancel any time before that.
6. **It stays** where you painted it. You can wash out your own things at any time and get most
   of the paint back.

**Paint is the one resource.**

- **You earn it by exploring.** The colour you uncover on new ground fills your palette: every
  pencil cell that blooms is a drop.
- **What you spend.** Bigger things cost more.
- **Home is free.** Painting on your own home block costs nothing; it's your canvas.
- **A cap out in the world.** Only so many of your paintings can stand at once, and the oldest
  unused ones fade back to pencil first.
- **Flying and driving** uncover ground faster, so they pay less per cell.

All the numbers get tuned in the slice.

## 5. Placement: you never draw on the world

This part has to be honest, because a stroke on a screen is 2D and the world is 3D.

### Why freehand strokes on the 3D view don't work

- **A stroke doesn't say how far away.** Each point has to be projected onto whatever is under it.
- **At eye level, the ground is nearly edge-on.** From 1.65 m, ground 30 m away sits only 3°
  below the horizon.
  - There, a five-pixel wobble moves the point about 3 m on a monitor and about 10 m on a phone.
- **Things get in the way.** A stroke that slides over a parked car or a tree jumps onto it.
- **Fingers are fat and busy.** A fingertip is about a centimetre, which is 50–60 pixels on a
  phone, and it covers what it's drawing on. On a phone, dragging is also how you look around.
- **Reading gestures is guesswork.** Is that a line or a thin loop? A misread builds the wrong
  thing, and it feels like the game's fault.

Ōkami gets away with brush strokes for three reasons:
- it freezes the view into a flat page;
- it reads only a handful of glyphs;
- its building power only restores shapes the level already knows, like a broken bridge's
  missing planks.

Building games that work well on touch and controller all aim, snap and fill; none asks for
freehand geometry. Examples: Minecraft and Fortnite on phones, Townscaper, and the structures in
Death Stranding.

**Our advantage is that the world is data.** We know every bank, path edge, kerb, wall top, roof
edge and slope. So the world finds the spot, and the player aims and nudges.

The summon keys already prove this for three families:
- a car finds the nearest lane facing your way;
- a boat finds open water, with its bow pointing away from the land;
- a plane finds a clear run.

### Three rules

1. **At eye level you aim, and the world snaps.**
2. **You make lines and areas with your feet, or from above.**
3. **You draw shapes on a flat page, never on the world.**

### Four kinds of placement

Each foundry family declares its placement kind, the site it needs, its size range and how far
it can reach, in its table row: `place: { kind, site, size, span }`. That is one more column on
the ASSET_FOUNDRY checklist.

| Kind | Examples | What you do | What the world works out |
|---|---|---|---|
| **Spot** | boat, bench, bike, tent, lantern, umbrella, tree, stall | Aim at the screen centre, or tap the spot on a phone | The nearest valid site near your aim (open water, flat ground, sand, a wall, a branch), and a sensible facing (bow away from the land, a bench toward the view) |
| **Span** | plank, footbridge, rope bridge, ladder, stairs (up a Seattle rockery), ramp, zipline | Aim at a gap or a wall | Both ends (the two banks, or the foot and top of the wall); level if it can be, stairs if the ends differ; and whether the kind can reach that far |
| **Line** | fence, hedge, path, stepping stones, lantern string, race course | Turn the brush on and walk; turn it off to finish. Or draw it on the map | Snaps your route to nearby edges (path edges, kerbs, walls, the water's edge), smooths out your wobble, and stops at roads |
| **Area** | garden bed, pond, deck, dock, patio, court | Walk a loop, or drop a default one and drag its corners | Clears and levels the ground, follows the slope, and refuses paving and roads |

- **The ghost always shows where it will land.**
  - If your aim doesn't fit, the ghost jumps to the nearest place that does, with a pencil
    arrow.
  - If nothing fits within reach, the chip says why: "needs open water — the nearest is 300 m
    east".
- **Nudging uses big, coarse gestures.**
  - Drag to slide it along the surface.
  - Twist (or scroll) to turn it.
  - Pinch (or shift-scroll) to size it within the kind's range.
  - Drag an end handle to pick another bank or wall top. Handles jump between spots the world
    already found, so there's no fine aiming.
- **For lines and areas, your body is the brush tip.** Your feet are always exactly on the
  ground, so there's no guessing about depth. It's the same act as the world painting itself in
  as you walk.
- **The planning view.** Whenever you drag something on the ground (area corners, or a line you
  want to fix), the camera rises and looks down at about 50°. The ground then faces the screen,
  so a drag lands where your finger is.
- **The map.** You draw long lines, like a trail or a race course across town, on the atlas map.
  There the ground is flat to the screen, so a stroke is exact.
- **Too far, too steep, or not allowed.** The ghost turns red-pencil and shows the reason. It
  also suggests a kind you own that fits: "too far for a plank — your rope bridge reaches".

### Freehand gets two jobs, later

- **Decoration on your own things**, where a wobble is charm rather than structure: brush a
  stripe on your boat. Only you and your friends see it, so strangers never see freehand
  drawings.
- **Drawing on the page.** Draw a hull's side profile on an Almanac page, and the foundry fits
  the kind's parameters to your line. This is 2D to 2D, so it's precise and works fine on a
  phone.

## 6. Underneath: recipes ("vibe coding", literally)

- **A painting is a small program.** It records:
  - the family and kind;
  - its parameters and extras;
  - its anchors: a spot, a span's two ends, a line's points, or an area's outline;
  - who painted it, and when.

  Your words become that recipe, and the foundry runs it to build a real object. A boat floats
  because the recipe says "hull", not because a picture looks like one.
- **Deterministic.** The record rebuilds the same object for everyone, anywhere, forever. It's
  usually a few hundred bytes, stored per tile, the way the garden stores plants today.
- **No AI-generated meshes.** Text-to-3D fails on every count that matters here:
  - it's slow;
  - it's off-style and breaks the watercolor look;
  - physics can't read it (which part is the seat?);
  - every player would get a different object;
  - it can't be validated.

  Recipes are instant, on-style, physical and easy to share, and they can't come out ugly.
- **Grammar first.** Your vocabulary is closed (your coloured cards), so turning a sentence into
  a recipe is a job for a parser. It matches the kinds you own and reads modifiers: big, two,
  long, red, with a sail, at the back, like the one on the pier. That takes microseconds, runs in
  the browser, and works offline forever.
- **A small server-side model later, for the fuzzy cases:**
  - "something to get me across" → the floating kinds you own;
  - "beat up", "chunky", "like a Viking one" → parameters and extras;
  - typos and kids' phrasing;
  - richer game rules.

  It only ever maps words onto the same record. The wash hides its latency, and results are
  cached.
- **No model in the browser.** The GPU is the scarcest resource, and on phones most of all.
- **Traits make combinations work.** Kinds carry traits: floats, rolls, lifts, lights, holds,
  catches wind. Extras attach wherever a kind has a place for them: a lantern on a kite, a sail
  on a canoe. Physics decides whether the result works.

**Physics is the test.** Painted things are real (backlog B.1 weight, B.2 destruction):

- a plank at the edge of its reach sags;
- a canoe with the lantern hung off one side lists.

Nothing hurts you; it's funny, and it teaches. A thing that survives a storm is a thing you made
well.

## 7. The hidden layer

Every window and door looks into a real procedural interior chosen by the building's use, so
"hidden" means half-visible.

- **Scouting.** At night the lights come on and you can see what every house holds: a workshop
  with something odd on the bench, a model ship in an attic, a neon sign in a closed shop. Seen
  through glass, it's a pencil card.
- **Getting in.** To paint it from life you have to be close with no glass between you, and you
  get in by painting:
  - a ladder to the fire escape;
  - a boat to the boathouse;
  - a plank to the balcony;
  - or a favour (§8) that opens the back room.
- **Where rare variants live.** They're placed inside by the room's type: workshops in garages,
  heirlooms in attics, stock in back rooms. They're seeded per location, so your town's secrets
  aren't mine.
- **Time of day is a mechanic.** Closed shops are dark by day and lit at night. Residents leave
  for work. The harbourmaster's office is empty at lunch.
- **Nothing inside is ever taken or broken.** You paint it and leave it.

## 8. Quests come from gaps

- **Locals want what's missing.** A procedural local wants whatever their kind of place should
  have but doesn't: the diner has no jukebox; the dock lost its ladder in last night's storm; the
  boathouse has no boat; the porch has no swing.
- **The request points you to one.** If you haven't painted one from life yet, the local says
  where to find one: "there's a jukebox at the bowling alley in Long Branch".
- **Paint it for them.** In return they open the back room, show you a rare variant to paint, or
  give you paint.
- **Reputation is per town**, keyed to OSM place ids. A town that knows you shows you more of
  itself.
- **The Regulars.** These are roles, not people: the waitress, the harbourmaster, the
  hardware-store owner, the kid on the bike. They're cast per town from the building-use and
  activity tables. Their lines come from a small pool keyed on role × request.
- **The dog.** A dog follows you out on the first day. It sleeps in whatever you paint, and it's
  the one thing that's yours in every town.

## 9. Games (the creation platform)

You learn rules the way you learn kinds: by painting the places where the rules live.

| Real place (OSM) | Rules learned |
|---|---|
| basketball / tennis court | `score`, `goal`, `team` |
| running track | `race`, `lap`, `checkpoint` |
| playground | `tag`, `base`, `it` |
| park woods, hedge maze | `hide`, `seek` |
| fishing pier, marina | `catch`, `haul` |
| lifeguard stand, fire station | `rescue`, `carry` |
| mini golf, bowling alley | `sink`, `par`, `knock` |
| bus stop, post office | `deliver`, `route` |

Then you say: *"a boat race from the pier to the diner at sunset; three laps."*

You lay the course as a line of lanterns: walk it, boat it, or draw it on the map. Then you
**pin** it to the place. Anyone who comes to the pier finds it, and scores post to the pier's
card.

- **A game is data**: a place, objects, rules and a time. There's no scripting at launch.
- **Games inherit the world**: traffic, tide, weather, the lunch crowd. A race down Main Street
  at 5 pm isn't the same race at 5 am.
- **Good games travel as kits.** Others can re-pin a kit on their own street. Discovery is
  geographic: the best games near you, and the best at this kind of place.

## 10. Sharing, multiplayer, and the rules

**Stage 1: asynchronous (ship first).** Everything anyone paints stays at real coordinates in
the tile cache, as one extra record per tile. Other people's boats, bridges, lights and games
fill your neighbourhood, and ghost players replay their runs of pinned games.

**Stage 2: live, limited to one place.** A live session is a game pinned to a place, and only
the players on that block sync. Think co-op painting at your house, or a race with friends
across one bay.

**The rules**, because these are real places and real people:

- **No painting on roads, rail or runways.** None at sensitive places either: cemeteries,
  memorials, places of worship, hospitals, schools, military land. All of these come from OSM
  tags.
- **Nothing may block a real road or path.** Lines stop at kerbs, spans over paths leave
  headroom, and areas refuse paving.
- **Home privacy.** The game never shows anyone where a player lives. Your home block's
  paintings are visible only to friends you invite.
- **Out in the world:**
  - each player has a cap;
  - unused paintings fade back to pencil over weeks;
  - anyone can hide a painting from their own view;
  - reports go to review.
- **No free text on painted things at launch.** Freehand decoration is friends-only (§5).

## 11. Phones: every verb with two thumbs

Building on PC first is fine; nothing in this design needs a mouse.

- **No precision, no hover, no right-click-only, no keyboard-only.** The world finds the spots,
  handles jump between options, and anything dragged on the ground happens in the planning view.
- **The phone layout already exists.** There's a floating stick on the left, drag-to-look on the
  right, and buttons for fly, search, atlas and photo. The brush adds one button.
- **The brush replaces some keys.** It takes B on PC. The summon keys (V/B/N) and the plant key
  (R) become developer keys.
- **Touch sizing.** Tap targets are at least 44 pt, and the chip ribbon runs along the bottom.
- **Laying a line is a toggle**, so your right thumb can still look around while you walk.
- **Voice input** comes free from the phone keyboard's mic.

| Action | PC | Gamepad | Phone |
|---|---|---|---|
| Move / look | WASD / mouse | sticks | floating stick / drag (exists) |
| Paint from life | P | Y | photo button (exists) |
| Brush on / off | B | LB | brush button |
| Choose what | wheel, 1–9, or type | chip wheel on the right stick | chip ribbon; mic |
| Place | aim + click | aim + A | tap the spot, or use the centre reticle |
| Nudge | drag, scroll, shift-scroll | stick, bumpers | drag, twist, pinch |
| Lay a line | walk; click to finish | walk; A to finish | toggle, walk, toggle |
| Paint it in | click (hold and rub to speed it up) | hold RT | tap, then rub |
| Cancel / wash out | Esc / hold X on it | B / hold X | ✕ / long-press it |

Performance on phones is its own track: the boot benchmark picks a phone tier. This design adds
nothing heavy per frame:
- a ghost is the kind's own geometry in a pencil material;
- the wash is the explore bloom, applied to the object;
- recognition is one small render when you press P.

## 12. The loop at four scales

**Seconds: notice something, then paint it from life.** Something catches your eye: a boat, a
stall, something glowing in a window. Frame it and press P, and the card colours in. The
feedback is instant and the same every time: the page, the brush sound, the card.

**Minutes: hit a limit, then paint the answer.** The river has no bridge. The wall has no
stairs. It's dark. You aim, it snaps, you paint it in, and it works, or comically doesn't. Now
you're somewhere you weren't, and the new ground pays paint.

**Hours: rings out from your front door.** Your block, then your town, the county, the region,
the far coast. Each ring has a different table of kinds and places, so each ring is new
vocabulary, and the blank cards always say where to go.

**Days: the world remembers.**
- What you painted is still there.
- The game you pinned has new scores.
- Someone painted your skiff from life and learned your extras.
- A storm took the dock ladder, and the harbourmaster is asking.

## 13. Start to "end"

**The first five minutes** have to be flawless before anything else exists.

1. You wake in your own house, in watercolor.
2. You walk out. The street is pencil, and your steps wash it into colour.
3. The Almanac opens by itself, once: "Paint something."
4. The most useful thing on your street glows faintly in pencil. Usually that's a car at the
   kerb, or a boat if you live by water.
5. You press P. The page turns, and the card colours in.
6. You take out the brush. The chip is waiting. You aim at the street, and the ghost snaps into
   the lane.
7. You rub it in, in your colour, and it's real. You get in.
8. The street ends at water, or a wall, or a creek. The Almanac says: "you haven't painted
   anything that crosses this — there's a footbridge 600 m north."
9. The dog is at the corner.

**The first hour.** Your block, then your town:
- you paint the footbridge from life, then paint your own across the creek;
- you walk a fence along your yard, and lay a garden bed;
- you do your first favour;
- you make your first game (`race`, learned from the nearest track), pinned on your own street.

At Sea Bright, it's your first boat, and Rumson across the river.

**The rings.** Town, county, region. Each teaches kinds the last couldn't, each has towns that
need things, and the blank cards always point somewhere.

**The country.** A direct crossing takes 20–30 hours. The Almanac of the lower 48 has thousands
of cards and no bottom. Cities are optional deep dives where the crowd is the material: fire
escapes, subway entrances, water tanks, sidewalk sheds.

**"The end."** There isn't one you finish; there's one you leave behind. Reach the other coast
and everything you painted is still standing. Your bridges, boats and lights are the road the
next player finds. The credits are your Almanac: every card, where you painted it, and who
learned from you.

## 14. What's built, what's new, and the first three slices

**Already built:**
- the foundry: families, genomes, variants, gear, tests and budgets;
- paint-as-you-explore: pencil washing into colour;
- photo mode, the sketchbook and commissions;
- the Almanac's pencil and coloured cards (`spot`, `paintFrame`);
- the summon solvers for cars, boats and planes;
- the garden: plants that grow, saved by lat/lon;
- vehicles and driving;
- interiors by use, and see-through glass;
- site masks: water, paving, footprints, terrain, retaining walls;
- the atlas map and search;
- touch controls;
- `LifeSim.adopt` persistence;
- the harness id pass.

**New systems, in order:**

1. **Paint-to-own.** A coloured card unlocks its kind, extras and variant. Blank cards get
   where-they-live hints from the placement rules.
2. **The brush, Spot kind.**
   - Chips sorted by what you're aiming at.
   - The summon solvers generalised into per-family `place` rules.
   - The pencil ghost material, nudging, and the wash.
   - Saved by lat/lon, like the garden.
3. **Span.**
   - The gap and wall solver: banks, drops, wall tops.
   - End handles that jump between the spots the solver found.
   - Painted surfaces you can walk on.
   - A reach limit per kind.
4. **Line and Area.**
   - Walk-to-lay, with edge snapping.
   - The planning view, and drawing on the map.
   - Garden beds move here, and R retires.
5. **Paint and options.** Paint from new ground, the free home block and the cap; the options
   card; the grammar.
6. **Physics with weight and destruction** (backlog B.1, B.2).
7. **The hidden layer, favours and reputation.**
8. **Sharing.** Painted things in the tile cache, with the rules. Then games, then live sessions.

Every system ships with its touch controls and gets played on a phone-sized screen before it
passes. Everything in the immersion backlog still applies underneath: the believability items
(traffic, crossings, people, trees, hills) are the world these systems live in.

**Slice 1: the boat minute (Sea Bright, the river docks).**
1. Paint a moored skiff from life.
2. Take out the brush and aim at the river. The ghost lands on open water, bow away from the
   land.
3. Rub it in.
4. Board it and cross to Rumson.

*Passes when:*
- a new player does it in under 90 seconds, with no more than two prompts;
- it works the same with touch on a phone-sized screen;
- the boat is still there after a reload.

**Slice 2: the plank (Span).**
1. Paint a footbridge from life.
2. Aim at a creek. The plank finds both banks.
3. Walk across.
4. Aim at a creek that's too wide, and the ghost says so.

*Passes when:*
- on 20 real creeks and ditches, the solver finds both banks without a nudge at least 15 times;
- nobody falls through.

**Slice 3: the fence and the bed (Line, Area).**
1. Walk a fence along a yard edge.
2. Walk a loop for a garden bed.
3. Draw a path on the map.

*Passes when:*
- lines hug the edges;
- nothing crosses a road;
- it all works one-thumbed on a phone.

If slice 1 isn't magic, no doc will fix it. So it gets built before any of the rest is argued
further.

## 15. Open questions (settle them with a playable slice, not a doc)

- Is the very first card always the most useful thing near you, or always a car (every US street
  has one)?
- How much paint is a drop, how much does a boat cost, and how much less does flying pay? How
  big is the cap out in the world?
- Should one painting teach everything in it, or only the thing in the middle?
- Can you paint animals? Probably small ones, which then live their own lives in the ecosystem
  sim.
- Should there be a sandbox setting (everything unlocked) for kids and creators? If so, it'd be
  off by default and kept separate from the shared world.
- Do painted things weather over months, the way real paint does?

## 16. Names (working)

*Paint It Real* · *From Life* · *Plein Air* · *Lower 48* · *Wet Paint*

"Paint It Real" says the verb in a way a kid gets. "From Life" says the rule. "Plein air" is what
painters call working outdoors from real life, which is the whole game.




# Other thoughts on this
The difference between a *content generator* and a *creation platform*. The honest architecture:

## Recipes → parts with sockets + traits

Right now the foundry builds *whole* objects — one recipe per family, extras as bolt-ons (`gear`). The upgrade path that gets you to "anything is possible" without breaking the checker:

- **Parts are recipes too.** A lantern, a hull, a wheel, a sail — each painted-from-life card is a *part* card, not just an object card.
- **Sockets, not free assembly.** Each family declares attachment points: a pole takes a lantern at the top; a mast takes a sail; a chassis takes wheels. The grammar stays closed at the *primitive* level — but opens at the *composition* level. That's how "anything" stays checkable.
- **Traits make combinations work.** The doc already has this: kinds carry `floats, rolls, lifts, lights, catches wind`. A lantern + a kite = a light kite. Wheels + plank + sail = a land yacht. Nobody scripted that — the traits did.

## That's where "unscripted" actually comes from

The physics line in the doc — *"a canoe with the lantern hung off one side lists"* — is the whole answer. Players compose parts, **physics decides if it works.** A sail on a skateboard rolls. A too-heavy structure sags. Emergence = composition + physics, not authored behaviors. That's how you get players inventing things you never designed — the property every great sandbox shares.

And it folds into the loop cleanly: the Almanac teaches *parts*; your creativity is the *assembly*. Painting a lantern from life doesn't just unlock lanterns — it unlocks "light" as an ingredient everywhere you can hang it.

## Honest ordering

1. **Socket demo** — one part on one mount: lantern on a pole, sail on a hull. Proves the grammar.
2. **Physics truth** — weight/buoyancy (backlog B.1) makes composition *matter* — this is the "does it work" judgment.
3. **Open composition UI** — the hard UX: drag a part onto a highlighted socket, physics live-previews whether it'll stand/float/balance.

The constraint worth keeping: sockets > freeform joints. Kerbal-style free assembly is the powerful version but breaks your checker (and the watercolor look) — sockets keep every composition valid *and* on-style while still feeling like invention.




Right now it's "menu → spawn" — same output as a dev key. The magic isn't in *what* arrives; it's in *how it arrives and whose mark it carries*. Ranked by leverage-per-cost:

## 1. The arrival must announce itself through physics (biggest fix)

Right now the boat *appears*. It should **become real with weight**: pencil ghost → wash spreads → and at the dry moment it *drops into the world* — the hull dips into the water, a ripple rings out, it bobs up and settles. Physics is your "it's real now" tell — cheap, and it's the single most convincing signal. A boat that splashes in feels made; a boat that fades in feels spawned.

## 2. Your object should wear *your* paint

A conjured skiff currently looks identical to any moored skiff — no trace of you in it. But you have a palette system: paint earned from places. Let the object take colors from where *you* painted it — my skiff is sunset-pink because I painted it at golden hour with paint I earned at the beach. Two players' boats differ like their palettes differ. **That's "I painted a boat" vs "the world gave me a boat."**

## 3. The world reacts

Gulls scatter when it materializes. Nearby locals turn to look — a tiny "…did you just paint that?" beat. Reactions sell magic better than particles ever will, and your life-sim can already do it.

## 4. First-of-a-kind gets ceremony

The first conjured boat: camera pulls back slightly, time softens, brush sound + a held beat, the full slow wash. The twentieth: fast and casual. If every spawn is a ceremony it's annoying; if none is, the first one — the moment that sells the game — lands flat.

## 5. Provenance — the stamp that says "yours"

Hover your skiff: *"painted from a skiff at the Sea Bright docks, Sep 28."* The object remembers the real thing you learned it from. Magic is mostly *meaning* — provenance is meaning on an object.

## 6. Maybe kill the chip menu for first unlocks

Instead of *you* selecting "boat" from a menu — aim at water while holding a boat card, and the pencil ghost **appears unprompted**: "your skiff wants to exist here." The world *offering* feels magical; you ordering from a menu never does.

---

**The through-line:** magic = *anticipation* (the held breath before dry) + *your mark* (your colors, your provenance) + *the world noticing* (splash, gulls, locals). You have all three systems already — none of this is new tech, it's staging.

If one change sells it: **#1 + #2 together.** Splash-in physics + your palette on the hull. The boat lands wet in *your* colors and the water ripples — that's the screenshot that makes people get it.