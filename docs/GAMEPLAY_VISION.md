# Gameplay vision: collect, explore, make it yours

Robby's direction (2026-10-01): the world is far ahead of the reasons to be in it. Flying is a dev
tool; players need a game with depth for anyone who looks for it. **The camera collects, collecting
rewards exploring, and your home holds it all.** The world stays real, painted and deterministic.

Read this before working on gameplay. Track each item in `feature_list.json` (one `in_progress`
at a time; `passing` only with evidence).

## 1. One brush, one verb: paint
Today there are two buttons that both sound like painting. **Paint** frames a view and paints it
in: that's how you collect. **Brush** places things you've painted from life into the world: that's
how you create. Merge them into **one brush**, because both acts really are painting: you paint the
world to keep it, and you paint from your sketchbook to make it. The brush is always in hand, and
there's no separate window or mode.

- **Tap: paint what you see.**
  - The frame is the screen itself. The view blooms into colour where you stand: a wet wash that
    dries in a second, with a brush sound.
  - Whatever was in it (a species, a car, a rare, a building) peels off as a little card and
    flies into the sketchbook corner. That's the collect.
  - Nothing to aim and no confirm step.
- **Hold: paint from your sketchbook.**
  - A small fan of the things you've collected opens under your thumb, nearest and most recent
    first.
  - Drag one into the world and it paints itself in where you let go: a boat on the water, a
    tree in the yard, a chair in your van. That's the create.
  - Release on empty air to cancel.
- **Swipe up, or the corner where the cards land: the sketchbook.**
  - Your cards, sets and silhouettes still to find, your painted map, and the series.
  - It's a book you open, not a third tool.
- **The magic is in the feedback.** Colour spreads from the brush's touch point, cards fly into
  the corner, the sketchbook corner glows when a set is one short, and a pencil ghost shows where
  a held item will land.
- **Desktop:** the left mouse button taps, holding it opens the fan, and `Tab` opens the
  sketchbook. On phones the brush button sits under the right thumb; on desktop, everything is on
  the mouse.
- **Naming:**
  - In the HUD there is only **the brush** and **the sketchbook**.
  - "Photo", "Paint" and "Brush" stop being separate words in the HUD, hints, toasts and docs.
  - The verbs are "paint" (tap) and "paint from your sketchbook" (hold).
- **Test it with cold players.** A first-time player collects their first card within 60 s and
  places something within 3 min, without reading a hint longer than one line.

## 2. Start where you are
- On first launch, ask "Start near you?". With consent, use city-level location (browser
  geolocation or an IP lookup) to spawn at a public spot in that town: the centre, a park, a
  viewpoint. Never a precise address, and never store it.
- No consent or no fix: fall back to Sea Bright, the gold standard.
- The world itself stays deterministic: the same town for everyone who starts there.

## 3. Regional rares
- Every state, and some cities, has collectible things worth finding:
  - real everyday things people actually use there (a Maine lobster buoy, a New Mexico chile
    ristra, a Jersey diner jukebox, a Seattle ferry horn, a Wisconsin cheesehead);
  - a few funny or magical ones.
- Each item is tied to real map features (amenity, shop, historic, natural) and to time of day,
  season and weather. Rarity tiers: common, uncommon, rare, legendary.
- Placement is deterministic from the data and the seed. Photograph an item to collect it.
- The Sketchbook shows silhouettes of what you haven't found, so the depth is visible to anyone
  who looks.
- The table of items is **data keyed by region**: never place names in code (AGENTS.md
  constraint 5).

## 4. The portal gun (legendary)
- A one-off find in one strange place.
- It teleports to places you've painted (your painted map becomes your fast travel), to portals
  you've placed, or to a region whose rare you've unlocked. Exploration earns the destinations.

## 5. The mobile base: bigger on the inside
- A self-driving van you can call. Step inside and it's much bigger: a home you build.
- Anything you photograph (in town, in other houses, in shops) can be placed inside as furniture
  or decor, built by the asset foundry (`docs/ASSET_FOUNDRY.md`).
- Upgrades: the same home as a yacht, a plane or a balloon, each a new way to travel.
- Start small: the van, its interior, and placing three kinds of photographed items.

## 6. Your dog (later in development)
Not before the core loop, rares and base are solid.
- You get a dog, from a mapped animal shelter (OSM `amenity=animal_shelter`) or waiting at your
  arrival.
- **It notices:** it stops and points at what you haven't painted (a heron, a cat on a porch, a
  boat coming in), and pulls toward the nearest place card or rare. Its nose is the hint system,
  with no UI.
- Other dogs greet it, so their walkers stop and chat: a frame to paint.
- **Real rules you can break, for fun:**
  - Beaches know their dog seasons (a dated ordinance table keyed by municipality, as data, plus
    OSM `dog=*`).
  - You can take the dog on anyway. The lifeguard blows the whistle, beachgoers react, and the
    dog steals a sandwich.
  - Mischief is funny, never punishing, and maybe it earns its own rare card.
- It rides in the van, at the boat's bow and in the balloon basket, and appears in your
  paintings.

## 7. More ways to play (from the reviews)
- **Series:** the same view painted at three hours or in three seasons makes one card that
  cross-fades between them (the beach at 8:30, 13:00 and 18:30; the bridge closed, rising and
  open).
- **The bridge opens** on its real schedule (33 CFR 117). Sound one long and one short blast
  from your boat to request it. Painting it raised earns a rare card.
- **Commissions** from townspeople, the Almanac (species, cars, boats, buildings), sitting on a
  bench to let time pass, and taking the boat to Rumson.
- **Interaction where it pays off:** a few verbs done well (buy the ice cream, talk to the café
  regulars, cook in a kitchen), not every object.

## 8. A strong first ten minutes
Arrive in your own town, take one guided shot that blooms the world, get your first card, and
see a silhouette worth walking to. Flying is earned or framed (balloon, seaplane, the van's
plane form), so the ground stays the experience.

## Order of work
1. One brush (tap to paint, hold to paint from the sketchbook) and the renamed verbs.
2. Start where you are.
3. Regional rares, then the Sketchbook silhouettes.
4. The mobile base.
5. The portal gun.
6. Series and the bridge.
7. The dog (later).

Alongside these, the visual must-fixes from `docs/earth/REVIEWER.md` round 12 (the night value
plan, the ground, far trees) still stand.
