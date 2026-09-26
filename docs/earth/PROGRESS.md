# Earth expansion — progress tracker

Goal: open the game anywhere on Earth, walk out the front door of a real building, and keep
walking — forever — while the world paints itself around you. The design lives in
`EARTH_MASTERPLAN.md`; this file tracks where the build actually stands.

## Phase status

| Phase | What | Status | Commit |
|-------|------|--------|--------|
| 0+1 | Deterministic tile streaming (1024 m cells, 48 m margin, own/ctx flags, scoped collision, interior keys) | ✅ done | `6fdffc0` |
| A | Per-tile terrain packs + `Terrain` patch registry | ✅ done | `e433f1b` |
| B | Worker-side tile decode/mesh; mounts ~5 ms (was a synchronous stall); pack/ops deck round-trips | ✅ done | `c94708f` |
| — | Landmark dedupe (nearest tile emits once) | ✅ done | `c94708f` |
| C | IndexedDB tile cache, keyed by manifest fingerprint (self-invalidates on re-bake) | ✅ done | `e6095e1` |
| D | Floating origin: `worldRoot` re-snap >1.5 km, `U.uWorldOffset` in shaders | ✅ done | `d909205` |
| E | Coarse silhouette ring: lite tile builds 2.4–8 km, 4-job budget, seamless detail upgrade | ✅ done | `c91bdce` |
| F | `?at=lat,lon` deep links + region picking (slice > backdrop > nearest) | ✅ done | `154cf60` |
| — | In-game teleport (`G` → lat,lon; doorstep-snap; cross-region via `?at`) | ✅ done | `d3f9b92` |
| — | Review fixes: worker-crash rejection, late coarse swap | ✅ done | `5764762` |
| — | Street trees off carriageway; paved mask sees context roads; tree scan bounded to own box | ✅ done | `5199fe4` + `66b9d1d` |
| — | Street furniture variety: hydrants, benches, bins, planters, front hedges | ✅ done | `66b9d1d` |
| — | Placement fix: `clearOfRoad` margins keep all furniture off lanes/sidewalks | ✅ done | `a9ae915` |
| — | Interior amortization: `buildGen` sliced ~3.5 ms/frame, atomic swap on finish | ✅ done | pending |
| G | **Procedural fallback tiles** — cells beyond the manifest synthesize deterministic towns (warped grid + town mask + field-driven lots); same build/mount path; walkable forever | ✅ done (r1) | `16095e9` |
| H1a | **Real-lite tile service** — CF worker `GET /tile/<cx>_<cz>.json?olat&olon`: Overpass→`TileJson` (roads+buildings+water, margin/own:0, coastline→water), R2+edge cache, in-flight dedup, ODbL credit | ✅ done | `0107bb7` |
| H1b | **Client w-\* specs** — `?tiles=`/`tilesUrl`; synth placeholder mounts instantly, real tile upgrades in place; ground+ribbon+water extras; lamp guard | ✅ done | `0107bb7` |
| H1c | **Open world `?at=`** — virtual manifest (snapped origin, flat synthetic terrain) beyond baked regions; verified at London (8.3k fps, 8.5k roads, 0 errors) | ✅ done | `0107bb7` |
| — | Expert design/gameplay review ×2 (6.5 → 8/10): first-minute promise toast, stranded-`at` guards, HUD street names, tz, swap-settle nudge, tree/bench points, paved footsteps | ✅ done | `5dc3f9e` + `adc60f5` |
| H3-lite | **Hybrid fill** — sparse real cells (<20 bldg/km) plant seeded lots along real roads; land masks, round-robin cap, interior clamp, per-road rng. Reviewed 7.5 → 8.5/10, "move to H2" | ✅ done | `7f32dfb` + `e379253` + `96fe7c6` |
| H2 | **Terrarium DEM** — `/dem/` worker route (edge+R2 cached), per-cell f32-cm TerrainLayer patches (s/w twin shared, holder-refcounted), elevation-derived sdf (sea can't host synth lots), neighbour-patch lookup; reviewed **8.5/10 — SHIP pending worker deploy** | ✅ done | `6d38ede` |

| One World | **`shore` bake** (Sea Bright → Monmouth Beach, merged offline via `merge-raw.mjs`); full detail across the backdrop (`detailBox`); `bakeId` cache fingerprint; DEM for all streamed cells; `/__tiles` dev proxy | ✅ done | this session |
| I (first cut) | **Regional style** `styles.ts` (climate/family/palettes/species/biome/driving side), `meta.style`, style → worker | ✅ done | this session |
| J2-a | **House realism** `recipe.ts` + siding/roof materials, dormers (1½-storey), bays, side chimneys, plinths, cornices, downspouts, hull roofs, roof gamut, new window asset, flicker root cause | ✅ done (review 7 → fixes applied) | `51d1cc8` + this session |

## Next up (revised 2026-09-26 — see OPEN_WORLD.md "Phases — revised order")

- **L-lite** measured heights/storeys → **J1** ground paint + per-tile lamps for the walkable
  ring → J2 rest → traversal spike (vehicles/abilities) → K life.

## Next up (older list, kept for reference)

- ~~Amortize interior generation~~ — done: worst subsystem 112 ms → 7.3 ms, soak `stalls=0`, `hitches=0`.
- **Deploy the worker** (user step — needs their Cloudflare account): `cd worker && wrangler login && wrangler r2 bucket create map-game-tiles && wrangler deploy`, then `tilesUrl` into manifests/Pages. Until then `?at=` is dev-only via localhost auto-default.
- Window-sill/door flicker (user-reported): facade-decal z-fighting or the window-fade distance threshold — cosmetic, queued.
- Late-DEM seam (user-reported, unfixed by request): flat-built s-tiles beside DEM-hilled cells look sunken — rebuild the mounted s-cell when its DEM resolves, or lengthen the placeholder budget.
- Next phases (see `OPEN_WORLD.md` + `ASSET_FIDELITY.md`): **I** regional style + recipe/seed layer (incl. `meta.style` for virtual manifests) → **J** detail parity → **J2** asset craft (vertex-AO, banded roofs, dormers, SDF decals, rounded props) → **L** measured tier (`bd.h/rp/eav/rs`) → **K** life+ambience. Same implement→montage→review loop each.
- Deploy `worker/` (needs the Cloudflare account: `wrangler login` → `r2 bucket create` → `deploy`),
  then set `tilesUrl` in manifests / wire it into the Pages deployment.
- Atlas journaling improvements (the journal exists; "humanity map" is Phase 5).
- Seam-stitched life districts (ambient life across tile boundaries).
- Regional style presets + landmark registry.
- The region slice layer is still whole-region; per-tile packs are live but paint/ground/shader
  consumers still read the resident slice + backdrop (deferred cleanup).

## Known issues / environment notes

- Soak still logs occasional multi-second frames **identically with the worker disabled** —
  environmental (headless GPU/GC), not tile-related. `frameErrors=0`.
- `lifeSim` pedestrian test sits near the 5 s vitest timeout (bumped to 15 s; it flakes under load).
- The tile cache keeps two namespaces (page-relative vs worker-absolute base URLs) — correct but
  duplicates entries; dedupe later if disk matters.
- Only **Sea Bright** and **Monmouth Beach** are baked — `?at`/`G` can pick between them, and
  walking now keeps going via Phase G synth tiles (deterministic procedural suburbs). Synth
  quality is "PASS WITH CONDITIONS" per the reviewer — see `docs/earth/REVIEWER.md`.
- Synth tiles currently have **no lamp-map/night pools** (skipped — the lamp compositor is
  slice-scoped; needs a per-tile lamp box, deferred) and **no paint layer** for paved lots.
- `w-*` tiles share both skips above, plus: water areas render as flat tinted sheets
  (no shore shader), no terrain patch (flat until H2), no landuse/POIs (H1 minimal scope),
  and buildings float on slopes (Phase J grading). Virtual-region terrain is a flat
  synthetic layer — `?at=` coasts get real water polygons but not real elevation yet.
- Overpass latency observed 25–90 s/cell under load (plan assumed 2–8 s). The synth
  placeholder hides it; R2 + in-flight dedup make each slow fetch once-per-population.
- The dev worker (`wrangler dev --local`) logs `Network connection lost` errors after
  ~30 s requests — miniflare artifact on long cold paths; responses still complete.

## Verification ritual (run before committing world changes)

```text
npm run typecheck && npm test && npm run build
node tools/capture.mjs --shots=ocean-golden,porch,inside --montage=only   # read the montage jpg only
node tools/soak.mjs --region=seabright --seconds=90                       # stalls, hitches, frameErrors
```
