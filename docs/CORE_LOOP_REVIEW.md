# Core loop review — "paint it real" (2026-09-30)

A game-design review of the photo → paint → brush loop (the far sketch, `postParams.sketchFar`)
with hot air balloons added. Written as an outside designer's read of the code; the status of each
recommendation is at the end.

## 1. The loop, and its hook

With the far sketch on, the world starts as graphite. Walking blooms colour ~45 m around you
(`revealRadius`, up to 450 m flying). A photo (`PhotoMode.shoot`) saves a captioned page and
calls `ctx.paintView` → `post.readSeen` → `unprojectDepth` → `Explore.paintSeenSliced`: every
surface in frame out to `SEEN_REACH` blooms, near first. `Commissions.paintFrame` colours Almanac
cards sparingly; coloured car and boat cards become brush chips (`PAINTABLE`).

**The hook: the shutter is the brush.** One button turns a view into a page in your book and into
colour in the world. The balloon is the right vehicle for it — height is what turns one photo into
a whole landscape.

## 2. Moments to design for

- **The held breath.** The whole run used to finish in under 2 s — too fast to feel. Stage it:
  flash and shutter, a beat of silence, the viewfinder goes bare, then the colour runs out over a
  time that grows with reach (~1 s on foot, ~3 s for a 12 km balloon shot), with a sustained wash
  sound; the chime when the farthest cells land.
- **The number.** Say what one shot did: "out to 11 km · 38 km² in colour".
- **The first photo from the basket** gets a one-time ceremony (a slower run, a line of text).
- **The horizon.** The moment that sells the game is the pencil horizon turning to colour; the far
  silhouettes must take the paint.

## 3. Friction and satisfaction

1. **Photo paint didn't count as progress** — only walking raised `painted`. Count it.
2. **The same photo twice.** When a shot adds nothing, say so and point at the pencil ("the pencil
   is to the north-east"); later, a live "mostly pencil in frame" readout in the viewfinder.
3. **Walking loses its reason once the balloon exists.** Later: a photo lays a *wash*, walking lays
   the *finish* (stamp caps below `FULL` that fall with distance, drawn as a pale tint).
4. **Toast pile-up** after a shot: one result card instead of three toasts.
5. **Nothing pulls you on after painting**: a two-tone atlas (wash / finish), a map corner after a
   big shot, the pencil frontier as the next goal.
6. **Altitude teaches nothing** (cards need you close): say so — "too far to learn anything; come
   down close to paint them from life".
7. **The loop is locked behind a dev toggle**: a `?loop=paint` URL flag for playtests.

## 4. Balloons

- **One axis.** Burner (Space / ▲ held) and vent (C / ▼ held); the look stays free — you're a
  passenger with a camera. An altimeter strip shows the wind layers; tap one to set a target height
  and the burner and vent fly you there (frictionless on touch; hand flying still there).
- **Lag you can read.** Keep ~3 s (heat → envelope temperature → lift as a first-order filter), a
  heat needle and a level-off tick, the burner's roar and flame while it burns, ±4 m/s.
- **Wind layers** (`world/wind.ts`): 3–4 layers seeded by region and hour (deterministic), veering
  clockwise with height; on coasts a sea breeze onshore in the afternoon, offshore in the morning.
  Choosing a height is choosing a direction.
- **Ambient balloons**: launches seeded per cell per day, dawn and dusk; 1–3 in the sky nearby; now
  and then one comes down on sand, stays a while, packs up; a hint announces it. A landed balloon
  is a commission and something you can board.
- **Ties to painting**: photograph a balloon → its card → brush one into the world in any colours.
  Third person lets your own balloon be in the photo.

## 5. Light progression

- Area milestones in real-world terms ("an area the size of Central Park").
- Towns "in colour" as atlas stamps.
- Commissions from high places (a peak from the air, the coast from 300 m, three towns in a frame).
- Finishes and patterns from scene commissions (golden hour glaze, sea-fog granulation) — colour
  itself is always free.
- A rare balloon-festival dawn.

## 6. Priorities

Build now: count photo paint · km² and a direction in the shot's result · the held breath (reach-
scaled delay, bare viewfinder, wash sound) · pencil-in-frame readout · balloon v0 (heat model,
wind layers, altimeter, ▲ ▼ / Space C) · ambient dawn balloons and beach landings · balloon card +
brush colour picker · area milestones · `?loop=paint`.

Later: wash vs finish · drift line on the atlas, two-tone atlas · town stamps, finishes, festival ·
balloon selfie in photo mode · sharing painted balloons.

## Status

See docs/earth/LOG.md (2026-09-30, the balloon entry) for what was built from this list.
