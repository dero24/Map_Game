# map_game — watercolor walks in real places

First-person watercolor walking sim over real map data. One baked world (`shore`, Sea
Bright NJ → Monmouth Beach) plus streamed real-lite tiles everywhere else. Vision + phases:
`docs/earth/OPEN_WORLD.md`. **This file is a router** — subsystem detail lives in the topic
docs below; read a topic doc only when the task touches that subsystem.

## Commands

| What | Command |
|---|---|
| Session init | `npm run init` — deps + typecheck + tests + baked-pack/queue/invariant checks (`--fast` skips tests) |
| Play (dev) | `npm run dev` → http://localhost:5173 (click "Begin walking") |
| Typecheck | `npm run typecheck` |
| Tests | `npm test` (vitest: rng, ephemeris, lifeSim, realTile, dem, pack, roof, walk, kit, styles, measure, tiles) |
| Build | `npm run build` (typecheck + vite) — must pass before handoff |
| Prod preview | `npm run preview` (:4173) |
| Data pipeline | `npm run fetch -- --region=<id>` → `node scripts/merge-raw.mjs --region=<id>` → `npm run bake -- --region=<id>` |
| Freeze hunt | `node tools/soak.mjs --region=<id> --seconds=120` |
| Visual check | `node tools/capture.mjs --shots=<names> [--region=<id>]` → `shots/<region>-montage.jpg` |
| Phone check | `npm run build && node tools/mobile-check.mjs --device=pixel7\|iphone` — Pages-like serve, device emulation, shader limits audit, boot report (`docs/agent/debugging.md`) |
| Phone HUD audit | `npm run build && node tools/hud-audit.mjs` — the touch HUD's boxes on 10 phones × both ways × 5 states, no overlaps (`docs/agent/debugging.md`) |
| Tile worker (dev) | `cd worker && npx wrangler dev` (ports 8787–8789) |
| Region gate | `npm run verify:region -- --region=<id> [--soak=90] [--shots=a,b]` |
| Lower-48 audit | `node tools/audit48.mjs [--towns=a,b] [--devices=desktop,phone]` → `shots/audit48/<town>-montage.jpg`, `summary.md` (`docs/earth/AUDIT_48.md`) |
| Must-load towns | `node tools/must-load.mjs --live` (the deployed service answers every must-load town) · `--fixtures` (re-make `tests/fixtures/towns/` from an extract pack) |
| Our OSM extract | `node scripts/osm-extract.mjs --pbf=<us-latest.osm.pbf> --ts=<state.txt timestamp>` → `node scripts/osm-upload.mjs --pack=… --poly=<us.poly>` · prove it: `node tools/osm-compare.mjs` (`docs/agent/streaming.md`) |
| Real-world comparison | `node tools/real-spots.mjs [--states=NJ,NY]` (Mapillary spots, `.env` token) → `node tools/real-compare.mjs [--states=…]` → `shots/real/<ST>-montage.jpg`, scores in `tools/real-scores.json` (photos stay in git-ignored `raw/mapillary/`) |
| Place index | `node scripts/build-places.mjs [--fetch]` → upload `raw/places/out/*` to R2 `places/v<N>/` (`docs/agent/gameplay.md` "geo.ts") |
| Ecoregion grid | `node scripts/bake-ecoregions.mjs` → `src/world/ecoGrid.ts` (EPA Level III, public domain; `docs/agent/world-data.md` "Regions of life") |

## Hard constraints

1. No completion claims without runnable evidence: `npm run typecheck` + `npm test` pass,
   `npm run build` before handoff. Visual changes also need a reviewed montage.
2. One pipeline, four feeders: baked / real-lite / hybrid / synth all emit the same
   `TileJson` through `buildTile → pack → mount`. No feeder-specific runtime forks.
3. Deterministic: seeded by cell position or real-data hash — same world for every visitor,
   every session.
4. Real data is the product; procedural is the floor, never the ceiling. Graceful everywhere:
   offline, rate-limited, ocean, Antarctic ice.
5. Never hardcode place names. Region identity (name/tz/spawn/labels/style) travels in
   `world.json`/manifest `meta`; virtual manifests must emit `meta.style` too.
6. In tile builders, `.clone()` asset-kit library geometry — pack transfers detach shared
   buffers and later tiles throw DataCloneError.
7. Shader varyings carrying ids/seeds (`vInfo`, `vTan`, `vOut`) must be `flat` —
   interpolated ids drift per pixel and every `seedOf(id)` choice shimmers.
8. Keep the `© OpenStreetMap contributors` HUD credit visible — ODbL-required.
9. Variety comes from the asset foundry (`src/assets/`, `docs/ASSET_FOUNDRY.md`): mixes via
   `carMix`/`boatMix`/`plantMix`/`gearFor`, variants via `variantAt` — never per-town lists; every new
   family gets validation + a vertex budget in `tests/foundry.test.ts`.
10. Bump paired cache keys together: worker R2 `t/vN` + client `&v=N`; bump `VER` in
    `lidar.ts` whenever measure/raster/tree logic changes.
11. Visual review reads ONLY `shots/<region>-montage.jpg` — never the per-shot PNGs.
12. Local frame: +x east, +z south (north = −z), metres, per-region origin.

## Session ritual

Start: `git log --oneline -5` → `npm run init` → read `feature_list.json` (pick ONE item —
mark it `in_progress`) + the latest `docs/earth/LOG.md` entry. If init fails, fix the
baseline first — never stack feature work on a broken start.

End: typecheck + tests pass → montage reviewed if visuals changed → no leftover debug
artifacts (console.log, TODOs, temp files) → update `feature_list.json` (status + evidence)
→ append a `docs/earth/LOG.md` entry → commit only when the repo is safe to resume.

Context low? Wrap early — write state before polish. A clean handoff beats a rushed finish.

## Topic docs — read when the task touches that area

- `docs/earth/HANDOFF.md` — **picking up from another session? read it first**: where the work stands, what comes next and in what order (the lower 48 alive: canopy layer, ecoregions, the flora and wildlife packages), how to check it, Robby's rules

- `docs/GAMEPLAY_VISION.md` — **read before any gameplay work**: the world blooms from pencil into colour as you look, pencil means collectable (tap to paint it), regional rares as data, real travel (van, yacht, plane, balloon), your own private layer of the world, one home behind every door; §17 sets the order — **foundations first** (Tier 0: every tile loads, commercial-safe services; Tier 1: looks right everywhere), the game after. Track each in `feature_list.json`. (`docs/GAME_DESIGN.md` is superseded, apart from learning from life, the Almanac and the summoning solvers)

- `docs/REGIONAL_LIFE.md` — **read before any flora, fauna or greenery work**: the 16 regions, what the foundry has and lacks, how greenery is measured (the green spots), the build order; the reference per region (plants layer by layer, wildlife with how common, signatures, range limits) is `docs/regional-life/`
- `docs/agent/world-data.md` — regions, REGIONS spec, fetch/merge/bake, detail zone, `?at=` deep links, NAIP roof imagery
- `docs/agent/streaming.md` — tile stream + margin semantics, tile worker + BuiltTile packing, terrain packs, real-lite worker (wrangler/R2/virtual manifests), DEM, LiDAR measure pipeline
- `docs/agent/rendering.md` — styles/recipe, shader + material conventions, ground paint, grass
- `docs/agent/gameplay.md` — buildings/roofs, interiors, WalkWorld collision, vehicles, ambient life, asset foundry (flora/fauna/furniture, wildlife, the Grow verb), paint-as-you-explore, photo mode/sketchbook/commissions, atlas map + search, hints, arrival cards, sound
- `docs/agent/debugging.md` — soak, capture/montage contract, in-page montage fallback, worker logs, dev-server quirks
- `docs/earth/OPEN_WORLD.md` — phase list + vision · `docs/earth/LOG.md` — session log + queued bugs · `docs/earth/REVIEWER.md` — review history (keep scores/rationale consistent) · `docs/ASSET_FIDELITY.md` — data/builder upgrade plan for J2/L · `docs/FIDELITY_REALITY.md`
