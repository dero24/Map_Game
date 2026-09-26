# PLAN — Infinite world via procedural fallback tiles

Goal: walking past the baked region keeps working — forever. Any cell not in
`manifest.tiles` gets a synthesized `TileJson` + ground chunk + road ribbons, generated
deterministically per tile. No network, no neighbour state, identical on every client.

## Design (decided)

- **Position-driven fields, not per-tile RNG for layout.** Roads/lots come from pure
  functions of `(x, z, regionSeed)` — a warped street grid (`nsX`/`ewZ` sine wander at 108 m
  pitch) + a smoothed `town()` value-noise mask for density. Two tiles asking the same
  field get the same answer → streets and buildings are continuous at seams.
- Per-entity rng uses lattice hashes (`vh(ix,iz,seed)`) — deterministic by coords,
  never by scan order.
- `sdf > 1.5` = land (terrain edge-clamps beyond backdrop → Sea Bright's ocean edge
  continues as ocean; inland edges continue as land).
- Margin contract: entities centred inside `spec.box` are owned (`own` omitted); the same
  field emits margin-ring entities as `own: 0` context for builders that need it.
- Roads are baked as *paint*, not geometry — so synth tiles emit **ribbon meshes**
  (asphalt + sidewalks, propMaterial, terrain-hugging) instead.
- No ground mesh exists beyond the boot-time region build → each synth tile packs its own
  `buildGrid` chunk over `spec.box` (step 8 m) tagged `gnd` → shared ground material.
- Interiors/collision/signs/props all come free: `buildTile` runs the synthesized
  TileJson through the identical pipeline (`fps` → `planInterior`, ops → `RecWalk`).

## Implementation checklist — status

- [x] `src/world/synth.ts` — `regionSeed()`, `synthTile(spec, seed, terrain)` →
      `{ tj, extra }` (streets + lots + trees; ribbons + ground chunk in `extra`)
- [x] `ground.ts` — `buildGrid` exported; ground material exposed via `userData.groundMat`
- [x] `pack.ts` — `matTag` honours `material.userData.tag`; `matFromTag` `'gnd'` → shared
      ground material via `setGndMaterial()`
- [x] `main.ts` — `setGndMaterial(groundGroup.userData.groundMat)` at boot; `walk.bounds`
      widened to ±4e6 (synth territory is walkable; water still gates via height/sdf)
- [x] `collision.ts` — `bounds` is public
- [x] `stream.ts` — `byCell` manifest map; `specAt(cx,cz)` synthesizes missing cells
      (`{id:'s'+key, box, lod:0, file:'', synth:1}`); `update()` iterates the cell window;
      mount sweep for cells outside it; **fetch-dedup via `queued` set** (fixed a latent
      refetch-storm: resolved tiles in the build queue were re-requested every frame);
      **dead zone fixed** — coarse silhouettes now cover [LOAD_R, COARSE_R), not just
      [DROP_R, COARSE_R); `ensureAround` covers synth cells
- [x] `tile.worker.ts` — init takes `seed`; `spec.synth` → `synthTile()` + `packGroup(extra)`
- [x] `tileBuild.ts` — synth tiles skip the lamp bitmap (slice-scoped `uLampBox` would
      misregister them)
- [x] `props.ts` — `inSlice` gates on the tile's slice box (synth cells place props/trees;
      `terrain.slice.contains` silently dropped everything outside the baked grid)
- [x] `buildings.ts` — `landmarks ?? []` (synth tiles have none)
- [x] Verify: typecheck + tests pass; captures confirm a synthesized suburb renders with
      streets, sidewalks, poles, varied houses at (-6800,-200)
- [ ] soak clean; AAA reviewer verdict → `docs/earth/REVIEWER.md`; LOG/PROGRESS + commit

## Known gaps (accepted for v1)

- Beyond-backdrop terrain is edge-clamped (flat / open water); real elevation streaming
  (Terrarium PNGs) is a later phase.
- No painted pavement detail (paint.json is baked per region) — ribbons carry the visual.
- Town names are generated (`synth-st-*`); real names need live OSM (phase 3).
- Buildings may sit on clamped-flat terrain near backdrop edges — acceptable until the
  terrain layer streams.

## Reviewer contract

`docs/earth/REVIEWER.md` is the design reviewer's persistent memory: each round it appends
a dated verdict (score, what reads real, what reads fake, required fixes). A round is not
"done" until the latest verdict passes (no open "must-fix" items).
