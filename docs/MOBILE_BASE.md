# Mobile base: one home behind every door

A living document. Robby's direction, reasoned through with Claude (2026-10-05). It expands
`docs/GAMEPLAY_VISION.md` section 7 ("Home: one home, behind every door") and sections 4 and 6.5
(travel, combining) into one design for the door, the inside, and the way between them. Where the
two disagree, this doc wins for the mobile base and the vision doc gets the matching edit (see
"What this changes elsewhere"). Add ideas at the bottom under **Ideas inbox**.

**In one line:** step through the back door of the van, boat, plane or balloon and you are in the
same big, warm, build-it-yourself home, with no loading and no menu, and the real world still
visible and alive through every window, glass wall and open door.

**Decided (Robby, 2026-10-05):**
1. **The roomy inside is visible from outside, through the open door.** Walk round the vehicle and it
   is small again. That is the charm.
2. **A side door while moving is never locked.** Pushing it asks the vehicle to ease to a safe
   stop, and the door opens when it has.
3. **The inside never changes between vehicles.** One layout, one build. Only the windows, sound
   and motion change (the vehicle's real view).

---

## 1. The feel

- You never see a loading screen, a prompt or a locked door between the world and your home.
- The door is a real doorway: you can look in before you go in, and look out after you've gone in.
- The home is yours: you place, remove and combine things in it with the same gestures as
  everywhere else (vision sections 6, 6.5 and 7).
- The outside is always alive: through a window you see the vehicle's real surroundings, moving or
  parked.

## 2. The door

### From outside
- The vehicle's back door (a boat's companionway, a plane's cabin door, a balloon's basket gate) is
  the **one real door**. It swings open as you approach, as building doors already do
  (`docs/agent/gameplay.md` "Getting in").
- Open, it is a **portal**: through the opening you see the inside at its real size, not the
  vehicle's small outside volume. Walk round the van and you see the small outside again.
- It is built like a building's door: the interior is prepared as you walk toward it, and a leaf
  stands across the opening until it's ready, so you never see an empty shell (`shutDoor`).

### Walking through
- You walk through at normal speed. The change from the world's scene to the home's scene happens
  while the door frame fills your view, so there is no fade, no cut and no pause.
- Sound crossfades to a soft interior over about 300 ms; the light adapts (eye adjustment) over
  about a second. These are the only transitions.
- Coming back out is the same in reverse.

### Looking back out
- From inside you see the door's opening onto the real world, and every window and glass wall
  shows the outside from the vehicle's real position and eye height, in the direction it faces
  (vision section 7 "Windows keep the vehicle's view").

### How the portal could work (spike first, then choose by phone frame time)
- **A. Stencil portal in one scene.** The home sits in its own collision and draw scope at a fixed
  offset, aligned by a rigid transform so the door aperture lines up with the real door. One extra
  pass, drawn only when the door is on screen.
- **B. Render-to-texture.** Draw the home into a reduced-size target, sample it through the
  aperture. Cheaper on phones, softer at the edge.
- Either way: nothing is drawn when the door is shut and off screen.

## 3. Hopping in the back while driving

Driving is optional and so is self-driving, so you can step into the back at any time.

- **Leaving the cab is a hand-off, not a stop.** When you walk away from the seat, the vehicle
  takes over:
  - **van:** follows the road (and the planned route, if there is one) at a calm speed;
  - **yacht:** holds its heading and speed on connected water, slowing for shore and traffic;
  - **plane:** holds heading and altitude (autopilot); it only ever lands at an airfield;
  - **balloon:** drifts with the wind, as it always does.
- **If there is nothing safe to keep doing** (a dead end, no route, shallow water), it eases to a
  stop at the nearest safe place and you are told on the cockpit window, not by a pop-up.
- **Sitting back in the driver's seat takes the wheel again,** instantly.
- **You are not thrown about.** Movement is felt through window parallax, engine sound, a gentle
  sway and the light moving across the floor. The walker inside is not pushed by acceleration.
- **Fuel rules still apply** (vision section 4): the cockpit shows the gauge, and running empty is
  never a failure.

### The cockpit
- **One room is tied to the vehicle: the cockpit.** It holds the driver's seat, with the
  windscreen as the live view, the wheel or yoke, and the gauge. Everything else in the home is
  free-form.
- It sits at the front of the home. Build around it as you like, but it can't be removed, so
  there is always somewhere to take the wheel.

## 4. Going out while moving (side doors)

- **Any wall can have an outside door.** The door opens onto the side of the vehicle that its wall
  faces. A door on the east wall opens onto the vehicle's east side; the back door opens behind it.
  This matches the windows (each shows the real view in the direction it faces), so what you see
  through the glass is what you step out into.
- **A door is a request.** Pushing it while the vehicle is moving does not fail and does not stay
  locked. The vehicle **eases to a safe stop** and the door opens when it has:
  - **van:** pulls onto the nearest shoulder, parking spot or pull-off, slowing over a few
    seconds; the door opens when it's stopped;
  - **yacht:** eases to the nearest dock or mooring, or drops anchor; at anchor, the door opens
    onto the swim platform and you can wade or swim (vision section 11.1);
  - **plane:** you can only step out on the ground. The door offers "land at the nearest airfield";
    the cabin shows where, and the door opens after landing;
  - **balloon:** the same, with "come down in the nearest field or park".
- **The cabin always says why and how long,** in the world (a light by the door, the window view
  slowing), not in a message box. There is never a locked door with no explanation.
- **A cancel is one step:** walk away from the door and the vehicle returns to cruising.

## 5. The inside: one style, one home

- **One layout in every vehicle** (decision 3). You build once and never lose anything. Only the
  windows (the real view), the sound (engine, hull, wind, basket creak) and the motion cues change
  between vehicles.
- **One warm "cabin" style:** curved ceiling, wood, brass, big windows. It reads as camper,
  yacht and aircraft cabin at once without copying any of them, and the vehicle shows through the
  glass.
- **You expand it yourself,** as in vision section 7: rooms on a grid, stairs and floors. Collecting
  earns floor area; nothing grows by itself.
- **Room types include:**
  - **cabin rooms:** bedroom, kitchen, living space, gallery;
  - **the solarium:** glass walls and a glass roof, showing the real sky and surroundings, with
    its own outside doors. It is the airy, roomy way to be "outside while inside";
  - **the outdoor room:** open sky above, ground below (vision section 7), the sandbox for crafted
    things (vision section 6.5);
  - **the cockpit:** fixed (see above).
- **Customisation uses the same gestures as the world:** hold to place, drag a card onto a card to
  combine (section 6.5), undo right after, take anything back into the sketchbook. No separate
  build mode and no workbench screen.
- **The camp kit** (vision section 6) pops out around the vehicle when you park: awning, chairs,
  string lights. The solarium and outdoor room's doors open onto it.

## 6. Loading and cost (how it stays smooth, especially on phones)

The home reuses the building-interior pipeline (`docs/agent/gameplay.md` "Interiors"), with the
player's layout in place of a generated one.

- **Same machinery:** chunked mesh streams (`interior/mesh.ts`), furniture pieces from the foundry
  (`interior/furnish.ts`, per-piece budgets in `tests/foundry.test.ts`), its own collision scope
  (`WalkWorld.withScope`), and the pump running at most about 3.5 ms a frame.
- **Rooms stream, the home does not.** Build only the room you stand in, the rooms next to it, and
  rooms visible through a doorway or window. A big home costs about the same as a small one.
  Rooms are generated or loaded from your saved layout, a room per step.
- **Budgets:** the building-interior budgets apply to the visible set (no step over 8 ms, about
  120k vertices, at most about 60 draws). A new `tests/homeBudget.test.ts` covers a 20-room home
  and the solarium's glass.
- **Windows and glass walls** use the all-around capture from the vehicle's position (vision
  section 7): drawn only when on screen, one or two facing directions, about 15 times a second on
  phones, every frame on desktop. A solarium is the worst case (many glass faces), so it is the
  scene to measure first.
- **The home is saved, not generated:** a placed thing is about 50 bytes (which card, where, which
  way it faces), so a big home is well under a megabyte.
- **The vehicle keeps simulating while you are inside.** Wildlife, traffic and weather outside carry
  on; the walker inside is exempt from their collision.
- **Phones:** impostor cards for far rooms and pieces, as in the world.

## 7. What this changes elsewhere

| Where | Today | Change |
|---|---|---|
| `docs/agent/gameplay.md`, "Only on foot" | No interior activates while driving or flying; an open one goes 30 m past its door | The home is exempt: it stays resident while the vehicle moves. Ordinary buildings keep the rule |
| Vision section 7 "The outside is always the normal-sized vehicle" | Stated, but the outside view of the inside isn't | The open door is a portal that shows the inside at its real size (decision 1) |
| Vision section 4 "Calling the van", "Self-driving" | Self-driving is a trip you start | Leaving the cab also starts cruising (section 3) |
| Vision section 7 windows | Each window shows the vehicle's real view | Unchanged, and also applies to the solarium's glass and the door's opening |
| Vision section 6.5, "Crafted vehicles" | No home inside, no sleep travel | Unchanged: a crafted or collected vehicle is not a mobile base |
| Hard constraint 12 | Local frame +x east, +z south, per-region origin | The home has its own frame in metres. The door maps the home's frame to the vehicle's (its facing decides which side you appear on) |

## 8. Edge cases, decided

| Case | Decision |
|---|---|
| Walking out the back while the van moves at speed | The van eases to a safe stop first; the door opens when stopped |
| No safe stopping place (tunnel, bridge, dead-end) | It keeps rolling to the next safe place and tells you through the cockpit window |
| Pushing a side door in the air | The door offers "land"; it opens after landing. Never locked without a reason |
| On water | Eases to a dock, mooring or anchor; at anchor the door opens onto the swim platform |
| Walking toward the door, then away | The vehicle returns to its previous behaviour |
| Take the wheel again | Sit in the driver's seat: instant, from any speed |
| Out of fuel while you're inside | Coasts to a stop; the door opens as usual. Never stranded |
| Call the van while you're inside | It comes to your location as usual; you are inside during the wait |
| Teleport while inside | The home goes with you; you stay inside |
| Sleep inside | Vision section 5 (choose time of day); the vehicle's real view moves on |
| Collected (not special) vehicle | No home inside (vision section 6.5), so nothing to enter |
| Door on a wall that has real street outside | The vehicle's real door position is always the exit; a placed outside door picks the side its wall faces and opens where the vehicle's surroundings are free |
| A placed object in the way outside the door | Nothing breaks: you step out beside it, and the outline nudges the door's exit point a little |
| Home too big for a phone's budget | Far rooms draw as impostors; the nearest rooms in full. A gentle note suggests an outdoor room, as in the world |
| Cleared browser data | Progress lives in the browser for now (IndexedDB); account sync and export later |

## 9. Order of work

Foundation first (vision section 17): nothing below starts until the foundation tier passes. A
throwaway prototype of the door portal may run alongside, to prove the feel.

1. **The portal spike:** one door, one fixed room, both portal approaches measured on a phone and
   desktop. Pick one.
2. **The van-home start (vision section 8):** wake in the van, step out, step back in, with the
   real door and the sound and light transitions.
3. **Cruise hand-off:** leave the cab, the van follows the road; sit back down, take the wheel.
4. **The cockpit** and the window view through its windscreen.
5. **Rooms on a grid:** add a room, a door, stairs, using the existing placing gestures.
6. **Side doors and the safe-stop** for the van.
7. **The solarium** and its glass, measured against the budget.
8. **The outdoor room.**
9. **The yacht, plane and balloon:** the same home with their windows, sounds and safe-stop
   behaviour (dock, airfield, field).
10. **Camp kit and polish** (sound, light, the door's swing).

## 10. Open questions (decide by playing)

- Which portal approach holds frame rate on phones?
- How long should the van take to ease to a stop (3 seconds? 6?), and how far will it travel to
  find a pull-off?
- Cruise speed for the van: the road's limit, or a calm lower speed?
- Can other people (townspeople) peek through the open door into your home?
- How many rooms before a phone struggles, with and without a solarium?
- Does a home with no outside doors but the back door still feel good? (It should: the back door
  is always there.)
- Should the cockpit have its own seat styles and gauges as cards?

## Ideas inbox

Add new ideas here, with a date.

- **2026-10-05, the door as a moment.** The first time you step through, a gentle "bigger on the
  inside" beat (a held breath, the sound opening up). Later visits are instant.
- **2026-10-05, window seats.** A seat by a window that holds you still, so you can watch the world
  go by with the home's light on you.
- **2026-10-05, the solarium as the sleeping spot.** Sleeping under a glass roof at night, so the
  stars and weather are the alarm clock.
