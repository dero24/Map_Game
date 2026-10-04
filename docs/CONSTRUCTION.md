# Player construction — design brainstorm

> Superseded by `docs/GAMEPLAY_VISION.md` (2026-10-03), via `docs/GAME_DESIGN.md` (2026-09-28): painting is the verb, earned by painting the real thing from life; placement is aim-and-snap (`src/player/place.ts`); the first slice is the brush (`src/ui/brush.ts`).

Brainstorm notes from 2026-09-27. Not a spec yet — a place for the idea to live while the
core loop gets discovered (see `feature_list.json` → `traversal-spike`). Related:
`3d_asset_creator.md` (pending cleanup — its useful philosophy is folded in here),
`docs/ASSET_FIDELITY.md`, and the `paint-your-walk` feature, which shipped a sketch input
that this design can build on.

## The fantasy

Players leave marks on the **real** world — not a procedural map, the actual Jersey Shore.
"My shack sits on the beach by the real Rumson bridge" is a claim no procedural game can
make. Construction is the strongest candidate for what makes the loop a *game* rather than
a walk: traverse → gather/notice → make → grow → return.

## Generative grammar (from 3d_asset_creator.md)

- **Recipes, not meshes.** The kit already implements this: `recipe(type, seed)` →
  validated proportions → geometry. Players compose recipes; they never push vertices.
  Every output is coherent *by construction* — the checker is the validation band itself.
- **Reusable archetypes, genome-driven variety.** One tested skeleton per family
  (car / boat / plant / structure) + compact genome = huge variety without new rigs, new
  animations, or new AI per encounter.
- **Fibonacci/golden ratio as tendencies, not theme.** A shared helper —
  `goldenAngle(seed)` (~137.5° + jitter), `fibCount(seed)` drawing soft counts {3,5,8,13},
  `taper(ratio, jitter)` — that every family samples. Visible in trees/rocks/plants;
  subtle proportion bands in vehicles; never overrides real data on buildings.
  Phyllotaxis is a packing optimization from growth — the same math that makes seeds
  deterministic makes assets feel "grown" rather than assembled.
- **Shared laws, different outputs.** Planet/region seed biases tendencies; each family
  interprets them locally.

## What players could make

| Tier | Verb | Examples | Why it works |
|---|---|---|---|
| Grow | plant | trees, gardens, beach grass, vines | Time as mechanic; attachment; Fibonacci visuals for free |
| Make | craft | skiff, dock, bench, fire pit | Functional output (a boat you then sail) |
| Build | place | shack, pier extension, treehouse | Site validity makes placement meaningful |
| Charm | sketch | glyph → creature/prop instance | Magic; built on the shipped sketch input |

## The input problem — ranked by fit

1. **Recipe composition** — pick family, slot parts, roll seeds within validated bands.
   Fits the kit exactly; output can't be ugly. Best first move.
2. **Growth verbs** — plant a seed, it develops across sessions. Lowest risk, highest
   attachment-per-effort.
3. **Sketch → construct** — the `paint-your-walk` sketch input already exists. A drawn
   shape mapping to a recipe is the "magic" layer; viable *because* the infrastructure
   shipped — but do it after the recipe vocabulary is proven.
4. ~~Free-form mesh editing~~ — fights watercolor coherence, can't be checked. Out.

## What makes it satisfying

- **Claim on a real place** — persistence layer over real geography.
- **Site validity = meaning** — where you may build comes free from existing masks
  (`pavedMask`, water sdf, footprints). A dock must reach water; a garden needs open
  ground. Constraints make sites matter.
- **Growth over time** — return-visit reward; the world's clock already exists.
- **Cost keeps it a game** — materials/recipes discovered by *going to real places* is
  what plugs construction into the traversal loop instead of floating beside it.

## Honest hard parts

1. Placement UX in first person (ghost preview + snap rules) — solved problem, real work.
2. Balance/cost tuning — where "satisfying" actually lives; pure iteration.
3. Visual coherence on structure tier — recipe bands must reject ugly *and* invalid.
4. Scope — this can eat the whole game. Prove the fantasy with ONE verb first.

## Staged roadmap (each step ships something playable)

1. **Plant** — seed → recipe → grows across visits. Exercises persistence + site checker
   + golden-angle growth all at once.
2. **Dock/boat** — first functional construct; a skiff you built and then sail.
3. **Structure kits** on valid sites.
4. **Sketch-to-build** — glyph layer over the proven recipe vocabulary.

## Checker tie-in

Player content is just another recipe+seed — persist `{family, recipe, seed, transform}`
per region as its own layer over tiles. Determinism free; the same generator/checker
pattern from the emergent roadmap validates player output before it persists.

## Open questions

- What is "cost" concretely — gathered materials, commissions currency, discovered recipes?
- Can player-made things block real roads/paths, or only open ground + water edge?
- Sharing: seeds are portable ("come see my garden at these coords") — multiplayer later?
- Do constructions survive bake changes / region updates?
