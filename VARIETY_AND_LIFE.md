# The best route to variety and liveliness

Companion to `EARTH_SCALE_THOUGHTS.md` (which covers the *streaming* problem). This doc covers the
other half of "explore all of Earth": making each place look and feel like *itself*, and making the
world feel inhabited rather than empty. No timelines — just the route and the principles.

## The two governing principles

**Real attributes always win; heuristics only fill gaps.** The pipeline already does this —
Overture height/floors/roof_shape/facade_color/material and OSM `roof:shape`, `building:colour`,
`building:levels`, `highway`, `natural` all flow through the bake. As variety work expands, keep the
rule: if the data says it, the data is right; the style system only supplies *priors* for what the
data leaves unsaid.

**Variety lives in tables, not assets.** Everything in the game is generated geometry behind custom
shader materials — zero mesh assets, and it should stay that way. The "asset generator" for Earth
isn't a model library; it's a parametric generator library (roof archetypes, facade grammars,
vegetation archetypes) whose parameters come from regional style tables. Nothing to license, nothing
to download, and the watercolor look forgives low-poly forms that would fail a photoreal renderer.
Pre-made assets are only worth considering for a handful of one-off landmarks that need to *read*
correctly — optional garnish, CC0 only, never a dependency.

## Liveliness: the route

Current state: a 20 Hz worker sim with hard caps (`CAPS = { gulls: 110, cars: 70, peds: 110,
boats: 10 }` in `src/sim/protocol.ts`). Every kind renders as a single `InstancedMesh`, so draw
calls don't grow with population. The density slider saturates at ~1.35 because `desired()` clamps
to the caps — raising the slider alone does nothing.

The ceiling is far above the current caps: the transport pattern (typed-array snapshots,
double-buffered through a worker) is the same one the reference `sim.worker` engine ran at
~131,000 entities — that scale is already proven for the *plumbing*. What scales less gracefully is
the behaviour code inside the tick (edge sampling, leader-following, ped spacing), so entity caps
are a tuning dial, not an architectural limit — raise them until the sim tick or the *scene* (not
the renderer) feels crowded.

1. **Raise the caps and the slider.** Cheap and immediate — the architecture is already proven at
   ~131k entities, so 300 → thousands is well inside the envelope. `SIM_US` in the shared header
   reports per-tick microseconds, so the real cost is directly observable.
2. **Scale population to the place, not to a global cap.** The right long-term driver is baked into
   the data: peds/cars scale with road-km and density class, boats with marina/water area, gulls
   with coast. A hamlet stays quiet; a city block teems. Cap size becomes a function of the region,
   not a constant.
3. **Anchor activity to real POIs.** The bake already emits named POIs with kinds. People cluster
   near cafes, marinas, the beach, transit stops; cars favour primary roads at rush hour (the
   existing `f(hour)` curves). This is what turns "lots of entities" into "the town feels alive" —
   believability beats raw count.
4. **Species and behaviour vary by biome.** Gulls are a coast thing; pigeons belong to plazas,
   boats to water, deer to forest edges. Same sim engine, different spawn tables keyed by the
   regional style row.
5. **Watch believability, not just performance.** More pedestrians than the street network can
   plausibly hold looks wrong; spawn trickle (one per tick per kind) means big density jumps take a
   few seconds to fill in. Density is a dial for feel, not a benchmark.

## Variety: the route

1. **Regional style tables.** A data file mapping (climate zone × region/culture × urban/rural) to
   priors: roof pitch and covering (terracotta Mediterranean, steep Scandinavian, flat parapet,
   adobe), wall palettes, eaves/trim conventions, vegetation species, street furniture, typical
   building heights for gap-filling. Keys come free: Köppen climate grids, WorldCover, OSM admin
   boundaries — all derivable per tile/region at bake time.
2. **Parametric archetypes.** The generator grows a grammar: roof types, window-per-floor
   conventions, porch/awning patterns, tree shapes (palm/conifer/deciduous/scrub). Each archetype is
   code seeded by tags — same pattern as today's height/roof inference, just parameterized by the
   style row instead of hardcoded to the Jersey Shore.
3. **Sparse-data degradation is the point.** NJ is best-case data (MB bake: 33,848 of 38,325
   buildings had real heights). Rural Morocco will not. The style table's job is precisely to make
   thin data still land on plausible — that's why priors must be regional, not global defaults.
4. **A landmark registry for the recognizable exceptions.** The procedural base covers ~99.9%; a
   small keyed-by-OSM/Wikidata-ID overlay (like the existing Sandy Hook Light entry and bascule
   bridge handling) makes places feel *recognized*, which is the whole point of real geography.

## Assumptions currently baked in (the known list)

Each of these is a place where the code quietly encodes "Jersey Shore barrier island" and will need
a style-table row or a config field to survive elsewhere:

- `oceanEdge: 'e'` — already config; other coasts need other edges (or multi-edge).
- Temperate deciduous palette — trees, grass tones, beach sand colour.
- Low-rise vernacular — height/roof heuristics top out around suburban shore housing; a dense
  urban core needs a different grammar (and LOD/instancing perf work).
- No snow/seasonal system — weather is cloud/fog/haze; alpine or northern towns need at least a
  snow palette.
- Flat terrain tuned for a beach strip — mountains will stress terrain shading and horizon
  treatment.
- Timezone/name/labels — already solved by the regions refactor (`meta` in world.json).

## The route overall

Prove variety town-by-town, each chosen to grow a new muscle — Monmouth Beach exercised the
regions layer (done); next towns should stress the style system: a mountain village (terrain +
steep roofs + conifers), a desert town (palette + sparse vegetation), a dense city block (grammar +
perf), an old European center (irregular footprints + landmarks). Each one forces a new row of the
style table and flushes out a hidden assumption, so that when the streaming refactor lands
(`EARTH_SCALE_THOUGHTS.md`), the *content* side is already proven to generalize — the pipeline
becomes the only remaining question, not the world itself.
