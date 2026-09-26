# Earth expansion — session log

Newest first. One entry per work session: what changed, what was verified, what's next.

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
