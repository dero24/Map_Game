That's the right target — and the design doc already bends that way. The honest shape of "one game, three depths":

## The layering that makes it work

**Floor — anyone, zero tutorial:** walk, world paints in. That's the whole mandatory skill. If someone never opens the Almanac, they still get the watercolor explore fantasy — arrival cards, weather, towns, day/night. That must stay *complete and free* — no energy meters, no required crafting, nothing gated.

**Middle — light progression for the curious:** cards, paint economy, reputation, the balloon hunt. It's *knowledge* progression, not power progression — which is why it doesn't pressure casuals. The blank cards whisper "there's more," but nothing punishes ignoring them.

**Top — creativity for the ones who want it:** brush, composition, games, structures, sharing. The doc's sandbox-mode open question is worth deciding **yes** — a separate "creator mode" with everything unlocked, off by default, kept out of the shared world. Kids and pure builders get infinite paint; the economy stays intact for everyone else.

## The one honest tension

Paint-as-resource is where casual friction can creep in. If painting a bench makes a player think about paint budgets, you've lost the "just play" crowd. The fix is already half-written: **home is free, and casual-scale things are cheap.** Only people building *a lot* ever feel the cap — the economy should be invisible until you push it.

## What makes "all in 1 game" hold together

One verb: **paint**. Explore paints ground, P paints cards, brush paints objects, the atlas shows what you've painted. The casual walker and the obsessed creator are doing the *same act* at different depths — that's what keeps it one game instead of three stapled together.

If the first five minutes are flawless — wake, walk, world blooms — everything else is optional depth that reveals itself exactly when someone wants it.

## The distance-sketch problem

"Once you walk there it gets colored anyway" is true — but the failure isn't that distant places stay uncolored, it's that **far pencil reads as broken, not unexplored**. Even with the softened version committed, your instinct says it still looks wrong at range. So: fade the underdrawing effect by distance — near field is where bloom happens (~the ceremony zone around you), far field always renders full watercolor. The map/al atlas is where pencil-vs-painted lives, because fog-of-war reads correctly on a map and never did in a horizon.

## The town-center idea — genuinely good

"Find the center of the next town to color it in" turns towns into **claimable units**, and that fixes several things at once:

- It gives traversal a *destination structure* — not "wander until things bloom" but "reach Sea Bright's heart, claim it, push on to the Highlands." Towns become the levels of this game.
- The data already exists — arrival cards already reverse-geocode towns, so the game *knows* where centers are (OSM `place=town`/square/town-hall nodes).
- It solves the half-painted problem honestly: walking a town's edge forever leaves pencil fringes; reaching the center claims the whole settlement — big satisfying bloom moment, then your atlas shows "Atlantic Highlands — claimed."

## But keep the per-cell painting — the hybrid is the real design

**Claim the town at its center; your *routes* still paint the in-between.** Then the atlas tells two stories at once: towns you've claimed (blocks of watercolor) connected by *your actual trails* (the painted threads between them). "I claimed Sandy Hook" is a milestone; "I painted every street" is the completionist tier. Both survive — different completion levels of the same mechanic.

So the honest read: your town-center idea doesn't replace paint-as-you-walk — it gives it *goals*. Sketched distance → fixed by the fade. Half-painted towns → fixed by the claim. Your personal trail → preserved as the routes connecting claims.

That'd be a `town-claim` queue entry once things settle: place-node claim points, whole-block bloom ceremony, atlas showing claimed vs. walked-vs. both.

The pieces you're circling actually lock together into something clean. Let me show you:

## Close-up painting — already the rule, and it's the key

The design doc already says "things seen from far away stay pencil — to paint them you have to get close." You just independently arrived at the same rule, which means it's right. And it's what makes the air tiers work: **altitude earns coverage, never vocabulary.** You can't cheat the Almanac from the sky — the sky only shows you where to land next.

## Balloon vs plane — not a ladder, two jobs

- **Balloon** = sightseeing tier. Slow, drifts with wind, lands in any field. You float over your painted trails — it's the *reveal* vehicle.
- **Plane** = distance tier. Fast, needs runway-ish space, covers states. But at 100+ knots you can't even *see* a card, let alone paint one — it moves you between regions, teaches nothing.

They're orthogonal tools, which is better than tier-1→tier-2: you want the balloon *and* the plane for different reasons.

## Your gas idea is better than you think — tie it to town claims

Fuel refilling when you **claim a town center** turns the two systems into one loop: claim a town → its fuel network is yours → fly to the edge of your range → land → claim the next town → your range ring grows outward. The map of claimed towns literally *becomes* your range. And it keeps the air tier honest — the sky can't skip towns, it just changes the order you visit them.

One honest caution: fuel works as a *range leash*, not a grind — you never catastrophically run out, you just can't stretch past your network. A balloon that strands you in a field isn't punishment, it's "walk home, painting new ground the whole way" — which pays you for the failure.

## "Everyone's experience is different" — free, because geography is unfair by nature

Player by the coast → boats first, balloons at festivals. Player in Kansas → grain trucks forever, first plane at a county airfield. Real geography *is* the progression variance — no balance passes needed. And the Almanac's "where they live" hints bound the variance: it's always *discovery order* that differs, never dead ends — the card that says "airfields" turns "I haven't found one" into "it's a trip, want to go?"

The whole ladder honestly: **walk (free) → wheels (everywhere) → water (where water is) → balloon (rare card + your fuel network) → plane (rarest, needs runways)** — every rung earned by having stood in front of the real thing and painted it.


The wall every composable-vehicle game. Scrap Mechanic, Besiege, KSP are *entire games* about making assembled physics work. You don't want that to be the requirement for your players.

## The honest split — where emergence lives and where it can't

**Locomotion = recipe archetypes, not emergent physics.** A car works because the *car recipe* carries a movement model — wheels rolling, engine sound, handling. You compose its look and utility (your seats, your rack, your colors), but whether it drives is never the physics engine's improvised guess. Same for boats floating and balloons lifting. That's the cheat every game uses, including Okami — functional physics per archetype, cosmetic variation on top.

**Emergence lives in the low-motion tier.** Furniture, structures, lanterns on anything, wind chimes, water wheels, sagging planks, tipping towers — honest light physics (weight, sag, balance, spin) is *fun* there because failure is comedy, not a broken save. A lean-tower that topples teaches; a car that won't move just frustrates.

## The bridge that keeps the dream alive

A small set of **motion archetypes as recipe kinds** — `rolls`, `floats`, `lifts`, `glides`, `spins`. Composition works *inside* the archetype grammar:

- platform + wheels + wind-catcher = **land yacht** — `rolls` model, powered by wind
- hull + wings + prop = **seaplane** — `lifts` model
- frame + envelope + burner = **balloon** — `lifts` model, drifted by wind

So a player *can* invent a working flying machine — but only because the recipe family recognizes the pattern and supplies its locomotion. "I built a glider" is real, it's just that *glider* is a grammar, not raw torque.

## The honest answer to your doubt

Flying/driving is gated by **cards, not engineering skill** — you painted a plane, the recipe knows flight. Player-built attempts that miss the archetype just... don't get the movement model. Your skateboard-sail rolls downhill comically and stalls; nobody expects it to fly. That's fine — *KSP* made the struggle the whole game; yours makes **discovery** the game.