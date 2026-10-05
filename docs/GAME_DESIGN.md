# Game design — Paint It Real (superseded)

> **Superseded by [`docs/GAMEPLAY_VISION.md`](GAMEPLAY_VISION.md) (2026-10-03).** Read that
> first; it is the game. This file keeps only the parts that survive: **learning from life**
> (§4a, the Almanac's cards), **the Almanac**, and **the summoning solvers** with their placement
> rules (§5), which the vision's "does it belong there?" test (§6 there) is built on. The full
> 2026-09-28 text is in git: `git show abc02db:docs/GAME_DESIGN.md`.

What happened to each part of the old design:

| Old section | Now |
|---|---|
| §1 The one line ("what you paint becomes real… for everyone") | Replaced. Everything you place is on **your own layer**, private by default (vision §6) |
| §2 The premise (the brush paints only what you've painted from life) | Kept in spirit: a card means you know how to paint it (vision §2) |
| §3 Why this engine | **Kept below**: the engine's map to the design still holds |
| §4a Paint from life: how you learn | **Kept below**, with one change: you collect by tapping a *pencil* thing within ~30 m (vision §2), not by framing a photo; colouring a place never collects |
| §4b Paint into the world, and paint as the one resource | Replaced. No paint economy: a card has no copies to run out of; your layer and home have only technical caps (vision §2, §6, §7) |
| §5 Placement: you never draw on the world | **Kept below**: aim and the world snaps; the solvers decide where a thing settles (vision §6's "things only settle where they belong") |
| §6 Recipes and the grammar | Deferred. The workbench "combine cards into variants" is later (vision §7) |
| §7 The hidden layer | Folded into rares: interiors are in colour, collectables inside stay pencil (vision §1, §2, §3) |
| §8 Quests come from gaps | Folded into commissions with real dates (vision §11, §12) |
| §9 Games (the creation platform) | Not in the current plan |
| §10 Sharing and multiplayer | Replaced: private layer, postcards and visits later (vision §6, §13) |
| §11 Phones: every verb with two thumbs | Still the rule: every verb works on a phone. The verbs are the vision's (tap to paint, hold to place) |
| §12–§13 The loop, start to "end" | Replaced by the first ten minutes and the order of work (vision §8, §15) |
| §14 The first three slices (the boat minute, the plank, the fence) | Replaced by vision §15's order. The brush prototype (`src/ui/brush.ts`) is the start of placing (vision §6, §7) |
| §15–§16 Open questions, names | Replaced by vision §16 |
| Appendix: sockets, and how a placed thing arrives | Ideas for placing (vision §6): a thing that lands with weight (a splash, a bob), your provenance on it ("painted from a skiff at the Sea Bright docks, Sep 28"), the world noticing. In git at `abc02db` |

---

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


## 4a. Paint from life: how you learn

*(Cross-references to §6–§9 point at the old text, in git at `abc02db`.)*

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
