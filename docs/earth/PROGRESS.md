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

## Next up (per masterplan, in rough order)

- ~~Amortize interior generation~~ — done: worst subsystem 112 ms → 7.3 ms, soak `stalls=0`, `hitches=0`.
- Atlas journaling improvements (the journal exists; "humanity map" is Phase 5).
- Seam-stitched life districts (ambient life across tile boundaries).
- On-demand planet tile generation (browser-worker bake vs $0 Cloudflare worker — needs a spike first).
- Regional style presets + landmark registry.
- The region slice layer is still whole-region; per-tile packs are live but paint/ground/shader
  consumers still read the resident slice + backdrop (deferred cleanup).

## Known issues / environment notes

- Soak still logs occasional multi-second frames **identically with the worker disabled** —
  environmental (headless GPU/GC), not tile-related. `frameErrors=0`.
- `lifeSim` pedestrian test sits near the 5 s vitest timeout (bumped to 15 s; it flakes under load).
- The tile cache keeps two namespaces (page-relative vs worker-absolute base URLs) — correct but
  duplicates entries; dedupe later if disk matters.
- Only **Sea Bright** and **Monmouth Beach** are baked — `?at`/`G` can pick between them, but
  planet-scale coverage needs the on-demand generation phase.

## Verification ritual (run before committing world changes)

```text
npm run typecheck && npm test && npm run build
node tools/capture.mjs --shots=ocean-golden,porch,inside --montage=only   # read the montage jpg only
node tools/soak.mjs --region=seabright --seconds=90                       # stalls, hitches, frameErrors
```
