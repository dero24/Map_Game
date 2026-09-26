# Earth expansion — session log

Newest first. One entry per work session: what changed, what was verified, what's next.

## 2026-09-26 (b) — One consistent world, Phase I style, realistic houses

**User direction:** land in Sea Bright, walk to Monmouth Beach and beyond with no detail cliff;
houses should look real (shape, detail, windows, variety); one world to build on.

**One world (`shore`).** Diagnosis: each town had its own origin + bake, and the bake gave
full detail only inside `slice` — the whole backdrop ring (Rumson, Long Branch, Highlands)
was baked `lod` (simplified outlines, minor roads dropped, no addresses) and the runtime gated
doors/porches/interiors/props on the region slice. Fix, in three parts:
- `scripts/merge-raw.mjs` unions already-fetched regions (`mergeFrom`) — OSM by type+id,
  Overture by id, NAIP roof colours, WorldCover mosaic on ESA's 1/12000° grid, terrain tiles —
  with a coverage assertion. `shore` = Sea Bright → Monmouth Beach, Sea Bright's origin +
  spawn; the towns are `hidden` merge sources (never listed); old `?region=` links land in it.
- Bake detail zone = backdrop (`D`, `CFG.detail === 'slice'` restores the old behaviour);
  tiles carry `detail`; builders use `detailBox(json)` (buildings/props/signs). The slice keeps
  its two real jobs: the 2 m terrain lattice and the lamp compositor box.
- Past the backdrop, real-lite + DEM stream as before; DEM is now on whenever a tile service
  exists (baked regions included); baked cells never read a neighbour's DEM overhang.
Found en route: the IndexedDB cache fingerprint ignored tile *content* — a re-bake with the
same layout served stale tiles forever. Bake stamps `bakeId` (FNV over tile payloads).

**Dev plumbing.** `vite.config.ts`: `/__tiles/*` proxies to whichever port `wrangler dev`
took (8787/8788/8789) — the client probes it first (same-origin: no port guessing, no COEP
friction; the in-app browser blocks cross-port fetches). `/__shot` sink +
`tools/inpage-montage.js` (see AGENTS.md) — the shot harness for agents without Playwright.

**Phase I (first cut).** `src/world/styles.ts`: `regionStyle(lat,lon)` → climate (coarse
Köppen from latitude + continental boxes), world region, family (clapboard / brick / nordic /
stucco / adobe / tropical / eastasian), palettes, roof habits, window vocabulary, tree species
+ greens + density, biome ground wash, driving side. `meta.style` on virtual manifests; baked
regions derive it from the origin (NJ → `temperate/clapboard/R/na`, bit-identical palettes);
the key reaches the tile worker at init. Consumers: building palettes, synth roof mix, tree
scan, ground `uBiome`, facade `uWinStyle`. Upgrade path: a real Köppen/WorldCover raster
behind the same function. Tests: `tests/styles.test.ts` (NJ unchanged; Oslo nordic, Windhoek
adobe, London brick+left, Tokyo/Sydney left, Rome Mediterranean…; recipe determinism).

**Houses (J2-a, pulled forward — user priority).** `src/world/recipe.ts`: every per-building
decision = pure f(bd.s, style, fc/rc): facade/roof/trim colour, siding (clapboard / cedar
shingle / brick / stucco / board-and-batten → fraction of `vInfo.y`), roof material (asphalt /
standing-seam / clay tile / slate / shake → `vInfo.w` on roof faces), pitch, dormers, bay,
downspouts, chimney type; mapped brick-coloured walls get brick siding; aerial roof colours
clamp into a roofing gamut. Geometry: foundation plinth + ledge, parapet coping + cornice,
gabled dormers fitted into the street-facing roof plane (pure pre-pass → 1½-storey only when
one fits), downspouts with kick-outs, exterior side chimneys (door-aware, clearance-tested),
canted bay windows, lumpy clipped hedges. Roof priors: houses ~97% pitched (bake + realTile,
tile cache v4→v5); skeleton failures fall back to the other style, then a convex-hull hip
with walls rising to meet it. Regional sash vocabulary in the window shader.

**Verified:** typecheck; 67/67 tests (vitest-API shim — vitest can't load its Windows rolldown
binding from this sandbox); montages `shots/houses-1..4.jpg`, `dormers.jpg`, `oneworld.jpg`;
in-game roof audit 4.4% flat houses (= data). Expert review 7/10 → all must-fixes applied
(REVIEWER.md). `npm run build` still needs a run on the dev machine.

**Re-plan (why):** the fidelity research (massing/storeys/roof silhouette carry recognition;
facade colour is forgiven under paint) and the reviewer agree — **L-lite before J2**: measured
heights/storeys (Overture `height`/`num_floors` already in the raw join, 3D-GloBFP where
missing) matter more than more asset polish. **J1 in parallel**: the ring is walkable now, so
ground paint (walks, drives, lawns) and per-tile lamp pools outside the slice are the
"keep walking" contract. Then J2 rest, then a **vehicle/traversal spike** (25 m/s stresses
LOAD_R, worker throughput, DEM latency — and powers "ride any vehicle"/flight abilities),
then K life. Gameplay (vehicles, abilities) rides on the traversal spike, not before it.

## 2026-09-25 — Fidelity reality check (research, no code)

- User asked: MSFS shows "even my home house" via satellite imagery — should we chase
  it, pivot to an AI asset-builder product, or upgrade? 3 research agents ran.
- Findings + verdict in **`docs/FIDELITY_REALITY.md`**: MSFS = licensed photogrammetry
  (few hundred metros only, legally unreachable); per-house identity is achievable as
  *structural* truth (footprint+height+roof+roof color) under watercolor — facade
  color/texture is the one true gap (~1–3% global coverage, license-blocked).
  Japan PLATEAU is the outlier (CC-BY textured LOD2 — a JP bake could show real
  facades). Verdict: keep watercolor path; `bd.h` + US lidar roofs + vertex AO next;
  user-photo upload is the one legal path to true per-house fidelity.
- Also this session: dev UX — `TILES` auto-defaults to `localhost:8787`, `/health`
  probe + `?tiles=off`; user reported two queued bugs — window/door decal flicker
  (cosmetic) and the late-DEM seam (flat s-tiles beside hilled cells). Both logged in
  PROGRESS; handoff prompt written for the next agent.

## 2026-09-26 — Queued bugs fixed + the window asset rebuilt (Opus handoff session)

**Late-DEM seam (fixed).** s-tiles that lost the 4 s DEM race were built flat and never
revisited. Now the worker marks such a build `BuiltTile.demLate`; the stream records the
mount as `flat` and immediately asks for a *relief* build (`build(..., relief=true)`): the
worker awaits the untimed cell DEM (same promise the w-twin shares) and returns either
`null` (no patch — nothing to swap, retried ≤3× with 12/24/36 s backoff) or a full rebuild
on real heights. That lands in the build queue as `{replace:true}`; `mount()` unloads the
flat version and mounts the new one inside one synchronous call (fp/interior keys are
identical `${id}:${i}` across builds, so unload-first is required and no frame ever sees an
empty cell). Discarded if the w-twin already won or the cell unloaded. Related shelf bug
fixed en route: a *partially* failed DEM fetch sampled missing slippy tiles as 0 m — a fake
cliff to "sea" (also flagging water). `fetchDem` is now all-or-nothing, and neither the
slippy-tile cache nor the per-cell cache (worker + main-thread fallback) keeps failures, so
transient 5xx/timeouts retry instead of pinning a cell flat for the session.
Not yet verified live (needs `wrangler dev` running); typecheck + 60/60 tests.

**Window/door flicker (root cause found — it wasn't the fade).** `vInfo.x` (building id,
up to ~8.5 M for synth cells: `ord × 4096`) was an *interpolated* float varying; barycentric
error nudged it per pixel and `seedOf(id)` → every per-building choice (shutters or not,
their colour, siding, which windows exist) re-hashed pixel-to-pixel. That is the "black
sill/door flicker on approach": fine horizontal hatching that shifts with distance/angle,
which the Kuwahara pass then shredded into speckle. Fix: `flat varying` for `vInfo`,
`vTan` (buildings) and `vInfo`/`vOut` (interiors). Montage proof: raw close-up hatching gone.
Also fixed the transition itself: facade openings used to track distance continuously
(7–14 m) through a screen-space Bayer dither — standing mid-range left the house
permanently half-cut, crawling as you moved, and it opened onto nothing while the sliced
interior was still pending. Now: open only once the interior mesh exists, hysteresis
(open < 8 m, close > 10 m), ~0.3 s time-based wash with world-anchored `vnoise3` (can't
crawl), the opened house keeps focus until its wash runs out (no snap-shut when a neighbour's
door gets closer), and individual *windows* only turn into real openings within ~4–6 m of
that window — from the street the visited house keeps its glass like its neighbours.
Doors still read closed at range (kept, per the user).

**Window asset rebuilt** (user: "they look horrible" — agreed; J2's SDF-decal item pulled
forward). `buildings.ts` facade shader: head/drip-cap + light-catching sill with a soft
shadow down the siding; deep blue-grey glass with sky reflection (fresnel), one soft
diagonal sheen, reveal shadow at top/sides; muted interior-mapped room only up close and
darker than the street by day (that's what makes glass read as glass); per-building sash
style (6/6, 2/2, 1/1) with muntins that fade before they alias; pulled-down shades on ~⅓ of
windows (glow at night); panel shutters with a contact shadow replace the louvred stripes;
storefronts get mullions + transom bar, and shop lamps no longer tint daytime glass peach;
churches get round-headed lancets with stained-glass tint (`Win.arch`, `archIn()` shared
with the interior shader so the cut holes match); attic gable window gets lights + sill.
Hole geometry for interiors is unchanged (glass half-size `ww/2-0.08`).

**Tooling.** `tools/inpage-montage.js` + a dev-only `/__shot` sink in `vite.config.ts`:
agents driving a live browser (no Playwright) can pose shots and save a full-res contact
sheet to `shots/`. Vitest can't run in a Linux sandbox against a Windows `node_modules`
(rolldown native binding) — this session ran the suites through a throwaway ts-transpile +
vitest-API shim (60/60). `npm run build` still needs a run on the dev machine.
Shots: `shots/flicker-before.jpg`, `flicker-after.jpg`, `windows-before.jpg`,
`windows-after.jpg`, `shutter-close.jpg`.

## 2026-09-25 — H2: Terrarium DEM for virtual cells (shipped, reviewed 8.5/10)

**Status: shipped.** Expert review: **8.5/10 — SHIP, `?at=` earns the public flag once
the worker deploys** (user step: `wrangler login` → `r2 bucket create` → `wrangler deploy`
→ `manifest.tilesUrl`).

- New `src/world/dem.ts`: fetches Terrarium z14 PNGs through the CF worker's new
  `GET /dem/<z>/<x>/<y>.png` route (S3 `elevation-tiles-prod` proxy — required because
  the game is COEP-isolated and the bucket sends no CORP), decodes R*256+G+B/256-32768,
  bilinear-samples a 65×65 grid at 16 m pitch per cell, packs a synthetic TerrainLayer
  (heights f32-cm — i16 would cap real mountains at 327 m — plus honest defaults:
  sdf +50 m, cover 30 grass, flags 0, oceanD far).
- Plumbing: `BuiltTile.dem` carries `{buf, layout}`; tile worker fetches per-cell
  (s/w twins share via `demCache`), registers the patch BEFORE synthTile/buildTile so
  placeholder lots and real tiles both build on real heights; main thread registers
  under the cell key (prefix stripped) with `demHolders` refcounting so the s→w swap
  can't drop terrain mid-stride. `TerrainLayer.height` accepts `type:'f32'` chunks.
  s-tiles race DEM at 4 s; w-tiles await (masked by OSM). Enabled only when VIRTUAL.
- Cache: worker edge+R2 `dem/v1/` keys (PNGs immutable → 7-day edge TTL).
- **Verified live:** Presidio SF (37.8005,-122.4661) — 14 cells patched, heights
  71/96.7/94.7/25.2/56.7 m, walker stands at y=28.6 on a real hill. s-tiles get DEM.
- **Bugs found + fixed en route:** `bmp.close()` zeroed dims before `getImageData`
  (every fetch null — the real reason DEM silently failed); per-cell fetch bursts
  self-stampeded (now slippy-tile dedupe + 4-concurrency gate); the 4 s s-tile race
  poisoned the shared cache promise (now callers race an untimed per-cell promise).
- **FIXED pre-review:** `bmp.close()` zeroed dims before `getImageData` (silent-null
  root cause); per-cell DEM fetch stampede → slippy-tile dedupe + 4-concurrency gate;
  the 4 s s-tile race poisoned the shared cell promise → callers race an untimed one;
  `dem.buf` transfer detached the cached buffer → `slice(0)` per build; samples sat
  corner-aligned while `TerrainLayer.bil` expects cell centers → 64×64 at half-offsets.
- Reviewer should-fixes applied: sdf/flags now derive from elevation (sea = water —
  synth can't plant suburbs in bays anymore); `patchFor` checks the 8 neighbour cells
  (DEM overhang margin) so unbuilt rims don't leave flat shelves; health probe on the
  auto-defaulted service — dead worker → toast + synth-only (`?tiles=off` also works).
- Verified live: Presidio SF — 14 cells patched, heights 71/96.7/94.7/25.2/56.7 m,
  walker at y≈28 on a real hill, patches persist through s→w swaps; montage shows the
  bay and the real Marina grid with relief. 60/60 tests (new `dem.test.ts`), build clean.
- Deferred polish (reviewer): partial-tile-failure shelf (null cached per session),
  coarse-tier DEM is free real-mountain silhouettes (kept), spawn-adjacent DEM priority
  if the flat→hill pop reads badly in play, antimeridian (works — commented).
- User-reported cosmetic (queued): window-sill quads flicker black/pop at mid-distance;
  door meshes flicker on approach — likely the window-fade/door distance threshold or
  z-fighting on facade decals. Doors reading closed at range is liked; the pop-in is
  the ugly part.
- **User-reported seam bug (H2 follow-up, asked me not to fix yet):** flying past the
  bake edge, an s-tile whose DEM raced out at 4 s builds flat forever — beside a
  DEM-hilled cell it reads as sunken houses/trees + walking through the hill. Mesh
  heights and walker heights are consistent *within* a tile; the tile just never
  upgrades. Candidate fix: re-queue a rebuild when a mounted s-cell's DEM resolves
  late (mesh + collision-scope swap mid-walk), or lengthen the placeholder budget.
  Mostly affects cells reached slowly — spawn cells block on `ensureAround` and
  usually get DEM first.

- `realTile.ts` hybrid fill: when a cell's owner building density is <20/km of
  fillable road (residential/unclassified/tertiary/secondary/living_street), seeded
  L-shaped lots plant along real street edges — pitch ~22–32 m, jittered setback,
  alternating sides, 18 m bucket dedupe, rejects corners inside water or mapped
  footprints. Always `own` on the emitting (road-owner) cell so margin-landing fills
  don't get dropped by both neighbours. `Building.gen='fill'` marks them.
- Cache versioning: worker R2 key `t/v1→t/v2`; client tile URL gains `&v=2` (edge
  Cache API keys on the full URL — both layers bust together).
- Verified: 12/12 realTile tests (new: sparse→fills, dense→none, no water/footprint
  overlap, determinism); live worker on Hastings NE (40.586,-98.388): 88 mapped +
  90 fills = 153 bldgs; farmland/track-only cells correctly emit zero fills;
  56/56 suite, build clean, montage shows the sparse grid town reading as a place.
- Expert review round 1 on the fill (7.5/10) → fixes: fills emit round-robin across
  roads (cap can't starve later streets); `leisure`/`landuse` rings fetched as reject
  masks (no houses in parks/fields); mapped-building centroids stamp the 18 m buckets
  (small chapel inside a fill rect can't be swallowed); fill centers clamp to cell
  interior (no cross-seam stacking); diagonal bucket neighbours; position-seeded lots.
  Cache bumped v2→v3. Verified: 57/57 tests, live tile spread 18/28/24/20 by z-band.
- Round 2: **8.5/10 — no must-fix, "move to H2"**. Applied the cheap polish: per-road
  rng streams keyed by first vertex (mirror-order can't perturb lot positions), height
  derived from `s`, cache v3→v4. Deferred polish (rare-input): highway-plaza bypass,
  tangential graze vs large buildings, cross-seam fill adjacency.
- Commits: `7f32dfb` (fill), `e379253` (round-1 fixes), `96fe7c6` (round-2 polish).
  All local only — not yet pushed (earlier push went through `9a27f4d`).

## 2026-09-25 — Session handoff (for the next worker on this codebase)

**Where things stand.** H1 is done and reviewed twice (6.5 → 8/10). The open-world
premise is literally true in dev: `?at=51.5033,-0.1195&tiles=http://localhost:8787`
walked real London tonight — 8.3k footprints / 8.5k roads, real street names on the
HUD ("The Queen's Walk"), clean placeholder→real swaps, zero errors. `?at=` stays
behind the flag; the reviewer's gate for calling it shipped is H2's real terrain.

**Commits (all local — nothing pushed; branch is 4 ahead of origin):**
- `16095e9` Phase G: infinite world via deterministic procedural tiles
- `0107bb7` H1: real-lite tile service + open world `?at=` (worker/, realTile.ts, w-*/s-* swap, virtual manifest, ODbL credit)
- `5dc3f9e` Review round 1 fixes (painting toast, stranded-`?at` guard, HUD names, tz, settleWalker, spawn yaw, tree/bench points, paved footsteps)
- `adc60f5` Review round 2 fixes (settleWalker only fires on genuine swallows, region+far-`at` redirect, toast dedupe/throttle)

**Architecture in one paragraph.** `realTile.ts` (Overpass→TileJson) is the single
shared transform: the CF worker bundles it, vitest exercises it. `TileStream.specAt`
returns `[w-*, s-*]` twin specs for non-baked cells when `tilesBase` is set; s mounts
instantly, w retires it on arrival (`mount()` → `unload(s-twin)`). `virtual.ts` builds
a manifest with a snapped origin + flat 3 m synthetic terrain layer (rides in-band to
the tile worker as `bin`). Everything flows the same `buildTile → pack → mount` pipe.

**Gotchas learned the hard way.**
- The page is COEP-isolated: cross-origin worker responses need
  `Cross-Origin-Resource-Policy: cross-origin` or tiles get blocked.
- `x-tile-cache` baked into a cached response lies forever — store a twin response.
- Concurrent misses stampede Overpass unless the worker dedups in-flight promises.
- `--eval` strings in capture.mjs must be an IIFE/expression — top-level `return` throws.
- PowerShell: `git commit -m "<here-string>"` breaks on embedded quotes — write the
  message to `.commitmsg.tmp` and `git commit -F`.
- `worker/.wrangler/` is miniflare state — gitignored, keep it out of commits.
- Overpass reality tonight: 25–90 s/cell, 429/504 storms — the placeholder + negative
  edge cache + rotation all earned their keep. R2 makes it once-per-population.

**Next queue.** Worker deploy needs the user's Cloudflare account
(`wrangler login` → `r2 bucket create map-game-tiles` → `deploy`, then `tilesUrl` on
manifests / Pages). Then: H1c hybrid fill (synth lots on sparse real roads) → H2
Terrarium DEM (kills the flat plateau; ungates `?at=` publicly) → J/K parity.
Phase-G reviewer Round 2 (screenshot-backed) is still pending in `REVIEWER.md`.

---

## 2026-09-24 — Expert review round 2 → fixes (score 8/10)

- Re-review verdict: fixes landed; `?at=` is now honest behind the flag. Two real
  bugs in my round-1 code: `settleWalker` fired on every mount — including while the
  player stood legitimately inside a house (2D footprint test can't tell indoor from
  swallowed); and `?region=x&at=far-outside` still stranded silently.
- Fixed: `settleWalker` now only moves genuinely swallowed walkers — a wall through
  the body (`walk.blocked` at 0.28 < the 0.35 walker radius, so leaning on a wall is
  safe) or inside a solid footprint with no interior (`buildingAt` + `!interiors.indoors`
  + `interiorAt<0`). Boot-time `?region` + far `?at` redirects like `teleportTo` does
  (drops `region`, re-picks or goes virtual). Paint toast: re-arms per streaming
  burst, throttles after 3 fires (2.7 s → 9 s), defers instead of stomping other toasts.
- Verified: typecheck, 53/53 tests, build, 90 s soak with the hooks live — 0 stalls,
  0 hitches >250 ms, 0 frame errors (worst subsystem 9.9 ms interior).
- Reviewer's remaining notes (accepted, deferred): toast queue proper; wall-band/deck
  swallow detection is partial (wall-through-body covered); `?at=` public-shipped
  still gated on H2 DEM.

## 2026-09-24 — Expert review round 1 → fixes (score 6.5/10)

- Reviewer verdict: "the skeleton shipped; the fantasy still arrives late" — the
  open-world swap architecture is right, but the first minute gives zero signal that
  real streets are coming, `?at=` without `?tiles` could strand the spawn 5,500 km out,
  the HUD never learns a street name, UTC clock lied, and the s→w swap could tombstone
  collision under the player's feet.
- Fixed: persistent "the real streets are painting in…" toast while `w-*` fetches are
  in flight; `?at=` beyond all backdrops without a service now drops at the nearest
  baked town with an explanation (G-teleport redirects also drop `region`); HUD place
  line scans `stream.primRoads` so real names show (verified live: "The Queen's Walk",
  South Bank); virtual tz derived from longitude (`Etc/GMT±n`); `stream.onMount` +
  `settleWalker` nudges the player out of walls after a swap (verified live — fired);
  spawn yaw falls back to nearest mounted road instead of north; real-lite query now
  also pulls `natural=tree`/`amenity=bench` nodes → points; footsteps near mapped
  streets are 'paved' even where the flat layer says grass; virtual sub reads like a
  place ("51.50° N, 0.12° W — the real streets stream in").
- Held for later (documented): flat terrain/water gating → H2 DEM; per-tile lamp pools
  + hybrid lots + life palette → H3/J/K; coarse ring stays synth by design.
- Verified: typecheck, 53/53 tests, build, live probe in virtual London (toast fired,
  settle nudge fired, real names on HUD, 11 w-tiles mounted, 0 errors).

## 2026-09-24 — H1: real-lite tile service + open-world `?at=` — walking London

- **`src/world/realTile.ts`** (new): Overpass JSON → `TileJson`, shared verbatim between
  the Cloudflare worker and the client test-suite. Ports the bake's road/building/colour
  tables + `partitionEntities` margin/`own:0` semantics; coastline ways close against the
  cell boundary via a boundary-parametrized arc + wet-side probe (sea gets a real shore).
  Element-id-seeded heights/roofs → deterministic tiles for every client.
- **`worker/`** (new): `wrangler.toml` + `src/index.js` —
  `GET /tile/<cx>_<cz>.json?olat=<deg>&olon=<deg>` → edge Cache API → R2 → Overpass
  (3-endpoint rotation on 429/504) → transform → R2+edge put. In-flight dedup so
  concurrent misses share one upstream call; 60 s negative edge-cache on upstream
  failure; CORS + `cross-origin-resource-policy` (the page is COEP-isolated in dev);
  `x-osm-attribution` header + `attribution` field on every tile (ODbL).
- **Client**: `?tiles=<base>` (or `AtlasManifest.tilesUrl`) → non-baked cells become
  `w-*` specs fetching absolute URLs (IndexedDB-cached as usual); each streams a `s-*`
  synth placeholder twin that mounts instantly and retires when the real tile lands —
  same seamless-swap idiom as coarse→detail. Coarse silhouettes stay synth (no Overpass
  burn for distant cells). `realExtras` gives w-tiles ground chunk + asphalt ribbons on
  real centrelines + water sheets (earcut, holes included). Lamp maps skip w/s cells.
- **Open world**: `?at=` beyond every baked backdrop + `?tiles` → `virtualRegion()`
  builds a manifest in code — origin snapped to a 1/64° grid (players at a place share
  cells AND the R2 cache), flat synthetic terrain layer (3 m land; H2 DEM replaces),
  terrain bytes passed in-band to the tile worker. `initCache` namespaces idb per origin.
- **UI**: `© OpenStreetMap contributors` credit line, bottom-right HUD, links to ODbL.
- **Verified**: typecheck, 53/53 tests (9 new realTile cases incl. neighbour-cell
  ownership + coastline wet side), build. Worker smoke under `wrangler dev`: real cells
  for Sea Bright (Ocean Ave, 7-Eleven) and central London (Blackfriars Rd, Inner London
  Crown Court — 1292 buildings/2740 roads per cell). Playwright probe at `?at=London`:
  8.3k footprints/8.5k roads mounted, s→w swaps clean, 0 errors. Montage shows real
  streets + buildings rendering in watercolor.
- **Upstream reality**: Overpass ran 25–90 s/cell tonight (not the 2–8 s the plan
  assumes). The placeholder absorbs it; R2 + in-flight dedup make each slow fetch
  one-time-per-population. Watch it — may warrant a `maxsize`/timeout tune or
  Geofabrik pre-seeding for popular regions.
- Next: H1c hybrid fill (synth lots on real roads where footprints are sparse), then
  H2 Terrarium DEM; deploy the worker (needs the user's Cloudflare account) and set
  `tilesUrl` on manifests / the Pages deployment.

## 2026-09-24 — Tiles → worker → cache → origin → coarse ring → deep links

- Shipped the whole Phase A–F sequence (commits `e433f1b`…`154cf60`): per-tile terrain packs,
  worker-built tiles (~5 ms mounts), IndexedDB cache, floating origin, 8 km coarse silhouette
  ring, `?at=lat,lon` deep links with doorstep-first spawn, plus `G` in-game teleport.
- Self-review pass (`5764762`): fixed worker-crash job deadlock; coarse→detail swap moved to
  just before the detail group lands.
- Trees: mistagged OSM road-side points now slide to the near verge instead of dropping;
  procedural scan trees get 4 new silhouettes (oak, shrub, spruce) via the same blob recipe.
- Root cause found for "trees still in the road": `pavedMask` ran on prim-filtered roads so
  margin-context (neighbour-owned) streets never masked anything, and the tree scan zone
  spanned overlapping tiles with an identical rng → duplicate trees at seams. Fixed by passing
  the unfiltered tile json (`ctx`) and clamping candidates to `spec.box`.
- Verified: typecheck, 44/44 tests, build, montages (street/porch/interior/bridge/top-downs),
  soak (stalls=2, frameErrors=0, mount ≤8 ms).
- Paused on masterplan phases; iterating on world variety next.

## 2026-09-24 (pm) — Variety pass 1: street furniture + real road fix

- Root-caused "trees still in the road" for real this time: `pavedMask` ran on the
  prim-filtered world (margin-context roads, `own:0`, stripped) so neighbour-owned streets
  never masked anything; also the identical per-tile rng meant scan candidates inside
  overlapping tile zones spawned twice. `buildProps` now takes `ctx` (unfiltered tile json)
  + `box` (scan clamp). Verified top-downs: lanes clear, yards full.
- New street furniture, all instanced + collision-scoped: fire hydrants (~1/4 of mailbox
  curbs, red/yellow), benches (real `bench` points + plaza/park/pitch/pool/beach-edge rims,
  seaward-facing on the beach), trash cans beside ~1/3 of benches, terracotta planters
  (some doors get a pair), and boxy front hedges flanking the walk on ~20% of houses.
- Hedge colour softened (15% toward dark spruce) and height dropped to 0.85 m after the
  first montage.
- Verified: typecheck, 44/44 tests, montages (shop/porch/doorway/raised/roofs/beach tops).

## 2026-09-24 (eve) — Placement fixes from play feedback

- User report: hedges/bushes landing on sidewalks and carriageways. Cause: hedge offsets were
  a fixed 6 m out from the door with only a `walk.blocked` check — nothing knew where the
  road edge was. Fix: `clearOfRoad(x,z,margin)` (road-edge distance) + `paved` checks on every
  hedge end/center; hedge tries yard depth first, falls back to foundation hug; porch doors
  skipped. Benches pull 1.1 m inside their area ring; hydrants/benches/cans all get road-edge
  margins (0.8/1.6/1.0 m — furniture may sit on pavement, never in lanes).
- Re-verified via porch/doorway/raised/shop + residential top-downs: shallow yards now skip
  hedges instead of planting on the sidewalk; lanes and kerbs clear.

## 2026-09-24 (night) — Interior amortization

- `Interiors.build` became `buildGen` — a generator yielding between sections (facade walls,
  per-storey slabs, per-partition, per-flight stairs, per-room furniture, assembly).
  `activate()` now lands state immediately and queues a pending build; `pump()` inside
  `update()` advances it under a ~3.5 ms/frame budget. The ~16 m door-proximity target means
  the approach walk covers the whole build; mesh swaps in atomically on completion.
  `prime()` keeps a synchronous drain for shader warmup at load.
- Soak: worst interior subsystem ms 112 → **7.3**, `stalls=0`, `hitches>250ms=0`,
  `frameErrors=0`, `maxFrame=167` over 90 s — the last real in-game stall is gone (residual
  multi-second frames from earlier soaks proved environmental).
- Interior montage (inside / inside-night / stairs / doorway): identical output.

## 2026-09-24 (night, review pass) — Six findings fixed

Reviewed commits `5199fe4`..`06ad50d` with a read-only subagent. Findings + fixes:

1. **Lifeguard stands scanned the whole (expanded) tile slice** — every tile emitted identical
   stands + duplicate collision ops. Clamped to `extras.box` like trees.
2. **Tree scan still ran `coverAt/sdfAt` over the entire ~2.9 km² zone per tile** — scan zone
   is now `extras.box` directly (off-box cells cost one comparison each, not terrain lookups).
3. **Legacy single-tile path built a backdrop-sized paved mask** — `maskZone` is now
   `box±8 ∩ slice±250`, capping the worker canvas.
4. **Deterministic `mount()` failure refetched every frame forever** — catch now records
   `failed` for the 10 s backoff.
5. **Shot loops could capture a hollow interior** — 8 pumped frames only cover ~28 ms of
   build; `interiors.flush()` drains pending before `inside/stairs` shots return.
6. **`plans.get(fi)!` outside try + pump failure left uniforms live** — stale keys mark failed
   and `activate(null)` restores the terrain cut + door uniforms instead of a permanent hole.

Post-fix soak: `stalls=0`, `hitches>250ms=1`, `interior=7.75ms`, `frameErrors=0`.

## 2026-09-24 (night) — Mobile support

- **Touch controls** (`controller.ts`): floating joystick on the left ~45% (analog walk,
  full push = run), look-drag on the rest; pinch-zoom disabled via viewport. Touch buttons
  (✈ fly, ⌂ teleport prompt, ☰ journal) appear when `body.touch` (coarse pointer or first
  touch). Keyboard/mouse untouched.
- **Why phones probably failed before**: tile-worker build failures (e.g. no OffscreenCanvas
  on old iOS) retried forever — never escalated to in-page builds. Now 3 consecutive job
  failures → `workerDead` → main-thread builds. And every `new OffscreenCanvas` went through
  `makeCanvas()` (new `world/canvas.ts`) with `document.createElement` fallback; atlas/lamp
  bitmaps via `canvasBitmap()` (`createImageBitmap` path on fallback canvases). `buildTile`
  is async now.
- **Fatal error overlay** (`#fatal`): `error`/`unhandledrejection` print to an on-screen
  panel — screenshot-able on phones.
- Small-screen CSS: intro card, HUD, journal collapse to column under 640 px.

## 2026-09-24 (night) — GitHub Pages deploy

- Pages was set to "Deploy from a branch: main /root" → it served the **raw TS source** —
  `index.html` loads but `./src/main.ts` can never execute → intro stuck at "mixing paints…"
  on every device. `.github/workflows/pages.yml` builds `dist/` (npm ci + build, node 20,
  `public/data/` is committed so tiles ship inside the artifact) and publishes via
  `actions/deploy-pages`. Required once: Settings → Pages → Source → **GitHub Actions**.
  Deployed: run 36200249416 green in 42 s — https://dero24.github.io/Map_Game/ now serves
  the built bundle.
- **Church steeple restored**: the roof-skeleton refactor dropped the backup-era steeple
  (white tower + green 4-sided spire). Re-added on the `roofG` path — tower at the ridge's
  longest-axis end (facade white), `cone()` spire in weathered copper green. Verified via
  ground-level shot at Saint George's: clearly a church again.

## 2026-09-23 � Infinite world: deterministic procedural fallback tiles

The world no longer ends at the manifest edge. Cells outside the baked region synthesize a
watercolor suburb forever � streets, sidewalks, poles, varied houses, benches, trees � via
the same build/pack/mount path as real tiles.

- **src/world/synth.ts** (new): synthTile(spec, seed, terrain) -> a full TileJson +
  extra group (ground chunk + road/sidewalk ribbons). Everything is *field-driven*: a
  warped street grid (108 m pitch, sine-wandered lines), a low-freq noise town mask for
  density, lattice-hash h for every choice. No per-tile RNG for layout -> seams are
  structurally impossible; neighbour tiles agree about shared roads/lots by position.
- **Streaming** (stream.ts): specAt(cx,cz) -> baked manifest tile or {id:s+key, synth:1}
  spec; update() iterates the cell window (not the manifest); radius sweep for drops.
  Fixes found by subagent trace: a queued set kills a resolved-but-unmounted refetch
  storm; coarse silhouettes now cover [LOAD_R, COARSE_R) (was [DROP_R, COARSE_R) - a
  900 m dead zone where nothing loaded); ensureAround enumerates synth cells too;
  synthOrd is cell-hashed (session-independent ids).
- **Worker** (	ile.worker.ts): init takes seed; spec.synth -> synthTile on-thread
  (pure JS, no fetches), then the identical uildTile+pack path. In-page fallback same.
- **Ground** (ground.ts/pack.ts): ground material exposed via userData.groundMat ->
  setGndMaterial(); new pack tag 'gnd'; synth tiles emit a ground chunk into extra.
- **Props** (props.ts): slice containment now uses the tile's own slice box (inSlice)
  so poles/trees/benches emit outside the baked grid; pavedMask bounds clamped for boxes
  fully outside the slice (was negative canvas size).
- **Buildings** (uildings.ts): landmarks ?? [] (synth has none).
- **Collision/main** (collision.ts, main.ts): walk.bounds widened to �4e6 m �
  walkable  forever, water still gates via height/sdf.
- **Life** (life.ts): env bounds widened �10 km so gulls/agents aren't slice-trapped;
  synth roads already reach the sim via primRoads.
- Determinism: seed = 
egionSeed(region) ^ cellHash; all layout choices hash position.
  ID_STRIDE reduced so fpIds stay exact in Float32 attrs.
- **Reviewer** (docs/earth/REVIEWER.md): persistent AAA-designer memory file created;
  round-1 verdict PASS WITH CONDITIONS 6/10 -> must-fixes applied same session
  (town-gated streets, per-axis ribbon heights, benches/entrances, lot jitter + L-shapes,
  life bounds). Round 2 (with screenshots) is the confirmation gate.
- Verified: typecheck + 44 tests + build + soak clean; captures at (-6800,-200) show a
  rendered suburb noon/golden/aerial.
