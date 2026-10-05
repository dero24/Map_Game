# Gameplay vision: you are the brush

A living document. Robby's direction, reasoned through with Claude and an outside design review
(2026-10-03; combining added 2026-10-05). Merged into the repo on 2026-10-03, replacing the earlier
version (its "one brush" and "mobile base" sections are superseded; it's in git at `abc02db`).
`docs/GAME_DESIGN.md` is superseded too, apart from the parts listed at its top. Add ideas at the
bottom under **Ideas inbox**; move them up when they're decided.

**In one line:** wherever you look, the real world blooms from pencil into watercolour. The few
things still in pencil are yours to paint and keep. What you keep, you can place: in a home that
travels with you (a van, a yacht, a plane or a balloon, much bigger on the inside) and on your
own layer of the real world.

**The design's spine:**
- **One visual language:** colour means seen; pencil means yours to paint and keep.
- **One layer:** everything you place is added on top of the real world, private to you. Nothing
  real is ever removed or changed.
- **One test:** does it belong there? Things only settle where they make sense in the real data.
  (Combining cards, section 6.5, is free everywhere; only *settling* a result in the world faces
  this test, and the home's outdoor room is the sandbox with no test.)
- **One surprise:** cards are ingredients. Anything you keep can be combined with anything else,
  with no menu and no failure, and sometimes the result is something nobody planned (section 6.5).

Flying stays a dev tool. The game is walking, driving and sailing through real places. It's
playable for anyone, with depth if you look for it.

---

## 1. The world blooms as you look

**What the player feels.** Somewhere you've never been is a pencil sketch on cream paper. The
moment it's in view, it washes into watercolour in under a second, as far as you can see. From a
balloon, the whole landscape blooms in one breath. You never walk through a grey world; you just
get the bloom, every time you see somewhere new.

**Rules**
- **The reach is the view distance.** At least as far as the old paint-as-you-explore option
  reached. Never a pencil horizon.
- **The bloom only happens on first sight.** A place, once seen, stays in colour for good.
- **Interiors are always in colour**, apart from collectables (section 2).
- **"If it's on screen, it's colour."** That includes the view through a window, in your home or
  in a moving vehicle.
- **Colouring never collects**, on foot or from any vehicle. Colour only means you've seen a
  place.
- **Night:** the bloom works the same; the colour is just night colour.

**How it works, and why it's cheap**
- **A top-down "seen" map** of the ground, a few metres per texel, like the painted map that
  already exists.
- **Marking:** each frame, the wedge of ground in front of you, out to the view distance, is
  marked as seen, with the time it was first seen.
- **Drawing:** the composite pass already knows each pixel's world position from depth. It looks
  up the seen map and blends between the watercolour and a pencil version of the same frame
  (ink lines, paper, no wash). A noisy wet edge fades in over ~0.8 s from the first-seen time.
- **It colours columns of the world, not walls.** The back of a house shares the front's ground
  patch, so it's already in colour when you walk around. The yard behind a house colours too,
  even though the house blocked it, so there are no grey holes.
- **Cost:** one texture lookup per pixel in an existing pass, plus marking a wedge into a small
  image each frame. Nearly free on phones.
- **Memory:** a whole town's seen map is a few KB, saved with your progress.
- **Determinism:** the real world itself is the same for everyone and never changes. Only your
  own things change: your seen map, your collection, your layer (section 6) and your home.

## 2. Collecting: pencil means "paint me"

In a fully coloured world, anything still drawn in pencil stands out at once. **Pencil has one
meaning: collectable, now.** No icons, arrows or minimap dots.

### The verb
- **Tap the paint button** (or tap or click the pencil thing) when you're close, from arm's reach
  to about 30 m. The thing washes into colour and lifts off as a card into the sketchbook corner,
  with a brush sound and a small bloom.
- **Too far?** The stroke falls short with a little splash on the ground: a nudge to walk closer,
  not a failure.
- **From vehicles too, when you're close** (the same ~30 m): the heron from the yacht as you drift
  past, the pencil mailbox from the van window as you roll by slowly. A plane at cruising height
  is always too high, so collecting happens on the ground and the water.
- **Collecting never removes anything from the world.** Paint a lobster boat and the real one stays
  where it is, for everyone. You get your own copy.

### The rhythm: pencil rewards wandering
- **Only a few pencil things are around at once** (3–5 nearby, a number to tune by playing), so a
  scene never looks unfinished.
- **A new pencil thing is only ever chosen out of sight**: behind you, around the corner, further
  down the beach. Nothing turns to pencil while you're looking at it. You discover them as you
  turn and walk; you can't stand in one spot tapping (no whack-a-mole). Example: you paint the
  heron on the dock; the bench beside you does *not* then switch to pencil in front of you. The
  next pencil thing is somewhere you're not looking, so it feels like discovering, not being fed.
- **An area you've just collected in goes quiet for a while**, so the next pencil thing tends to
  be a short walk away.
- **Once you've kept a kind, every other one of that kind is in colour**, so your town gets more
  colourful as your collection grows. Progress is the picture itself. (Moments are the exception:
  see below.)
- **Moving collectables** (a heron, a cat, a car pulling away, a boat heading out) stay pencil
  while they move, so you get a small, gentle chase.
- **Accessibility:** pencil differs from paint in value and texture, not hue, so it reads for
  colour-blind players. Optional outline setting.

### Deep collecting: every card is a moment
Tap stays the whole verb; the depth is in what you get.
- **Each card captures that real moment:** the light, the weather, the season and what the thing
  was doing. A heron at dawn is a different card from a heron catching a fish in the rain.
- **Moments get a gold edge:** a heron catching a fish, a boat under the raised bridge, a car with
  its headlights on at night. A kind you've already kept can turn pencil again (out of sight, by
  the usual rule) when it's doing something worth a moment card. That's the Pokémon Snap idea,
  with no scores.
- **Sets with rewards.** A "harbour set" (buoy, gull, lobster boat, dock lantern) completed
  unlocks something: a room style, a boat colour, the bridge lights. Sets give the hunt shape.
- **Collected things do something:**
  - boats, cars and planes become rideable (section 6);
  - plants grow at home;
  - fish swim in your aquarium;
  - kitchen things let you cook;
  - building facades become wall and floor finishes at home;
  - **and every card is an ingredient:** drag it onto another card to make something new
    (section 6.5). Cooking is the same gesture.
- **Every card teaches a real fact, honestly.** Facts come only from data that exists, and
  degrade gracefully:
  - almost always: the species (from map tags), the car or boat type (from the asset kit), the
    kind of building;
  - where the map has it: the year a building went up (`start_date`), its name, its history
    (linked Wikidata);
  - never made up. A card with only a species and a moment is still a good card.

**What can be collected:** anything the world builds from data or the asset foundry. Plants and
trees, birds, fish and animals, cars, boats and planes, street furniture (lamps, benches, signs),
furniture and kitchenware inside buildings, building facades, and the regional rares.

**A card means you know how to paint it.** There's no count of copies and no running out. The
only limits are your home's floor space (section 7) and a generous technical safety cap on your
layer of the world (section 6). Because cards are knowledge rather than stock, combining them
costs nothing and needs no inventory screen.

**Cards carry tags from day one.** Each card stores its kind, its moment (light, weather, season,
what it was doing) and tags derived from data (`floats`, `lights`, `grows`, `edible`...), so
combining (section 6.5) never needs a retrofit of the card format. Honesty still holds: tags come
from foundry families and map data, and a card's *fact line* is only ever real (see 6.5 for how
crafted cards are labelled).

## 3. Rares

All rares are **data, keyed by region** (state, county, city or town, by code), tied to real map
features, and placed deterministically. No place names in code.

| Kind | How often | What it is | How you find it |
|---|---|---|---|
| **Regional everyday** | Common / uncommon | Real things people use in that state, county or town (a lobster buoy, a chile ristra, a diner jukebox, a ferry horn) | Near the matching real features (marina, diner, farm stand). All seasons |
| **Scarce** | Rare | All-season, but only a handful exist: one per county, one per state | Hinted by sketchbook silhouettes and local talk |
| **Moment rares** | Rare / legendary, rare occurrences | Only collectable at a certain time, season, weather or event (the bridge raised, a storm surf, a July festival, first snow) | Outside its moment, it's just part of the coloured world. **When its moment comes, it turns to pencil** (out of sight, like every pencil thing), and that's how you know |
| **Magical and funny** | Legendary, very few nationwide | Whimsical things (the portal gun is one) | Strange places, odd hours |

- **Sketchbook silhouettes** show what's still missing in the region you're in, with one short
  hint ("at dusk", "after rain", "near the water").
- Every rare earns a card. Some unlock things: a vehicle, a room style, the portal gun.

## 4. Travel: go anywhere, but the journey is real

Should you be able to go from New Jersey to California? **Yes**, because freedom is the fantasy.
But the trip passes through real places, and you can stop at any of them. Nobody wants 40 real
hours of highway; most people do want the road-trip feeling and the surprise of where they'll
wake up.

### Driving yourself
- **Real roads, real distances**, at the world's normal clock. Everything in view blooms
  (section 1).
- **Fuel** is a gentle rhythm, not a chore:
  - a gauge, and a heads-up ("fuel in 30 miles");
  - stations are real gas stations from the map, and each stop is a reason to get out: a
    roadside rare, a diner, a view;
  - **no money:** fuel is free; the stop is the point;
  - **running empty is never a failure.** The vehicle coasts to the shoulder and limps at walking
    pace to the nearest station. Or you sleep, and wake up refuelled by a friendly passer-by.

### Self-driving: tell the map where to go
- **Pick any point on the map**, painted or not ("into the unknown" is allowed). The van plans a
  real route.
- **Stay in the cab and watch:** the world blooms as it goes by, with time-lapse speed up to the
  limit of what the streaming can keep up with.
- **Or go to bed in the back.** The trip happens in legs, and you wake up at the end of each one.
  New Jersey to California is about 6 wake-ups. Keep sleeping and you're there in a few minutes
  of real play, or get out at any stop and explore.
- **Every wake-up has a reason to stay.** The route planner doesn't just stop every 350 miles:
  - **it picks each stop for a reason**, within fuel range: near a rare you haven't found, a town
    with a place card, a viewpoint, a roadside attraction or a diner, all from the map data;
  - **each wake-up opens on an arrival card** with the hook: "Morning in Wytheville, VA.
    Something in pencil, 200 m away.";
  - **the next leg loads while you sleep**, so "keep going" is one tap with no loading wait;
  - **the road trip earns its own series card**, made of your favourite painting from each
    stop. New Jersey to California becomes one card you're proud of.
- **Sleeping means you didn't see it.** Places you slept past stay pencil on your painted map,
  shown as a thin pencil line of the route. To own a place, you were awake.

### The special vehicles: each one travels differently
These are the vehicles with your home inside (section 7).

| Vehicle | Goes | Range | Character |
|---|---|---|---|
| **Van** (first, from the start) | Any road | Medium, fuel at gas stations | Home on wheels. Can be called from anywhere |
| **Yacht** | Coasts, rivers, lakes, connected water only | Medium, fuel at marinas | Your home on the water. Fishing, the bridge, Rumson |
| **Plane** | Between real airfields | Longest and fastest | Lands only at airfields. Seeing the country from above blooms huge areas: the map-filling vehicle |
| **Balloon** | Where the wind takes it | Short and slow | The most beautiful. You choose when to go up and when to come down, not where. Lands in fields and parks |

- **Calling the van:** it drives to you on real roads. If it's far away, it arrives from around
  the nearest corner after a short wait.
- **Each special vehicle is earned in the world:** the yacht at a marina, the plane at an
  airfield, the balloon at a real festival on the calendar.
- **Collected vehicles are different** (section 6): a painted lobster boat or vintage car is for
  riding around locally. They follow the same fuel and airfield rules, but have no home inside
  and no sleep travel. Long trips are what the special vehicles are for.

## 5. Time: the clock is yours, the season is real

- **Time of day is yours.** Sleep in any bed in your home and choose: dawn, noon, dusk or night,
  or "until we arrive". No limit on how often, no penalty.
- **The date and season follow the real calendar.** Sleeping never skips to July. A summer rare
  is collected in a real summer, like the real bridge schedule, the real tide and real festivals.
  It makes seasonal rares mean something, and it gives players a reason to come back.
- **Weather:** deterministic per day and region (seeded), so it's the same for everyone. Real
  current weather is a lovely later option, as a setting: "it's raining in Sea Bright right now,
  in the game too". It would use the US National Weather Service (public domain), never
  Open-Meteo's free API, which is non-commercial.
- **Travel takes game hours.** A cross-country trip spans several sleeps, but the date stays the
  real one.

## 6. Placing things in the world: your own layer

The world should answer what you make: light the bridge, ride the boat you painted, plank the
creek. All of it lives on **your own layer** of the real world.

### Three rules
1. **You add; you never remove or change.** Everything you place sits on top of the real world.
   Real buildings, roads, boats and trees are never deleted, moved or repainted. The real data
   stays clean.
2. **Private by default.** Only you see your layer. Friends see it only when they visit you
   (section 13). Nobody's town fills with someone else's things.
3. **Things only settle where they belong.** The pencil outline uses the map data the game
   already has:
   - **boats:** on water, at docks, on beaches;
   - **cars:** on roads, driveways and parking lots;
   - **planes:** on runways, open fields, and water for seaplanes;
   - **lights and decorations:** attached to real structures: string lights along a bridge's
     railings, lanterns on a dock, flags on a pier, flower boxes on windows;
   - **trees and plants:** on grass and soil, never on the road;
   - **buildings are never placed in the world** (they'd cover real places). Building cards go
     home, as models or finishes.
   Anywhere else, the outline fades and won't settle. The rule teaches itself; no error messages.

### Three kinds of thing
| Kind | Examples | What happens |
|---|---|---|
| **Things you use** | Boats, cars, planes, bikes | **Paint one and you can ride it.** It stays where you parked it. One of each kind out at a time; calling it again brings it to you |
| **Things that decorate** | Bridge lights, lanterns, flags, flowers, benches | Stay put on your layer, attached to real places. Light up the bridge for the night it opens |
| **Things that solve** | A plank across a creek, a ladder up a dune fence, a rowboat to an island | Paint a way across and it's there, and it stays. Next time you come back, your plank is still across the creek |

### 6.5 Combine: cards are ingredients
The one place the game is allowed to surprise even its makers. Four promises: **no menu, no cost,
never fails, and some results nobody authored.**

1. **The gesture.** In the sketchbook or in the world, drag a card onto another card, or onto
   something you've placed. The result appears at once as the placing outline (the same pencil
   outline as section 6; it is a preview, not a world collectable, so it never counts toward the
   3-5 nearby pencil things). Tap to keep it; undo takes it back. There is no craft button, no
   recipe list, no workbench screen, and nothing is used up. Works anywhere, including in the van.
2. **Tags, not recipes.** Every card carries tags derived from data, never hand-written per card:
   from its foundry family and variant (a lobster boat `floats`, a lantern `lights`, a tree
   `grows`), from map tags (`edible`, `wet`), and from its moment (`rain`, `dusk`, `winter`,
   `storm`). Tag tables are data per family, like `carMix`, with no place names (hard constraint 5).
3. **Rules act on tags.** A rule says "these tags together mean this modifier", where a modifier
   comes from a closed, validated set: add a part, change a material or a shader value, or add a
   behaviour. A new card multiplies the possibilities with no new recipes. Examples:
   - `floats` + a car: a car that drives on water;
   - `grows` + a bench: moss at first, a tree through it over real time (the Grow verb's clock);
   - `lights` + a bridge, made at `dusk`: string lights that come on at dusk;
   - `rain` heron + `lights` lantern: a lantern that glows only under overcast skies;
   - cooking (section 11.2) is this gesture with `edible` tags.
4. **A wrong pairing still makes something.** The fallback is a "stuck together" collage of the two
   parts, usually funny, always valid. There is no error and no "that doesn't work".
5. **Discoveries.** About one combination in eight is a *mutation*: a bigger, stranger result.
   It is seeded by the sorted pair of (kind, moment tags), never by a card's unique id, so it is the
   same for every player and worth talking about (determinism, hard constraint 3). Mutations aren't
   announced; they land on a **Discoveries** page in the sketchbook. They are separate from rares
   (section 3), which are placed in the world.
6. **Results are cards.** A crafted card is drawn in a distinct "yours" style, keeps its
   ingredients as lineage, and can be renamed. **It has no fact line:** the honesty rule (section 2)
   is about real facts, and a crafted card claims none. It can be combined again, up to a
   complexity budget (a depth of about three) so it stays inside vertex budgets.
7. **The world answers, on your layer only.** Crafted things plug into systems that already run:
   a glowing thing draws moths, a grown thing keeps growing, a floating car can enter water,
   a sail changes what a van can do. All of it is visual or behavioural on *your* layer. It never
   alters real data and never touches anyone else's world (section 6 rule 1 and 2). Effects that
   would change the real map, such as moving where a real creek pools, happen only in the outdoor
   room's own ground.
8. **Where results settle.** A result takes the placement rule of its base thing, widened by its
   tags (`floats` + car: roads *and* water). Buildings are only ever ingredients for home items
   (a miniature, a finish), never placed in the world. The outdoor room has no placement test.
9. **Crafted vehicles.** A crafted vehicle is its own kind (so it doesn't replace your painted boat
   or car). It obeys the strictest rules of its parts (fuel, airfields, water), has no home inside,
   and has no sleep travel (section 4).
10. **Limits.** Crafted things are ordinary placed things for the layer's caps. Ones with ongoing
    behaviour (growing, glowing, attracting animals) also count against a small "alive" budget near
    you (tens, set by testing); past it they draw as still flat paintings. Results are
    **compositions of existing foundry parts plus a modifier**, never new meshes. Every modifier
    gets validation and a vertex budget in `tests/foundry.test.ts` (hard constraint 9), so no new
    foundry family is needed per combination.
11. **Paint anything (later).** A player names a thing ("lobster trap") and it is made. The AI
    writes a JSON recipe from the fixed parts library (the recipe maker, section 11.7), **not a
    mesh**, so the earlier stance against live AI mesh generation still stands. The recipe is
    validated, saved per keyword in the shared recipe table and made only once, so every player
    gets the same thing and it costs nothing after. Needs: a keyword filter (no real people, brands
    or hateful words), a daily cost cap, an on/off switch, and a proven dev-time recipe maker first.
12. **Sharing.** A combination travels as a short code in a postcard (section 13). The friend tries
    it with their own cards; if they lack an ingredient, they see its silhouette in the sketchbook.

### Everything stays, like Minecraft
- **Whatever you place stays until you remove it.** Nothing dries away or expires. Players love
  permanence, and since the layer is private, nobody else's world gets cluttered.
- **Removing is easy:** an undo right after placing, and you can take anything back into your
  sketchbook at any time. The card is never lost.
- **Your sketchbook map lists what you've placed in each area**, so finding and tidying your
  things is easy.
- **How full a place gets is the player's choice.** If someone wants Ocean Avenue covered in
  lanterns, that's their Sea Bright.

### The real limits are technical, and mostly invisible
- **Drawing on a phone** is the real limit. A Minecraft block is a few triangles merged into big
  chunks; our boat or lamp is a full 3D model drawn every frame. So:
  - **the nearest of your things are drawn in full detail** (roughly a hundred on a phone, a
    number to set by testing);
  - **farther ones are drawn as flat paintings** (the impostor system the game already uses for
    distant detail), which takes it to many thousands in an area.
- **A generous safety cap per area**, in the thousands, so a phone never chokes (crafted things
  with ongoing behaviour also have the small "alive" budget in 6.5). Most players
  will never reach it; if someone does, a gentle note suggests their home.
- **Saving is no limit:** each placed thing is about 50 bytes (which card, where, which way it
  faces). 10,000 things is about half a megabyte.

### The camp kit
A ready-made bundle for your layer: when you park a special vehicle somewhere (a beach,
campground, park or field), pop out an awning, chairs, a grill and string lights in one go. It
folds away automatically when you drive off, unless you choose to leave it set up like anything
else.

## 7. Home: one home, behind every door

### The space
- **One home, the same in every special vehicle.** The van, yacht, plane and balloon are each a
  door into it. You build once and never lose anything.
- **The outside is always the normal-sized vehicle.** The inside is as big as you make it.
- **You expand it yourself:** add a room where you want it, at the size you want, add stairs and
  floors.
- **Collecting earns space; you choose whether and how to use it.** Every handful of new cards
  adds floor area you're allowed to build. Nothing grows by itself, and a cosy van forever is a
  valid choice.
- **No claiming real houses or lots.** Real houses belong to real people at real addresses, so
  your home and yard always stay inside the vehicle's bigger-on-the-inside space. (Your layer of
  the world, section 6, is for things you place, never a home.)

### Windows keep the vehicle's view, however big you build
- A window is a placeable item.
- Each window shows the outside **as seen from the vehicle's real position and eye height, in the
  direction that window faces.** Every east-facing window in a huge hall shows the van's
  right-hand side at van height; in the yacht, water just below the sill; in the balloon, the long
  drop. You always feel you're in a small vehicle, even in a mansion.
- **The outside stays alive, parked or moving:** people walking past, gulls, boats going by, the
  sun setting. The view is never frozen.
- **How:** an all-around capture from the vehicle's position; each window samples its facing
  direction. The cost is kept down by only drawing what you can actually see, not by freezing it:
  - **no window on screen: nothing is drawn.** Most of the time you're looking at your room, so
    this is the big saving;
  - **a window on screen:** only the directions those windows face are drawn (usually one or two
    of the six);
  - **phones:** drawn smaller and at a gentler rate, about 15 times a second, which is smooth
    enough for people walking and a sunset. Desktops draw it every frame.

### What goes inside
- **Anything you've painted can be placed** with the same hold gesture you use in the world:
  furniture, kitchenware, plants, lamps, paintings, fish in an aquarium.
- **Things you collect outdoors work at home too:** a tree, a bench, a street lamp, a boat, a
  lighthouse. A full-size tree or boat looks silly in a living room, so there are two ways:
  1. **Small, as a model.** Any card can be placed as a **miniature**: the lighthouse on a shelf,
     a model of Baines Hardware, a toy-sized boat on the table.
  2. **Full size, in an outdoor room.** One room in your home can have no ceiling, just open sky
     above and grass or sand underfoot: a backyard inside your home. Plant your trees, put your
     benches and lamps around, dig a pond, park your boats at a little dock. The sky above it
     matches the real time and weather outside right now. With enough space, people will build
     whole little towns from their collection.
- **Materials from the world:** painting a building's facade gives you its finish (clapboard,
  brick, shingle, colour) as a wall or floor option.
- **Phones stay smooth the same way as in the world:** nearest things in full detail, farther
  ones as flat paintings, within the asset foundry's vertex budgets.

### What the home is for
- **Sleep** (section 5): passing time, travelling, ending a session gently.
- **Your gallery:** your paintings hang on the walls, labelled with the time and place.
- **Combining** (section 6.5) has no workbench: it is a gesture that works anywhere. Home is just
  where you have the room (and the outdoor room's open ground) to see the results.
- **Living things:** plants, fish, the dog later.

## 8. The first ten minutes

1. **You wake up inside the van**, a small, nearly empty home: a bed, one window, the sketchbook
   on the table.
2. **The game asks "Start near you?"**
   - With consent, it uses city-level location (browser geolocation or an IP lookup) to start at
     a public spot in your town: the centre, a park, a viewpoint.
   - Never a precise address, and the location is never stored.
   - With no consent or no fix, you start in Sea Bright.
3. **You open the door and step out.** The town blooms into colour as you look around.
4. **A pencil thing nearby:** tap, and it paints in and flies into your sketchbook as your first
   card.
5. **Back in the van**, place it. Your home has its first thing. The map shows a silhouette worth
   walking to.

## 9. The portal gun (legendary)

- A one-off find in a strange place.
- It opens a portal to any place you've painted, to portals you've placed, or home.
- It's the instant version of sleep travel, earned late.

## 10. The dog (later in development)

- **Finding it:** adopt it from a mapped animal shelter, or it's waiting when you arrive.
- **It notices:** it points toward pencil things you haven't painted. Its nose is the hint system.
- **Other dogs greet it**, so their walkers stop and chat.
- **Beach rules you can break, for fun:**
  - beaches follow their real dog seasons (as data);
  - take the dog anyway: the lifeguard whistles, people react, the dog steals a sandwich;
  - funny, never punishing, maybe a rare card.
- **It comes along everywhere:** it sleeps at the foot of the bed, rides with its head out of the
  van window, stands at the yacht's bow and in the balloon basket, and appears in your paintings.

## 11. Fun on your own

A great single-player game makes a great multiplayer one. The systems above are the bones; this
section is what you actually do minute to minute, and why you keep going for 20 hours. Most of
it is built once and then works everywhere, because the map already knows where every court,
pier, beach and diner is.

### 11.1 Moving is fun in itself
You'll spend most of your time moving, so moving has to feel good:
- **A small hop:** over a low fence, onto a dock, off a step. No platforming, just freedom.
- **Wade and swim** wherever the map says beach or water. Waves push you gently; you float.
- **Surf** at mapped surf spots when the seeded waves are up: paddle out, catch one, ride it in.
- **Bike and skateboard** (collected like any vehicle, on the existing vehicle code).
- **Kayak or paddleboard** on rivers, lakes and bays.
- **Sled** on hills when the seasons system says snow.

### 11.2 Things to do at real places
Each kind of mapped place gets one small, cozy activity, built once and working at every one of
them in the lower 48:

| Place (from the map) | Activity |
|---|---|
| Basketball courts | Shoot hoops |
| Piers, riverbanks, docks | Fish. The fish become cards and swim in your aquarium |
| Mini golf courses | Play the real course |
| Rivers and lakes | Skim stones |
| Ice cream shops, diners, cafés | Order, sit, watch the street go by |
| Tennis courts, beaches | A rally against a friendly local; beach volleyball |
| Bowling alleys, arcades | A frame or a game |
| Parks with picnic tables | Sit, eat, let time pass |
| Kitchens (any home or your own) | Cook: combine `edible` cards (section 6.5) |

- **Short and cozy:** each activity is a minute or two, with no fail state, and a card for doing
  it well.
- **Start with three:** fishing, shooting hoops and sitting at the ice cream shop. Then the rest.

### 11.3 A reason to cross the country: the old sketchbook
- Early on you find an **old sketchbook** in the van, full of watercolours of real places across
  America by someone who travelled before you.
- Each page is a riddle with a clue: "where the river meets the bay, at dawn", "the tallest
  thing in a flat land, after rain".
- Find the place, paint the same view at the right time, and the page completes: a short
  margin note from the old painter, and a new page further west.
- **Pages are data, not code:** each is a place, conditions and a clue, keyed by region, chosen
  from real landmarks and viewpoints, so the story can grow without hard-coding places.
- A light story with no cutscenes. It gives the road trip a direction without taking away
  freedom, and the ending (whose sketchbook it was) is a reason to finish.

### 11.4 People who remember you
- **A few named regulars per town** (the café owner, the lifeguard, the man always fixing his
  boat): procedural, seeded per place, the same for everyone.
- **They remember you:** what you painted, what you gave them, how long since you visited ("you're
  back, did you catch the heron?").
- **They give commissions** with conditions ("paint my boat at sunset?") and small gifts (a
  card, a recipe, an outfit).
- **A travelling friend** you keep running into at rest stops across the country, whose story
  unfolds a little at each meeting.

### 11.5 Small optional skill challenges
- Land the balloon on a target, dock the yacht neatly, glide the plane in smoothly, surf a long
  wave, a clean shot in mini golf.
- Commissions with conditions ("the bridge, raised, at sunset").
- Never punishing: doing it well earns a gold card or a small reward.

### 11.6 "Today in your town": every session has something
When you open the game, a small card shows today:
- what turned to pencil because of today's weather, time or season;
- today's events (section 11.7): the farmers market, a festival, the fireworks, low tide;
- a regular's commission.

A 10-minute session always has something to do; a long session has a list.

### 11.7 Events: the world's own calendar
**Research (2026-10-03): there is no free, open, commercial-OK API that lists every local event
everywhere.**
- **Ticketmaster's Discovery API** is free, but its terms forbid deriving revenue from it and
  limit caching, and it only covers ticketed concerts and sports.
- **Eventbrite** removed public event search in 2020.
- **PredictHQ** aggregates millions of events (festivals, community, sports, holidays) but is a
  paid enterprise service with no public pricing.

**So events are mostly generated, from rules plus open data: free, the same for everyone, and
deterministic:**

| Source | Examples | Data |
|---|---|---|
| **Calendar rules** (computed) | July 4 fireworks over every town's park or beach; Halloween trick-or-treaters in residential streets; December lights on houses; Memorial Day beaches opening; Thanksgiving parades downtown | Holiday dates are fixed or computed |
| **Recurring markets and opening hours** | Farmers markets on their real days, shops open or closed by the clock | USDA farmers market directory (public); OSM `opening_hours` |
| **Famous annual festivals** | A town's well-known festival in its usual week | Wikidata recurring events (CC0) |
| **Nature's calendar** | Low and high tide, sunrise and sunset, full moon, meteor showers, bird migrations, fall colour, first snow | NOAA tides (public domain); computed astronomy; seasons system |
| **Weather** | Storm surf, fog, snow days, rainbows after rain | Seeded weather (NWS live weather as an option later) |
| **Sports seasons** | Friday night high school football lights, Little League in spring | Rules by season and mapped fields |

- A paid service like PredictHQ could add real local events later, if the game earns money and
  its licence allows.

**Assets and animations for events, on the fly:** the asset foundry already grows things from
recipes, so each event is an **event kit**: a set of recipes plus placement rules.
- Examples: market stalls and awnings (already exist), festival tents and string lights,
  fireworks (particles and sound), parade floats and a marching band, pumpkins and jack-o'-lanterns,
  Christmas lights on real house outlines, bleachers and field lights.
- **Placement uses the real map:** fireworks over the mapped park or beach, the parade down the
  main street, stalls on the mapped market square.
- **Each event brings its own collectables:** a July 4 sparkler, a festival ribbon, a parade
  float card. They turn to pencil only while the event is on, so they're natural moment rares.
- **Generated, not downloaded:** variety comes from seeds, so every town's festival looks a
  little different. Recipes are written once and then grow endlessly (see "The recipe maker"
  below). Generating 3D models (meshes) with AI live in the game is not recommended: per-use
  costs, an inconsistent style and unclear licences. (Recipes as data are different: see "Paint
  anything" in section 6.5.)

**The recipe maker: keyword → recipe** (Robby, 2026-10-04)
A recipe is a short set of building instructions for the asset foundry: which simple parts,
how they fit together, and how much each can vary (a pumpkin: a squashed ball with 8–12 grooves,
orange from pale to deep, a short bent stem, 25–60 cm). Today the agents write each recipe in
code by hand. To make hundreds of things quickly:
1. **A parts library** for recipes: boxes, balls, tubes, cones, flat cards, plus the foundry's
   existing tricks (grooves, tapering, golden-angle spirals, Fibonacci counts).
2. **A recipe format as data** (JSON), so a recipe can be written without new code.
3. **A dev tool where AI turns a keyword into a recipe:** "festival tent", "lobster trap",
   "parade float". It writes the JSON from the parts library.
4. **Automatic checks:** the same validation every foundry recipe passes (finite, sized,
   grounded, within the vertex budget).
5. **A preview page** (like `/kit.html`) to look at each result from several seeds, keep the
   good ones and tweak the rest.
6. **Saved in the shared recipe table**, keyed by keyword, so every player gets the same thing
   and it costs nothing at runtime.

When the AI writes recipes:
- **During development (the main way):** batches of keywords for event kits, regional rares,
  furniture, activities. Cheap, consistent in style, reviewed, and fully owned.
- **Live in the game (later, as "paint anything", section 6.5):** a player names a thing and
  it's made. It costs a little per new keyword and can come out odd,
  so results are validated, then saved and shared so each keyword is only made once.

### 11.8 Self-expression
- **Outfits** collected on your travels (a fisherman's sweater in Maine, a cowboy hat in Texas).
- **Paint jobs for the van**, and your other vehicles.
- **A painting style per painting:** palette, brush, paper. The card keeps the style you chose.

### 11.9 Long-term goals
- **Complete a state's painted map**, and earn its state card.
- **A masterpiece per region:** one big painting combining your best cards from there.
- **Your gallery becomes a little museum** that townspeople visit and comment on.
- **The 48-state journey card,** and the old sketchbook's last page.

### 11.10 Music and sound
- **Soft music** that changes with region, time and weather (a calm, sparse, Minecraft-like
  feel), made with the same in-browser synthesis as the game's sounds. Robby's **Sound Studio**
  (`for_mapgame/sound-studio`) makes the themes as small recipes the game plays.
- Music fades for real-place moments: the bell buoy, the gulls, the bridge horn.

### 11.11 Smaller things
- **Controller support** (gamepad), alongside mouse, keyboard and touch.
- **Weather as play:** splash in puddles, snowball fights with townspeople, kites on windy beaches.
- **Far-off things catch your eye:** a hot air balloon on the horizon, fireworks in the distance,
  a lighthouse beam, so you know where to go next.

### 11.12 Earlier ideas that still stand
- **Series:** the same view painted at three hours or in three seasons makes one card that
  cross-fades between them. The road trip card (section 4) is one too.
- **The bridge opens on its real schedule.** Sound one long and one short blast from your boat to
  request it.
- **Commissions** from townspeople, and the Almanac (everything you've kept, by kind).
- **Interaction where it pays off:** buying the ice cream, talking to the café regulars, cooking
  in a kitchen.

## 12. Stakes without failure

The game is gentle: no damage, no losing, no punishment. But with zero stakes, collecting can
feel weightless by hour 20. Weight comes from **things you can miss**, never things that hurt you:
- **Moments are fleeting.** The heron catches the fish once; the bridge is raised for ten
  minutes. Miss it and it's gone until next time.
- **The real calendar.** Miss the July festival rare and it's back next July. It hurts only
  emotionally, which is the right kind.
- **Weather and wind change your plans, not your progress.** A storm sends the yacht back to the
  harbour; the balloon lands somewhere you didn't expect.
- **Commissions with real dates:** "paint the lighthouse before the festival on Saturday."
- **Your own story.** The home and the gallery show where you've been, so cards feel earned.

Keep an eye on this in playtests. If collecting starts to feel weightless, add more fleeting
moments, not fail states.

## 13. Friends (later)

- **Postcards:** send a painting to a friend's game. When they open it, they can travel to that
  spot at that time.
- **Recipes:** a combination can travel in a postcard as a short code (section 6.5).
- **Visits:** since the real world is the same for everyone, a friend can step into your home or
  walk a town with you, and see your layer while visiting.
- **An optional, joinable shared world** comes much later; it needs accounts and moderation.

## 14. Edge cases, decided

| Case | Decision |
|---|---|
| Colouring from any vehicle (or on foot) | Never collects; it only marks the place as seen |
| Collecting from a vehicle | Allowed when close (~30 m): yacht deck, van window. Never from a plane at cruising height |
| Collecting a boat, car or anything else | The real one stays in the world for everyone; you get your own copy |
| A new pencil thing appearing | Only out of sight, never while you're looking. Just-collected areas go quiet for a while |
| Pencil collectable inside a building you're in | Stays pencil; everything else inside is colour |
| Tap a collectable from too far | The stroke falls short with a splash on the ground. No penalty |
| Collectable drives or flies away | Gentle chase; it may come back (seeded routes) |
| Two players and the same item | Everyone collects their own |
| Placing something where it doesn't belong | The outline fades and won't settle |
| Placing a building in the world | Not possible; building cards go home as models or finishes |
| Placed things over time | Everything stays until you remove it, like Minecraft. Nothing dries away |
| Lots of placed things in one area | Nearest drawn in full, farther as flat paintings. A safety cap in the thousands; past it, a gentle note suggests your home |
| Fly (dev tool) | Marks the seen map like anything else; dev only |
| Self-drive while awake | Everything you see blooms |
| Self-drive while asleep | The route stays a pencil line on your map |
| Out of fuel | Coast, limp to a station, or sleep and wake refuelled. Never stranded |
| Collected car across the country | Possible, with fuel stops, but no bed and no sleep travel: long trips are what the van is for |
| Boat to a place with no connected water | The route ends at the last reachable marina, with a note |
| Plane to a place with no airfield | Lands at the nearest airfield; the van is "already there" (your home is behind every door) |
| Call the van while it's far away | It arrives from around the nearest corner after a short wait |
| Seasonal rare, out of season | In colour, part of the world; the silhouette says when |
| Sleep to skip the season | Not possible: the date is real |
| Huge home with many windows | Each window shows the vehicle's real view in its facing direction |
| Big painted things at home (trees, boats, lighthouses) | As a miniature, or full size in an outdoor room (a no-ceiling backyard inside your home) |
| A card fact the data doesn't have | Left out. Cards never make facts up |
| Combining two cards that "don't go together" | Always makes something: a stuck-together collage. No error |
| Crafted card and the honesty rule | Crafted cards carry no fact line and are labelled "yours" |
| A crafted effect that would change the real world | Never: effects are on your layer only; real-map-like changes only in the outdoor room |
| Crafted vehicle (a car that floats) | Its own kind; strictest rules of its parts; no home inside, no sleep travel |
| Combining a building card | Building is an ingredient for home items only (a miniature, a finish), never placed in the world |
| Mutation results across players | Same for everyone (seeded by kind + moment tags, not card ids) |
| Too many crafted things behaving near you | A small "alive" budget; past it they draw as still flat paintings |
| Combining result placed where it doesn't belong | The usual outline fades and won't settle; the outdoor room has no test |
| Cleared browser data | Progress lives in the browser for now (IndexedDB); account sync and export later |

## 15. Order of work

**Foundation first.** No gameplay matters if the world doesn't load or looks broken. The
gameplay order below starts only once the foundation tier in section 17 is passing. The one
exception: a small, throwaway prototype of the bloom (step 1) may run alongside, to prove the feel.

Each gameplay step builds what the next one needs.

1. **The bloom:** seen map, pencil-to-colour composite, first-sight wash. Prove the feel first.
2. **Pencil collecting:** tap to paint, the card flying into the sketchbook, the out-of-sight
   rhythm, cards as moments. Pencil on 3–5 objects is contained work: swap those objects to a
   pencil material, and draw a chosen one from a batch (cars, trees) on its own. One small
   "pencil overlay" system, testable on its own, with no change to the shared shaders.
3. **The van-home start and placing at home:** wake up in the van, "Start near you?", step out.
   Placing your first card at home builds the placing tools (the hold gesture, the pencil
   outline, the "does it belong here" check) that the world version reuses. Cards already carry
   tags (section 2), and a first five-rule **combine prototype** (drag card onto card, outline
   preview, tap to keep) runs here, at home, to see whether results surprise before building more.
4. **Moving is fun (11.1):** the hop, wading and swimming, the bike. Surfing, kayaks and sleds
   follow later.
5. **Placing things in the world:** your layer, ride what you've painted, light the bridge, plank
   the creek, everything kept (near in full, far as flat paintings), the camp kit.
6. **Combine (6.5):** the full tag rules as a data table, mutations and Discoveries, crafted things
   in the world, the "alive" budget. The outdoor-room sandbox joins in step 10, and "paint anything"
   comes after step 11.
7. **Things to do at real places (11.2)**, starting with fishing, hoops and the ice cream shop,
   plus **a few regulars who remember you (11.4)**.
8. **Regional rares** as data, sketchbook silhouettes, sets, then moment rares, with the
   **events calendar (11.7)** and **"today in your town" (11.6)**.
9. **Van travel:** call it, drive it, fuel, self-drive, sleep legs with planned stops and arrival
   cards, plus **the old sketchbook (11.3)** and the travelling friend.
10. **Growing the home:** rooms, windows (the all-around capture), miniatures, outdoor rooms, plus
   **self-expression (11.8)**.
11. **The other special vehicles:** yacht, plane, balloon, each earned in the world, plus their
    **skill challenges (11.5)**.
12. **The portal gun.**
13. **Series, the bridge, postcards and long-term goals (11.9).**
14. **The dog.**
15. **Friends and visits.**

Alongside from step 2: **music (11.10)**, made in Sound Studio, and the smaller things (11.11)
as they fit.

The visual must-fixes from `docs/earth/REVIEWER.md` round 12 are in the foundation tier
(section 17), ahead of all of this.

## 16. Open questions (decide by playing)

- How many pencil things nearby: 3, 5 or more? How long does a just-collected area stay quiet?
- The window view rate on phones: is about 15 times a second smooth enough?
- How many of your placed things a phone draws in full detail, and the safety cap per area.
- Fuel range: 300 or 400 miles? How far apart planned stops sit.
- How much floor space a handful of cards earns.
- Real weather or seeded weather?
- The world clock rate while awake: real time, or faster?
- How many tags per card, and how many rules before combining feels rich rather than random?
- The mutation rate (about 1 in 8?) and the depth limit for combining crafted cards.
- How big the "alive" budget for behaving crafted things is on a phone.
- Can you paint a person? (Probably as a portrait card only, never a collectable "thing".)

## 17. When this merges into the repo: reprioritise for the real goal

The end goal is the whole lower 48 loading everywhere, looking good everywhere, on PC and phone,
and then a game on top. `feature_list.json` (62 items, many stale, priorities not in order;
currently led by `traversal-spike`) must be **re-ranked against the current state of the game**,
not just appended to. The agent doing the merge should:

1. **Audit first, with evidence.** Load a spread of real towns across the lower 48 (coast,
   inland, mountains, desert, plains, city, suburb, rural; include Shrewsbury NJ) on desktop and
   phone settings, with `?at=` deep links. Record per town: did every tile load, is the ground
   land (not water), do trees, buildings and heights look right, frame time, errors. Use the
   montage tools (`tools/capture.mjs`, `tools/mobile-check.mjs`) and keep one montage per
   region.
2. **Re-rank `feature_list.json` into tiers**, highest first. Mark stale items `blocked` or
   superseded with a reason; keep history and evidence. Only one `in_progress`.

### Tier 0: the world loads, everywhere
- **Every tile loads, or falls back gracefully.** No missing land, no land drawn as water, no
  holes. One reported case to include in the audit: Shrewsbury NJ, where the ground rendered as
  dark blue with grass on it. (The white on the tree tops there was the snow setting, which is
  fine.)
- **A lower-48 load audit in the test suite:** a fixed list of towns that must load with land,
  roads, buildings and trees, so regressions are caught.
- **Worker costs under control** (the Cloudflare plan is paid now): cache-hit rate, request
  counts and the R2 cache checked and kept efficient.
- **Phones:** the `phones` item finished: boots, holds frame rate, says why if it can't.
- **No glitches:** the existing `playtest-suite` (walk, drive, teleport, stream, doors) built and
  run on every push.

- **Commercial-safe infrastructure, now** (Robby, 2026-10-03: get it right at the start, not
  before launch):
  - **Replace the public Photon server** (`src/ui/geo.ts`: the map search, arrival cards and
    sketchbook captions; komoot's free server is for light use only). Build our own lower-48
    place index from public-domain US data: **USGS GNIS** place names (towns, parks, lakes,
    landmarks) and the **Census gazetteer** (cities, towns, counties), baked by a script and
    served from R2 by the worker. Street names keep coming from the loaded world. Reverse
    lookups ("Monmouth Beach, NJ") use Census place and county boundaries. No street addresses
    (privacy). Offline still falls back to the loaded world, as today. Remove Photon entirely.
  - **Weather stays seeded; never Open-Meteo's free API** (non-commercial). If "real weather" is
    added later, it's an optional setting using the **US National Weather Service API**
    (`api.weather.gov`, public domain), fetched by the worker once per area per hour and cached,
    with seeded weather as the fallback.
  - **A licence check for every data source and service in use**, recorded in the licence
    column of `docs/DATA_SOURCES.md`: commercial use allowed or not, credit needed, share-alike.
    Anything that doesn't allow commercial use gets swapped now (the "needs a closer look" list:
    the Photon public server, Open-Meteo's free API, per-agency transit feeds, per-city tree
    inventories, Recreation.gov's API terms; Mapillary's research datasets such as Vistas are
    never used).
  - **A credits screen** listing every source with its required credit, plus the always-visible
    HUD credits (OpenStreetMap, and Mapillary once used).

### The real-world comparison loop (how the agent checks "looks right")
A repeatable test the agent can iterate on, comparing the game with real street-level photos:
1. **Sample spots, deterministically.** A seeded set of spots in every state, spread across
   kinds of place (downtown, suburb, rural road, coast, mountain, desert), plus named checks
   like Baines Hardware and Shrewsbury. The same spots every run, so results are comparable.
2. **Fetch a real photo for each spot**, with its exact position, compass heading and field of
   view. Use **openly licensed** street-level imagery: **Mapillary** (CC BY-SA 4.0, free API with a
   token) first, KartaView as a fallback. **Not Google Street View**: its terms don't allow this
   kind of use. NAIP aerial photos (public domain, already used for roof colours) give a
   top-down comparison too.
3. **Render the game from the same spot**: same position, height, heading and field of view, at
   the photo's time of day where possible.
4. **Put each pair side by side in one montage per state** (the AGENTS.md rule: review montages,
   never single shots), with credit for every photo.
5. **Score each pair**:
   - automatic checks: did the land load (not water), roughly how much of the view is sky,
     ground, buildings and trees in each image, the building count and heights in view, the
     road in the right place;
   - an AI reviewer's comparison: "the real street has two-storey brick fronts, the game has
     one-storey white boxes", ranked worst first.
6. **Fix the worst, re-run, compare scores.** The score history shows whether each change made
   the lower 48 more like itself or less.

Practicalities:
- Photos are cached in a git-ignored folder, never committed; only the scores and a small
  list of spots go in the repo.
- Cheap load checks (Tier 0) run on every push. The photo comparison runs per milestone or
  nightly, so it doesn't eat API limits or the Cloudflare budget.
- Some spots have no street photo nearby; those use the aerial comparison only.
- **Licence (checked 2026-10-03; see "Mapillary licence" below):** this is internal development
  testing, which Mapillary's terms allow for commercial products. The photos never ship in the
  game. Never try to unblur faces or plates in them (the terms require that).

### Tier 1: the world looks right, everywhere
- **The real-world comparison loop** (above) built first, so every Tier 1 fix is measured
  against real photos.
- **Measured building heights on every device** (precomputed LiDAR; see the heights handoff):
  Baines Hardware and Monmouth Beach houses the same on phone and PC.
- **Place parity:** towns look like themselves across the lower 48 (`place-parity`).
- **Mapillary's detected objects as a data source** for the small things the map often misses.
  Besides photos, Mapillary publishes objects its computer vision found in street photos, as
  free vector tiles (an access token is needed; zoom 14 only):
  - `mly_map_feature_point`: street lights, utility poles, fire hydrants, benches, bins,
    crosswalks, manholes and similar, each with a position and first/last-seen dates;
  - `mly_map_feature_traffic_sign`: traffic signs by type.
  How to use it:
  - it slots into the existing **`street-furniture-nodes`** item (currently blocked): lamps,
    poles, hydrants and signs where they really are, with OSM first and Mapillary filling gaps;
  - **fetched and cached by the tile worker in R2, never per player.** The tile limit is 50,000
    requests a day per app, so the worker bakes it into tiles once;
  - **attribution:** the Mapillary logo linking to mapillary.com, in the HUD next to the
    OpenStreetMap credit (what the terms require for data used through the API or tiles);
  - **graceful without it:** places with no Mapillary coverage use the seeded placement as
    today;
  - **public things only:** an allowlist of public street-furniture classes (street lights,
    poles, traffic lights, hydrants, manholes, storm drains, benches, public bins, bike racks,
    parking meters, crosswalks, signs). Nothing on private property and no private data.
    **Home mailboxes are left out** (Robby, 2026-10-03): one stands on a home's own property and
    marks a private home. Mapillary's mailbox class can't tell them from the public blue USPS
    collection boxes, so it isn't used at all. The USPS boxes come from OpenStreetMap's
    `amenity=post_box`, and the game's own kerbside mailboxes still line the streets;
  - **only recent, repeated sightings:** skip objects whose last-seen date is old or that were
    seen only once, so only things that are really there get placed;
  - **Robby's decision (2026-10-03): use it in the game**, crediting every data source. Build it
    behind an on/off switch anyway, so towns can be compared with and without it. A short
    confirmation email to Mapillary before a paid launch is optional insurance.

### Mapillary licence (checked 2026-10-03; not legal advice)
What Mapillary's Terms of Use say (mapillary.com/terms):
- **Images and user content are CC BY-SA 4.0**: free to use, with credit, and anything made from
  them is shared under the same licence.
- **Commercial use is allowed only for** "improvement, training, and development of products,
  services, maps, studies, platforms, websites, applications, software, algorithms, datasets,
  solutions, or technologies", or for services done for clients (section 12).
- **API apps must "materially supplement"** what Mapillary offers, not just redistribute it
  (section 11). A game easily qualifies.
- **Attribution:** for extracted data through the API or vector tiles, the Mapillary logo linked
  to their homepage (section 11).
- **Not allowed:** use for real-world, real-time navigation or route guidance (section 5). The
  van's in-game route planning is fine; never market the game as a navigation tool.
- **Privacy:** safeguards against unblurring or re-identifying people.

What this means for a paid game:
- **The photo comparison loop is clearly fine.** It's development and testing; nothing from
  Mapillary ships.
- **Using detected objects in the shipped game is probably fine but not certain.** "Development
  of applications" plausibly covers a commercial game, but the terms don't name detection data
  specifically, and share-alike might apply to anything derived from the photos (such as the
  cached object positions). Mapillary is owned by Meta, and the terms can change.
- **Decision:** Robby reads "development of applications" as covering the game and will use it,
  crediting every source. It's behind a switch, and the game works fully without it. An email
  to Mapillary confirming the use before a paid launch is optional insurance.
- **The same care applies to every data source before monetising:**
  - OpenStreetMap: ODbL, credit required, and share-alike on the derived database;
  - OpenFreeMap / OpenMapTiles: their licences;
  - Overture;
  - USGS 3DEP LiDAR and NAIP: US government, public domain.
  Keep `docs/` data-source notes up to date with each licence.
- **The public places the game needs** (table below), from OpenStreetMap first and public US
  government data to fill gaps. Several are needed by the gameplay (airfields for the plane, gas
  stations for fuel stops, campgrounds for the camp kit, marinas for the yacht, rest areas for
  sleep stops, shelters for the dog), so they come before Tier 2. Full catalogue:
  `docs/DATA_SOURCES.md`.

  | Place | Main data (OpenStreetMap tags) | Extra public data | Needed for |
  |---|---|---|---|
  | Parks, playgrounds, gardens | `leisure=park/playground/garden` | PAD-US, NPS boundaries | Walking, rares, camp kit |
  | National and state parks, forests, nature reserves | `boundary=national_park/protected_area`, `leisure=nature_reserve` | PAD-US, NPS, USFS | Scenic stops, the balloon |
  | Beaches | `natural=beach` | — | Rares, the dog's beach rules |
  | Trails and viewpoints | `highway=path/footway`, `route=hiking`, `tourism=viewpoint` | NPS/USFS trails | Exploring, series cards |
  | Campgrounds | `tourism=camp_site/caravan_site` | Recreation.gov (RIDB) | The camp kit, sleep stops |
  | Airports and airfields | `aeroway=aerodrome/runway/taxiway/helipad/terminal` | FAA airport data, OurAirports | The plane (not drawn in the game yet) |
  | Gas stations | `amenity=fuel` | — | Fuel stops |
  | EV chargers | `amenity=charging_station` | DOE AFDC | Fuel stops |
  | Rest areas | `highway=rest_area/services` | — | Sleep-leg stops |
  | Marinas, ferry terminals, boat ramps, piers | `leisure=marina/slipway`, `amenity=ferry_terminal`, `man_made=pier` | NOAA charts | The yacht, ferries |
  | Lighthouses | `man_made=lighthouse` | — | Landmarks, rares |
  | Train and bus stations | `railway=station`, `amenity=bus_station` | GTFS | Life, travel |
  | Museums, galleries, zoos, aquariums, theme parks | `tourism=museum/gallery/zoo/aquarium/theme_park` | Wikidata | Rares, interiors |
  | Historic sites and monuments | `historic=*` | National Register of Historic Places | Card facts, rares |
  | Libraries, schools, town halls, post offices | `amenity=library/school/townhall/post_office` | NCES schools | Life, commissions |
  | Hospitals, fire and police stations | `amenity=hospital/fire_station/police` | HIFLD | Life |
  | Places of worship | `amenity=place_of_worship` | — | Landmarks |
  | Animal shelters | `amenity=animal_shelter` | — | The dog |
  | Diners, cafés, ice cream, shops, farm stands | `amenity=restaurant/cafe/ice_cream`, `shop=*` | Overture Places | Rares, interiors |
  | Sports fields, stadiums, golf, pools | `leisure=pitch/stadium/golf_course/swimming_pool` | — | Life, rares |
  | Farms, orchards, vineyards | `landuse=farmland/orchard/vineyard` | USDA Cropland Data Layer | Regional rares |
  | Festivals and events | (no good open source) | Wikidata recurring events, hand-made data per region | Moment rares, the balloon |

  Only public places and public data, never private details. US government sources are
  generally public domain; check each licence when adding a source (the same rule as
  Mapillary).
- **The REVIEWER.md round 12 must-fixes:** the night value plan, the ground, far trees.
- **Phone sharpness and look** checked on real devices after the new defaults.
- **Interiors** at real scale (`interiors-rooms`, `city-doors`).

### Tier 2: the game (section 15's order)
The bloom, pencil collecting, the van-home, fun movement, placing things, combining cards,
activities at real places, rares and events, travel and the old sketchbook, and the rest.

### Tier 3: polish and later
Older items that don't serve tiers 0–2 now (vehicle polish, cross-gable roofs, a second baked
hero region and similar) stay on the list at low priority, not deleted.

### Doc housekeeping (done 2026-10-03)
- ~~Replace `docs/GAMEPLAY_VISION.md` with this doc~~ (the "one brush" and "mobile base" sections
  are superseded).
- ~~Put a "superseded by GAMEPLAY_VISION.md" banner on `docs/GAME_DESIGN.md`~~. It keeps the parts
  that survive: learning from life, the summoning solvers, the Almanac.
- ~~Point `docs/agent/gameplay.md` at this doc for the game's verbs.~~
- ~~Keep the `AGENTS.md` pointer to this doc~~ ("read before any gameplay work").

## Ideas inbox

Add new ideas here, with a date.

- **2026-10-05, combining.** Cards as tagged ingredients, drag-to-combine, mutations and a
  Discoveries page: now designed in section 6.5. Still open: how "paint anything" is gated, and
  whether crafted things should ever be shareable as placed objects (today only recipe codes travel).
- **2026-10-05, moment as modifier.** A card's moment (rain, dusk, winter) is a crafting input, so
  the same two kinds combined at different times give different results. Test early in the prototype.
- **2026-10-05, the dog and crafted things.** The dog could react to crafted things (sniff a glowing
  one) without pointing at them as pencil. Later, with the dog.
- **2026-10-05, regional ingredients.** Rares and regional everyday cards (a lobster buoy, a chile
  ristra) carry regional tags, so combining makes places feel different from each other.
