# Earth Masterplan — "walk anywhere real, painted"

North star: open the game anywhere on Earth, walk out the front door of a real
building, and keep walking — forever — while the world paints itself around you.
The two Jersey Shore towns are the proof of style; this document is the path to
the planet.

This plan supersedes nothing: `EARTH_SCALE_THOUGHTS.md` argues *why* and *what*,
`A_REVIEW_FROM_ANOTHER_AGENTS.md` audits what exists. This is the *how*, in
buildable order.

## Status (Phase 0+1, as built)

Phase 0+1 landed in a slightly different — simpler — shape than the z-pyramid
sketch above:

- **Bake**: `scripts/bake.mjs` still produces `world.json`/`terrain.bin` per
  region, and additionally emits `manifest.json`, `paint.json`, and
  `tiles/<cx>_<cz>.json` — fixed 1024 m cells with a 48 m overlap margin
  (`scripts/lib/tiles.mjs`). Entities are centroid-owned; margin copies carry
  `own: 0` so builders see seam context but collision/sim/interiors register
  exactly once. Output is sorted and byte-identical across runs.
- **Client**: `src/world/stream.ts` keeps a 1.5 km load ring / 2.4 km drop ring
  around the walker, mounts one fetched tile per frame, and backs off 10 s on
  fetch failures. All collision registers under a per-tile `WalkWorld` scope
  (`beginScope/endScope/removeScope` — tombstones, no grid rebuilds); interiors
  register/unregister by `"tile:idx"` string keys; the ambient-life worker is
  re-initialised once per settled tile-set (fresh buffers each time — they
  transfer, so shared base arrays are copied).
- **Compat**: regions without `manifest.json` run a synthesized single-tile
  manifest — the old `world.json` path is untouched.
- **Terrain packs**: lod-0 tiles also emit `tiles/<id>.terrain.bin` — a subgrid
  of the slice layer on the shared lattice (no margin; seams are exact by
  construction). `Terrain` gained a patch registry (`registerPatch`/
  `removePatch`, keyed by tile id) consulted before the region layers; the
  stream registers/removes each pack alongside its collision scope. Both
  region layers stay in `terrain.bin` this phase — packs are the delivery +
  ownership mechanism; dropping the slice layer (and its shader/paint
  consumers) is a later cleanup.
- **Worker tile build** (`src/world/tile.worker.ts` + `tileBuild.ts` +
  `pack.ts`): the whole tile pipeline — fetch, JSON decode, builders, interior
  plans, scratch `RecWalk` collision — runs in a module worker. Results cross
  as a `BuiltTile`: geometry as transferable attribute arrays with material
  tags (rebuilt from the main-thread factories), canvases as `ImageBitmap`s
  (sign atlas, per-tile lamp pools — composited into `uLampMap` on mount),
  collision as replayed ops, deck heights as exact `DeckProfile` params.
  Mount now costs ~5 ms instead of a synchronous decode+build; without worker
  support the same `buildTile` runs in-page. Margin-context buildings seed
  the scratch walk (`ctxRings`) so placement queries see neighbours
  deterministically, and landmarks are emitted by exactly one tile (nearest).
  Soak note: multi-second stalls still appear but reproduce identically with
  the worker disabled — pre-existing/environmental, not tile-related.

Verified: typecheck, 44/44 tests (incl. pack/ops/deck round-trip and buildTile
determinism), build, identical bake hashes, capture montages, and soak
(mount ≤ ~8 ms; remaining stalls are environmental — see above).

Still open from the plan: coarse LOD ring, IndexedDB tile cache,
floating-origin re-anchoring, `?at=lat,lon`,
atlas journal, seam-stitched life districts. The region slice layer is also
still whole-region — per-tile packs exist and are live, but
paint/ground/shader consumers still read the resident slice + backdrop.

## Design invariants (non-negotiable)

- **Procedural-first.** Everything is generated from open data or from seeded
  rules over it. No per-place hacks; identity comes from data (`world.json.meta`,
  OSM/Overture attributes, climate zone). A new place must need zero code.
- **Deterministic.** Same tile + same data release → same world, on every
  machine. All randomness flows through `core/rng` hashes seeded by stable
  feature IDs, never by load order or array position.
- **Watercolor bar.** Chunky-but-charming. The style forgives thin data; we
  optimize for *believable*, not photoreal.
- **Always playable.** Every phase ends in a working game with typecheck, tests,
  build, soak and montage green. No big-bang rewrite.
- **$0 at hobby scale.** Static hosting, free data, free tiers. Pre-bake the
  places people actually go; generate the rest on demand.

## What we already have (the load-bearing parts)

| Asset | Why it matters at planet scale |
| --- | --- |
| `protocol.ts` + `ambient.worker.ts` | The same SAB/typed-array/double-snapshot pattern the 131k-entity reference engine uses. Reuse verbatim for tile-decode and any future workers. |
| `interiors.ts` on-demand activation | Interiors already build only for the building you're inside. That's the LOD pattern the whole client generalizes to. |
| Straight-skeleton `roof.ts`, real heights (88%), aerial roof colours | The "buildings feel real" work transfers to every Overture-covered town on Earth. |
| `WalkWorld` collision | Correct height-banded walls/decks/holes. Needs *scoped* add/remove for tile unload — the only structural gap. |
| Deterministic RNG + hash | Seed-by-feature-ID is already the rule; enforce it as an invariant (see Seeds). |
| `tools/capture.mjs`, `tools/soak.mjs` | Become per-place verification: `?at=lat,lon` + shot names; soak teleports across tile seams. |
| Fetch/bake scripts + `scripts/config.mjs` | The tile producer. `bake.mjs` already isolates "one region" — it becomes `bakeTile(z,x,y)`. |

## Target architecture

```
            PMTiles / open data (OSM, Overture, Terrarium, WorldCover, land-polys)
                                   │
        ┌──────────────────────────┴───────────────────────────┐
        │ bakeTile(z,x,y) — same code as bake.mjs, per tile    │
        │   runs offline in Node  →  static tile files (R2)    │
        │   or in a browser/worker → IndexedDB cache           │
        └──────────────────────────┬───────────────────────────┘
                                   ▼
   tile pyramid  z8 "continent" … z14 "town" (~2.4 km) … optional z16 detail
                                   │
        ┌──────────────────────────┴───────────────────────────┐
        │ client streaming ring                                │
        │  detailed tiles within ~1.5 km of the walker         │
        │  coarse tiles to ~8 km, land-cover horizon beyond    │
        │  floating origin re-anchors every few km             │
        │  workers: tile decode/mesh, ambient life, interiors  │
        └──────────────────────────────────────────────────────┘
```

- **Tile pyramid.** Same packed format as today's `world.json` + `terrain.bin`,
  per tile: quantized rings (0.1 m), delta-coded roads, gzip. Budget 50–300 KB
  per populated tile, ~0 for ocean/desert. A z8 tile is just the same bake over
  a huge bbox with aggressive simplification (main roads, big water, land cover).
- **Streaming ring.** Generalizes today's slice+backdrop split to N levels:
  z14 tiles near, z11/z12 mid, a global land-cover+DEM backdrop beyond. Each
  level has an unload radius; crossing it drops the tile's scene objects, its
  `WalkWorld` registration, its interiors, and its life-sim contribution.
- **Floating origin.** All render coordinates are relative to a re-anchoring
  origin (today's single tangent-plane origin already is one). Walk a few km,
  re-anchor: subtract the shift from every live transform and snapshot value.
  float32 stays happy forever.
- **Scoped world state.** `WalkWorld` gains a `removeScope(id)` (tag every
  polygon/wall/deck with its tile id). Interiors, props, signs, ground paint and
  life-sim data are per-tile scopes in the same registry pattern.
- **Life sim districts.** The ambient sim's road graph is per-tile-set; across
  tile seams, edge endpoints stitch by node coordinates (the `buildLifeInit`
  node-merging code already does this inside one region — extend it to seam
  keys). Cars/peds despawn/respawn at tile edges, so the sim never needs a
  global graph — just the loaded ring.
- **Determinism.** Seed = `hash(tileId, featureId, role)`. Never from array
  index or load order — two players seeing the same tile must see the same
  paint, the same house colours, the same dog.

## Data strategy per layer

| Layer | Now | Planet version |
| --- | --- | --- |
| Roads, water, POIs | Overpass per region | Protomaps planet **PMTiles** (vector tiles, HTTP range reads, no key) — or on-demand Overpass only for pre-bake runs |
| Coastlines/land mask | flood-fill from OSM coastline ways | pre-split OSM **land polygons** (osmdata.openstreetmap.de) — free, robust |
| Buildings | Overture via S3 query | Overture GeoParquet via DuckDB-WASM **or** Overture PMTiles, per tile |
| Elevation | Terrarium tiles | same — it's already a streaming tile format (AWS open data) |
| Land cover | ESA WorldCover bbox | same service, tiled; also drives biome/climate |
| Roof colours | USDA NAIP (**US-only**) | NAIP in the US; Sentinel-2 / Esri wayback elsewhere (coarser, still fine for roof tone); palette prior as last resort |
| Climate/style | n/a | Köppen grid → regional style presets (roof pitch, facade palettes, vegetation, vehicle mix) |
| Landmarks | Twin Lights / bascule special-cases | registry keyed by OSM/Wikidata id → authored model slots (lighthouses, bridges, towers) |
| Addresses/names | OSM tags | same — sparse but works everywhere |

**Honest caveat:** "verify current endpoints" — Overture PMTiles availability and
Protomaps hosting terms move fast; Phase 3 starts with an endpoint spike, not an
assumption.

## Phases

### Phase 0 — Tile-shaped foundations *(still the same two towns)*

1. `bake.mjs` → `bakeTile(regionConfig)` that emits a *tile set* (one z14 tile
   per 2.4 km cell covering the slice + coarse parent tiles), with an index
   manifest. Same packed content.
2. `WalkWorld` gains scoped registration (`addScope/removeScope`). Tag every
   wall/deck/polygon with its tile id.
3. Seed audit: every `hash01(seed …)` traces to a feature id, never an index.
4. `regions.json` → a tile-manifest + region index; `?region=` keeps working.

**Exit:** both towns rebuilt as tile sets; montages look identical; tests pass.

### Phase 1 — Streaming ring client *(the walk-off-the-edge moment)*

1. Tile loader: ring of z14 tiles around the walker, coarse ring beyond;
   IndexedDB cache; worker decode (reuse `protocol.ts` transferable pattern).
2. Floating origin + re-anchor pass.
3. Per-tile scopes into `WalkWorld`, interiors, props/signs/ground-paint, life
   district graph with seam stitching.
4. Terrain ring: per-tile grids + skirted edges (or a clipmap); water mask from
   land polygons.
5. HUD: `?at=lat,lon` deep links; journal map becomes zoomable atlas.

**Exit:** walk from Sea Bright across the bridge into Rumson and Highlands
without a seam or a hitch; soak across a tile boundary; montage proof.

### Phase 2 — A dozen real places *(prove the format, grow the atlas)*

Curate ~10–15 places spanning biomes and density: a Mediterranean hill town,
a Scandinavian coast, a desert crossroads, a dense city core, a mountain
village, a tropical beach, farmland, a big river city. For each:

- config entry (bbox, tz, respawn hint) — **no code**
- pre-baked tiles on static hosting
- regional style preset applied automatically (Köppen + country)

**Exit:** every place passes capture+soak; no per-place code deltas.

### Phase 3 — On-demand planet *(walk anywhere)*

1. Endpoint spike: confirm Protomaps PMTiles + Overture access paths.
2. Tile baker as a **Web Worker** (or tiny Cloudflare Worker) producing the
   same tile binary from PMTiles + Terrarium + WorldCover + land-polys.
3. Cache tiles forever in IndexedDB; immutable per data release.
4. Queue management: bake ahead of travel direction; coarser tiles instantly,
   detailed tiles stream in.

**Exit:** pick a random lat/lon on land → a believable painted place appears.

### Phase 4 — Regional soul

Climate-table presets (roof pitch, palettes, wall materials, tree species,
vehicle mix, dress), landmark registry (OSM/Wikidata id → authored slot),
water-body semantics (rivers vs sea vs lake from tags), day-length/timezone by
longitude. This is where "it feels like *that* place" lands.

### Phase 5 — Shared atlas + travel

- Explored-cell bitset per player → shared humanity-map (Cloudflare Worker +
  D1/KV; cells, not GPS traces — privacy by design).
- Glide/air travel between places (already have fly mode; make it a postcard
  journey).
- `?at=` links as shareable postcards.

### Phase 6 — Harden & ship

Perf/battery pass, mobile touch, offline-visited tiles, ODbL compliance page
(publish derived tiles under ODbL + attribution), data-release versioning.

## Risks & how we de-risk

| Risk | Mitigation |
| --- | --- |
| Overpass/PMTiles rate limits or endpoint changes | Phase-3 spike first; pre-bake + IndexedDB cache absorbs failures; degrade to coarser tiles |
| Broken global data (coastlines, huge relations) | land polygons instead of self-derived coast; tile bake is per-cell so one bad cell can't kill a region |
| Tile seams (geometry, terrain, paint, sim) | overlap a margin in every tile bake; skirt terrain edges; sim stitches by node key; soak test walks seams specifically |
| Float precision | floating origin from Phase 1; never accumulate absolute coords |
| US-only imagery | roof colour gracefully degrades to Sentinel-2/palette; style presets cover facades |
| Memory with 1,200-entity sim × tiles | sim scopes to the loaded ring; entities despawn outside; caps already proven cheap (0.3 ms/tick) |
| ODbL compliance | attribution on screen; serve derived tiles under ODbL; never Google data |

## Cost model

- **Hosting:** static files on Cloudflare Pages/R2 — free tier covers hobby
  scale. Tiles are immutable → perfect CDN citizens.
- **Compute:** pre-bake runs on your machine; on-demand bake in a browser
  worker or a $0 Cloudflare Worker.
- **Data:** OSM (ODbL), Overture (CDLA-Permissive), Terrarium (AWS open data),
  WorldCover (CC-BY), NAIP (public domain), land-polys (ODbL). All free.

## What we are *not* doing

- Photoreal 3D, Google 3D Tiles, streetview textures — different product, and
  it breaks the license and the art.
- A server-authoritative MMO world — ambient life stays client-side simulation.
- Curated-only content — the point is anywhere; curation is just the landmark
  overlay.

## Verification at scale (same discipline as now)

- `npm run typecheck && npx vitest run && npm run build` every phase.
- `tools/capture.mjs --at=lat,lon --shots=…` montage per new place; soak walks
  across seams and teleports between biomes.
- Determinism test: same tile baked twice → byte-identical; two loads produce
  identical worlds.
- Seam test: a straight walk across 4 tile boundaries never changes speed,
  never clips, never drops a car mid-road.

## Open decisions (need you)

1. **Phase 3 path:** browser-worker bake (zero backend, heavier client) vs tiny
   Cloudflare Worker bake (tiny backend, lighter client). Both keep the same
   tile format — pick after the endpoint spike.
2. **Atlas backend:** shared humanity-map is Phase 5; confirm you want a
   small server piece at all.
3. **First 15 places:** nominations? (Suggest: Saint-Tropez or Cinque Terre,
   Bergen, Santa Fe, Kyoto outskirts, Queenstown NZ, Reykjavík, Bruges,
   a Swiss alp village, Cape Town coast, New York grid, Tokyo suburb,
   Amazon riverfront, Gobi crossroads, Scottish highlands, plus the two we have.)

## Suggested first move

Phase 0, next session: `bakeTile` + scoped `WalkWorld` + seed audit. It's
invisible to players and unblocks everything else.
