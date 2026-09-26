# Open World — moving-forward plan (v2)

Date: 2026-09-23. Supersedes the phase list in `EARTH_MASTERPLAN.md` for everything past
Phase G. `docs/earth/PLAN.md` and `docs/earth/REVIEWER.md` remain the working files for the
synth-fallback pass (done, pending Round-2 review).

## Vision

Walk out the front door of a real building, anywhere on Earth, and keep walking while the
world paints itself around you. The reference architecture is Microsoft Flight Simulator:
**real streamed geography everywhere, procedural autogen in the gaps** — except ours must
also hold up at street level, at walking speed, on foot.

Principles (unchanged, now binding):

- Real data is the product; procedural is the floor, never the ceiling.
- Every content path — prebaked, streamed-lite, hybrid, synthetic — emits the same
  `TileJson` and flows through `buildTile → pack → mount`. One pipeline, four feeders.
- Deterministic: seeded by cell position or by a hash of the real data. Same world for
  every visitor, every session.
- No per-town special cases. Regional identity comes from data lookups (climate zone,
  land cover, driving side, language of signage), never hardcoded place names.
- Graceful everywhere: offline, rate-limited, ocean, Antarctic ice sheet. Synth covers.

## The four layers

```
DATA ──► CONTENT ──► LIFE ──► PRESENTATION
(real feeds)   (TileJson)   (agents)   (look/feel)
```

### 1. DATA — streamed per cell, cached at three levels (memory → IndexedDB → R2)

| Feed | Source | License | Notes |
|------|--------|---------|-------|
| Streets/buildings/landuse/water/POIs | OSM via Overpass, proxied by a **Cloudflare Worker** + R2 cache | ODbL — requires a visible credit line | `GET /tile/:cx_:cz.json?olat=<deg>&olon=<deg>` → cache hit OR Overpass bbox query → tile-lite JSON. Cold cells 2–8 s (origin params anchor the session's local frame; snapped to 1/64° so players share cache keys). |
| Terrain | **Terrarium DEM** PNG tiles (AWS open registry) | public domain-ish, attribute politely | decode PNG in tile worker → `registerPatch`; ~global, mountains everywhere |
| Climate/biome | Köppen-Geiger coarse raster (~1°) + **ESA WorldCover** (already in the bake pipeline, it's global) | CC-BY | one tiny LUT download per session → `regionStyle(lat,lon)` |
| Places (names, POI kinds) | Overture places or OSM `name`/`shop`/`amenity` tags | CDLA-P | drives signs, storefront text, arrival moments |

Cloudflare worker exists for **politeness and shared cache** — Overpass rate-limits by IP;
a shared R2 cache means each street is fetched once per *population*, not per player.

### 2. CONTENT — four feeders → one pipeline

1. **Baked** (exists): Sea Bright / Monmouth Beach, full richness.
2. **Real-lite** (new, the centerpiece): worker assembles `TileJson` from Overpass JSON —
   highways → roads, buildings → footprints (+height/roof tags when tagged), landuse/water
   → areas. Fewer handcrafted extras than the bake, same schema.
3. **Hybrid** (new): real roads + landuse present but building footprints missing (most of
   rural Earth) → synth lots fill lots along the real roads. FS2020 autogen, our way.
4. **Synth** (exists): pure procedural. Used for ocean/no-data/offline cells and as an
   **instant placeholder** while a cold real-lite cell downloads — mount synth immediately,
   swap to real when it arrives (the existing lite→detail upgrade path already does this).

### 3. LIFE — world-appropriate agents

- **Vehicles**: road graph already flows via `primRoads`. Add driving-side + vehicle mix
  per country LUT (right/left, taxis, buses, trucks; boats on water areas).
- **Pedestrians**: existing system; density follows place kind (city/town/rural via
  landcover + road density).
- **Animals**: biome LUT → species table → lifeSim roles. Deer/bears/foxes in temperate
  forests, monkeys/macaws in tropics, penguins on ice, gulls near coasts everywhere.
- **All** agents must respect real water/parks — they already consult `walk`/water grids.

### 4. PRESENTATION — the watercolor holds everywhere

- **Ground paint for non-baked tiles** (real-lite + synth): driveways, parking aprons,
  junction pads, lawn edges. The baked world's detail lives in this layer — biggest
  believability gap today.
- **Building–terrain fit**: foundation grading / pads under every footprint (real-lite
  tiles need this as much as synth — slopes exist worldwide).
- **Seasons**: date + latitude + Köppen zone → snow cover (white wash on ground/roofs),
  leafless deciduous canopies, sun-arc/length-of-day already correct via ephemeris.
- **Weather**: existing system + snow precipitation type + tropical storm frequency bias.
- **Night**: per-tile lamp boxes (currently slice-scoped — synth/real-lite streets are
  dark; windows already light).
- **Tree types per place**: biome → species palette (palm/eucalyptus/pine/oak/bare
  deciduous variants), canopy color shifts; follows from existing tree builder.

## Phases — revised order (2026-09-26)

Status: H1 ✅ H2 ✅ H3-lite ✅ · **One World** ✅ (single `shore` bake, full detail across the
backdrop) · **I** ✅ first cut (`styles.ts` + `recipe.ts`; raster upgrade pending) · **J2-a**
✅ (house realism: materials, dormers, bays, chimneys, plinths, windows). Next, in order:

1. **L-lite — measured massing.** `bd.h` / `bd.fl` from Overture `height`/`num_floors` (already
   in the bake join) + 3D-GloBFP where missing; real-lite mirrors via Overture fields. Storeys
   and roof silhouette drive recognition at 50–300 m (`docs/FIDELITY_REALITY.md`).
2. **J1 — detail parity for the walkable ring** (in parallel): ground paint (walks, drives,
   lawns, curb strips) and per-tile lamp pools outside the slice + for streamed tiles;
   street-tree species/scale; signage from real names.
3. **J2 rest** — vertex AO, banded roofs, rounded props, bay glazing, garages.
4. **Traversal spike** — ride any vehicle / fast movement abilities at ~25 m/s: stress-tests
   LOAD_R, worker throughput, DEM latency before life is layered on top. Core-gameplay seed.
5. **K — life + ambience** per region style (vehicle mix + driving side already in `styles.ts`).
6. **L full** — US LiDAR roof planes (`bd.rp`), national LoD2 adapters.

The original list below is kept for rationale.

## Phases, in order (original)

- **H1 — World tile service + real-lite pipeline.** Cloudflare worker (Overpass proxy + R2
  + attribution footer in UI); client `w-<cx>_<cz>` specs; Overpass JSON → `TileJson`
  assembly (port the bake's osm→tile steps into a shared module); **synth placeholder
  mounts instantly, real tile upgrades in place.** This is the milestone that makes the
  premise true anywhere.
- **H2 — Global terrain.** Terrarium decode → per-cell `registerPatch`. Real relief
  worldwide; also fixes the synth plateau inside synth territory (real data *is* the fix).
  Terrarium is the floor — upgrade to national DTMs where open (3DEP 1 m, IGN, AHN, NZ…;
  ladder in `ASSET_FIDELITY.md` §1).
- **H3 — Hybrid fill.** landuse without footprints → synth lots on real roads.
- **I — Regional style engine.** `regionStyle(lat,lon)` LUT: biome palettes, tree species,
  vehicle mix, driving side, roof/wall palettes, snow rules, animal species. Applies to
  every feeder including baked. Includes the recipe/seed layer (`recipe.ts`/`styles.ts` —
  every per-building decision a pure function of `bd.s`); same LUT, build once
  (`ASSET_FIDELITY.md` §4). **Virtual manifests must emit `meta.style` too** — `virtual.ts`
  builds `meta` inline today; derive style from `?at=` coords via the same LUT or `?at=`
  tiles stay style-less.
- **J — Detail parity.** Ground-paint layer, building pads/grading, intersection pads,
  per-tile lamp boxes, signage from real `name` tags.
- **J2 — Asset craft.** Feeder-agnostic builder/shader upgrades that raise believability on
  every layer: vertex-AO bake in the worker (`three-mesh-bvh` → `aAO` into `paintLight`),
  banded roofs (mansard/gambrel), dormers, SDF window decals, rounded prop edges.
  Designs in `docs/ASSET_FIDELITY.md` §2–3.
- **K — Life + ambience.** Vehicles/animals/peds per region style; biome sound palettes.
- **L — Measured tier.** Bake-enrich stage: `bd.h` heights for ~80–90% of world buildings
  (Overture/3D-GloBFP join, CC-BY-clean); US LiDAR (`usgs-lidar` EPT polygon crops) →
  fitted roof planes `bd.rp` + 1 m DEM + real tree positions; national LoD2/lidar adapters
  where open; open-ortho roof classifier (licensed sources only). `bd.h`/`bd.rp`/`bd.eav`/
  `bd.rs` are optional TileJson fields every feeder may emit — real-lite gains heights via
  Overture fields or DSM COG range-reads in the worker. Needs J2's roof vocabulary to
  express `bd.rp`. Ladder + licenses: `docs/ASSET_FIDELITY.md` §1.

(Paused synth polish — synth-terrain relief field, deeper streetscape — now folded into
I/J where it pays off for *all* feeders, not just the fallback.)

## Decisions needed (pick before H1 starts)

1. **Overpass proxy**: ✅ Cloudflare worker (free tier) + R2, shipped as `worker/`.
   ODbL credit line "© OpenStreetMap contributors" lives bottom-right in the HUD.
2. **H1 scope**: ✅ minimal real-lite = roads + buildings + water areas only (incl.
   coastline→water polygons — seaside towns need a real shore).
3. **Cadence**: ✅ split — H1a service (`worker/`), H1b client `w-*` specs + placeholder
   swap, H1c hybrid fill → next.

## Risks, honestly

- **Overpass throughput**: public instances are rate-limited; the worker cache absorbs
  popular cells but cold-path latency (2–8 s) is real. Synth placeholder hides it.
- **OSM building coverage is patchy** outside cities — hence hybrid fill is Phase H3, not
  optional garnish.
- **DEM decode cost**: Terrarium PNGs are cheap; per-cell patch cost is modest.
- **Data licenses**: OSM attribution line must ship in the UI before H1 goes live — bake it
  into the intro/HUD, small.
- **Cost**: R2 + worker free tiers cover hobby traffic; a popular-day spike could exceed
  Overpass fair-use — the cache is the mitigation, plus gentle client-side debounce.

## Success measures per phase

- H1: `?at=` anywhere on land mounts real streets; capture harness shows a real town
  (verify against known geography, e.g. central London grid) with synth swap-in <10 s.
  — **verified 2026-09-24**: `?at=51.5033,-0.1195&tiles=<dev-worker>` mounts real
  Blackfriars/Southwark geometry (8.3k footprints, 8.5k roads, clean s→w swaps);
  swap timing tracks Overpass (observed 25–90 s under load — placeholder covers it).
- H2: mountaintop `?at=` shows slope relief; walker descends on real gradient.
- I: same code path produces visibly different towns in NJ vs Norway vs Namibia captures.
- K: species palette differs per capture; reviewer round confirms "place-ness" ≥8/10.
