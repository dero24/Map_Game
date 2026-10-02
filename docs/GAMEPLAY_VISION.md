# Gameplay vision: collect, explore, make it yours

Robby's direction (2026-10-01): the world is far ahead of the reasons to be in it. Flying is a dev
tool; players need a game with depth for anyone who looks for it. **The camera collects, collecting
rewards exploring, and your home holds it all.** The world stays real, painted and deterministic.

Read this before working on gameplay. Track each item in `feature_list.json` (one `in_progress`
at a time; `passing` only with evidence).

## 1. One camera action
- Painting happens in place when you take the shot. There is no separate paint window: frame,
  tap, and the view blooms into colour where you stand.
- Rename the verbs so they don't compete. **Camera** shoots and paints. **Sketchbook** holds your
  cards, collection and painted map. Drop "Brush" and "Paint" as separate buttons and words in
  the HUD, hints, toasts and docs.

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

## 6. Your dog
- You get a dog, from a mapped animal shelter (OSM `amenity=animal_shelter`) or waiting at your
  arrival.
- **It notices:** it stops and points at what you haven't painted (a heron, a cat on a porch, a
  boat coming in), and pulls toward the nearest place card or rare. Its nose is the hint system,
  with no UI.
- Other dogs greet it, so their walkers stop and chat: a frame to paint.
- **It keeps real rules:** a dated ordinance table of dog seasons and beaches, keyed by
  municipality as data, plus OSM `dog=*`. Where dogs aren't allowed, it waits at the beach
  crossing.
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
1. One camera action and the renamed verbs.
2. Start where you are.
3. Regional rares, then the Sketchbook silhouettes.
4. The dog.
5. The mobile base.
6. The portal gun.
7. Series and the bridge.

Alongside these, the visual must-fixes from `docs/earth/REVIEWER.md` round 12 (the night value
plan, the ground, far trees) still stand.
