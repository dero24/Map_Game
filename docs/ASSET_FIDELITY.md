# Asset fidelity plan — real buildings, painted look

Research synthesis (7-agent survey, 2026-09-25). Supersedes `3d_asset_creator.md`.

**Verdict: keep the three.js + custom-shader runtime. "1:1 real" is a data problem, not an engine
problem.** No glTF, no engine switch, no WebGPU migration. The architecture is a **coverage
ladder**: measured geometry where free data exists, graceful fallbacks everywhere else — the world
never looks broken, some places just look more real.

---

## 1. Data layer — the coverage ladder

### Tier 0 — LiDAR point clouds → measured roof planes + true heights

**US: effectively universal.** USGS 3DEP ≈99% of the nation covered or in-flight at QL2+ (≥2 pts/m²)
as of end-FY2025, ~100% of populated land; 100% baseline targeted end-2026. Alaska = IfSAR (5 m DEM,
no point clouds). Caveat: ~61% of CONUS data is ≥5 yrs old — ortho-verify for teardowns.

| Access | Notes |
|---|---|
| `s3://usgs-lidar-public` | Free EPT octree of LAZ; PDAL `readers.ept` + `polygon=` crops a footprint over HTTP — no full-tile downloads. Enumeration: `usgs.entwine.io/boundaries/resources.geojson` + STAC `usgs-lidar-stac.s3-us-west-2.amazonaws.com/ept/catalog.json` |
| `s3://usgs-lidar` | Requester Pays raw LAZ (~$0.09/GB); more complete — use for stragglers |
| NOAA Digital Coast PDS / NJGIN `njogis-elevation` | Free mirrors; 2014 Post-Sandy covers Sea Bright/Monmouth Beach (m4921) |
| OpenTopography | Academic-gated for USGS/NOAA now — skip |

**World: per-country patchwork, no global catalog.** National adapters behind a
`lat,lon → tile-index` interface:

- **Best-in-class open**: NL AHN (CC0, ~10 pts/m²), France LiDAR HD (≥10 pts/m², ~85%+ coverage
  end-2025), Spain PNOA cycle3 (5 pts/m² nationwide), Poland ISOK (4–20 pts/m² + **free national
  LoD2 building models** — skip lidar entirely there), Switzerland swissSURFACE3D (COPC), Denmark,
  Norway, Estonia (all open national).
- **Partial/regional**: Germany (NRW open statewide; other Länder vary — but most publish open
  **LoD2** models under dl-de/by-2-0 instead), England EA (~1–4 pts/m²), Finland free tier thin
  (0.5 pts/m²), Sweden 0.5–2.
- **Elsewhere**: NZ LINZ >80% national (CC BY); AU urban/coastal via ELVIS; CA patchwork via
  CanElevation; **Japan: no bulk points — use PLATEAU open CityGML/3D-tiles for ~300 cities**.
- **Bare**: Africa, South America, Middle East, S/C/SE Asia — nothing usable.

Discovery aids: `europeanpointclouds.tudelft.nl` (new European index), JRC lidar inventory
(JRC126223), EarthBridge ALS overview.

**Bake recipe (simplified roofer/geoflow):** clip points per footprint +1 m buffer → iterative
RANSAC plane fit (roofer defaults: epsilon 0.3, min 15 pts, kNN 15) → `roofs3d.json`
`{height, groundZ, planes:[{z,azimuth,slope,points}]}` → folded into `world.json` as `bd.rp`/`bd.eav`.
Confidence-gated; absent → procedural. Decode LAZ in Node via `laz-perf` (WASM); `copc` npm lib for
COPC sources. Don't trust LAS class 6 (often absent) — test "points ≥2 m above local ground inside
footprint". NAVD88 datum — sanity-check vs `terrain.bin`.
**Free riders**: ground classes → 1 m DEM (replaces ~10–15 m Terrarium; also the `?tiles=` DEM
upgrade); vegetation returns → `trees.json {x,z,h,crownR}` real tree placement.

### Tier 1 — estimated heights everywhere (no lidar needed)

| Source | Coverage | Accuracy | License |
|---|---|---|---|
| Overture `height`/`num_floors`/`roof_shape` | best US (3DEP-derived, ≥10M+ bldgs), <10% global | good where real | **ODbL** (bldgs theme) — OK for shipped produced-works; keep `sources` attribution |
| **3D-GloBFP** (Zenodo 15459025/15487006) | ~1.7B footprints, global | RMSE 1.9–14.6 m | **CC BY 4.0 — shippable; the global backbone** |
| Google Open Buildings 2.5D temporal (EE) | Africa/LatAm/S+SE Asia/Caribbean, 4 m raster | MAE ~1.5 m | CC BY 4.0/ODbL — the Global-South tier |
| National authoritative | FR BD TOPO heights (Licence Ouverte), DE per-state LoD2, NL 3DBAG… | best | per-state/country open licenses |
| GHS-OBAT / GHS-BUILT-H | global, 100 m cells | cell-average only | open — neighborhood priors, not per-building |

**GlobalBuildingAtlas (TUM): CC BY-NC — research/prototype only, cannot ship** (Planet imagery
forces NC; no commercial path as of Sept 2026).

Result: **~80–90% of world buildings get a data-derived height** after a bake-time spatial join;
the rest use regional priors (num_floors × ~3 m).

### Tier 2 — roof form without lidar

No license-clean global LoD2 product exists. Sources, best→worst:
- National LoD2: Germany per-state (open), Poland ISOK (free), NL 3DBAG, Japan PLATEAU.
- OSM `roof:shape` via Overture (~1–2% of buildings, Europe-best).
- **Bake-time roof classifier** (flat/gable/hip/mansard + ridge azimuth) on open orthoimagery —
  legally clean sources only: US NAIP/state orthos (public domain), NJ 2020 1-ft orthos
  (`maps.nj.gov`/`njogis-imagery` — 3× NAIP), FR IGN, ES PNOA, NL PDOK, most DE Länder, DK, PL, EE,
  FI, AT, JP GSI. Per-country allowlist; small ONNX/CNN model trained at bake.
- Elsewhere: procedural priors by region/footprint aspect.

**Banned for extraction**: Esri World Imagery (NC-only derivatives, batch banned), Bing (ToU),
Mapillary projection onto textures (SA murky + breaks look anyway; bake-time tag enrichment only).

### Tier 3 — procedural floor

Recipe priors: `num_floors`×3 m, style-table roof mix by region, footprint aspect → gable vs hip.
Deterministic from `bd.s` — see §4.

### Terrain (separate ladder)

National DTMs where open (3DEP 1 m, IGN RGE ALTI 5 m, German DGM1, AHN, NZ 1 m) →
**Copernicus GLO-30** (free incl. commercial, attribution) → never FABDEM (CC BY-NC-SA) for
shipped builds.

### Pipeline shape

`fetch` gains per-region adapters emitting to `raw/<region>/{lidar,heights,orthos}/`; `bake` gains
an **enrich stage**: join footprints → resolve tier (`lidar_tier`: `ept|raw_laz|national|lod2|
dsm|none`) → emit `bd.rp/bd.eav/bd.h/bd.rs` into `world.json`/tiles. Every derived field carries
`sources` license info into `manifest.json`. `?tiles=` live mode: Overture heights + PC
`3dep-lidar-dsm/dtm` COG range-reads (geotiff.js in worker) — 1 m heights/terrain for any US `?at=`
without point-cloud decode.

---

## 2. Builder upgrades (`src/world/`)

Contract: bake emits optional `bd.rp` (fitted planes), `bd.eav` (measured eave), `bd.h`
(height any tier), `bd.rs` (`roof:shape` passthrough), `bd.bc` (colour). `realTile.ts` must
mirror — add field/seed parity to the AGENTS.md tag-table contract.

- **Measured roofs** — new `buildMeasuredRoof(ring, planes): RoofGeom | null` in `roof.ts`:
  project offset ring onto each plane, half-plane-clip faces against all other planes + footprint,
  ear-clip on XZ, near-vertical planes → `gables`. Returns same `RoofGeom` → emitRoof/soffits/
  fascia/pitched all reuse. Fallback: `bd.rp ? buildMeasuredRoof : buildRoof`. ~2–3 d. *Don't*
  extend the wavefront — it assumes unit-speed edges throughout.
- **Mansard/gambrel** — banded height profile: `RoofBand {run, pitch}[]` replaces scalar pitch;
  split faces along iso-line `t = d_b`; optional fascia "belt" at the break; same skeleton run.
  ~1.5 d.
- **Dormers** — Kelly–Wonka-style simplified: parent faces are single planes, so a dormer = mini
  `buildRoof` on a rectangle + `walls()` body, front flush to wall line, depth capped below peak;
  placement from fascia edges ≥4 m, spacing ~3.5 m, `p` from recipe. Front wall gets shader windows
  free via `aWall`. ~2 d. New `dormers.ts`.
- **Real openings** — hybrid. SDF decals cover rectangular windows/doors; `manifold-3d` WASM in
  worker earns its cost for arched openings / gable cutouts / courtyard buildings: prism walls
  `difference` N opening solids in one batch, restamp `aWall`. Gate to detail-tier + `arch` recipe.
  ~4–5 d, ~1 MB wasm, fallback = decals.
- **Extended roof vocabulary** — port OSM2World's `roof:shape` dispatch (saltbox, half-hipped,
  skillion, dome) where tags exist; Streets.GL is the reference codebase to read.

## 3. Paint layer (`src/render/`)

- **Vertex AO + curvature** (biggest look-per-effort): bake `aAO` in worker at end of `buildTile` —
  `MeshBVH` on merged chunk geometry, ~7 rays/vertex, lod-0 tiles only. Wire into
  `paintLight(alb,N,pos,sh,ao)` — currently hardcoded `1.0`. Attributes cross `pack.ts` free;
  always write default 1.0 so non-BVH paths don't break. `three-mesh-bvh` MIT. ~1.5 d.
- **Rounded-edge vertex trick**: soft silhouettes on box props without bevel geometry. Needs new
  `PObj.ia` instanced-attribute channel in `pack.ts` (~10 lines) + `ROUNDED` define in
  `propMaterial`. ~1 d.
- **SDF decals in `GLSL_WINDOWS`**: arched heads, sill shadows, lintels, louver slats, quoins —
  swap `aab` masks for `archMask` keyed off `W.h1/h2`/seed hashes, keep `far`/`lod` fade
  discipline. Iterate via `tools/capture.mjs`. ~1 d.
- Also cheap: dual-scale pigment mottling (Bousseau turbulence model); rotated-poisson shadow tap.
- Per-building facade-atlas canvas → `ImageBitmap` (same path as sign atlas) — only if shader
  windows plateau; Streets.GL is the proof it works.

## 4. Variety layer — recipe + seed

New `src/world/recipe.ts` + `styles.ts` + `kit.ts`.

- **Discipline**: every per-building decision = pure `f(bd.s)` (`bd.s` already stable =
  `hashStr(feature id)`; `realTile.ts` must produce identical seeds). Per-site scatter uses
  position-hash variant choice, not rng sequence — fix `props.ts` `rng.float()` kind picks →
  `hash2(x,z)` so border-adjacent context agrees across tiles.
- `recipeFor(bd, styleTable)` → `{roof, bands, facade/trim/roofCol, dormers, shutters, arch, bays,
  porch, chimney, paletteKey}`. Style table keyed by new `world.json meta.style` — **never branch
  on place names** (AGENTS.md rule). OSM tags override recipe probabilities.
- **Both manifest paths must emit `meta.style`**: baked `world.json` AND the virtual manifest in
  `virtual.ts` (which builds `meta` inline today) — derive style from `?at=` coords via the same
  `regionStyle` LUT or open-world tiles stay style-less.
- Prop grammars: re-express tree literals as `SPECIES` records + jittered variants (≤8 quantized
  variants/tile → still one InstancedMesh each). WFC (`three-collapse`) only for later
  garden/interior layout.
- Recipe cannot reach shader-side `seedOf(id)` variety without a new attribute channel — keep
  shader variety seed-keyed, recipe controls geometry.
- ~3–4 d, mostly refactoring inline decisions into tables.

## 5. Wild cards (prototype later)

- **LiDAR points → watercolor splats** via Spark 2.x (three.js splat renderer, MIT): trees, dunes,
  clutter the mesh path can't do. Weekend prototype.
- **Offline hero props**: Blender headless emitting the packed tile format directly (NOT glTF —
  shaders unchanged); TRELLIS.2-class image-to-3D for unpredictable hero props — GPU rental per
  batch, never 1:1-real.
- **Kenney/Quaternius/Poly Pizza CC0 packs** transcoded at bake → packed arrays (hydrants, benches,
  racks). ~1 d.

## 6. Traps (verified — do not do)

- **Google Photorealistic 3D Tiles** — already banned in CONCEPT_SOURCES.md/EARTH_SCALE_THOUGHTS.md;
  ToS prohibits deriving objects by machine. Confirmed dead end.
- **GlobalBuildingAtlas, FABDEM, Esri World Imagery derivatives, Bing extraction, WSF-3D** —
  NC/restricted licenses; research-only, never shipped.
- **WebGPURenderer/TSL** — ShaderMaterial unsupported; entire `U`/`GLSL_SHARED`/post stack would
  need NodeMaterial rewrite; ~2× CPU cost reported. Revisit ~2027.
- **Engine switch** (Godot/Unity/Unreal/Babylon) — pure churn.
- **Runtime glTF assets** — materials don't survive; the packed tile format IS the asset format.
- **three-bvh-csg** for real openings — T-vertices/open meshes; manifold-3d is the correct kernel.
  csg.js lineage: skip.
- **OpenTopography** — USGS/NOAA federated data is now academic-gated; go to S3 directly.

## 7. Build order

| # | Item | Effort | Why |
|---|---|---|---|
| 1 | Recipe/seed groundwork (`recipe.ts`/`styles.ts`) | ~3 d | Refactor-only, unblocks everything parametric |
| 2 | Vertex AO in worker | ~1.5 d | Biggest look win per effort |
| 3 | Banded roofs (mansard/gambrel) | ~1.5 d | Small roof.ts diff, big silhouette variety |
| 4 | Dormers | ~2 d | Reuses buildRoof; recipe-driven |
| 5 | SDF decal upgrades | ~1 d | Pure shader, iterate on shots |
| 6 | Rounded props (`ia` channel) | ~1 d | Softens box-heavy world |
| 7 | Enrich stage: Overture heights + 3D-GloBFP join → `bd.h` | ~2 d | Global 1:1 heights floor — covers ~80–90% |
| 8 | `fetch-lidar.mjs` US path + `buildMeasuredRoof` (`bd.rp`) | ~3 d + bake | The top tier; EPT polygon crops make it cheap |
| 9 | LiDAR DEM + `trees.json`; NJ/US open orthos upgrade | bake stages | Free riders on same downloads |
| 10 | Roof classifier on open orthos (US/EU allowlist) | ~1 wk | Roof form where no lidar/LoD2 |
| 11 | manifold-3d openings | ~4–5 d | Heaviest; gate to detail-tier |
| 12 | Country adapters (PLATEAU, DE LoD2, NL AHN…) | per-country | Grow coverage ladder incrementally |

Risks: `matTag` throws on unknown materials (`userData.tag` or new `PMat` arm);
`aInfo`/`aWall` channels fully allocated (new per-vertex → new attributes, wire-free; instanced →
`ia`); worker WASM needs vendored async init; LiDAR vintage vs teardowns — ortho-verify;
per-country adapters each carry their own license+format quirks — keep the `lidar_tier` interface
thin.

Validation: `npm test`, `npm run typecheck`, `tools/soak.mjs` for stalls, `tools/capture.mjs`
montages for look regressions (read only the montage JPEG).

## Sources

USGS 3DEP status (FGDC NGAC FY25 reports, LidarExplorer), `usgs-lidar`/`usgs-lidar-public` AWS
registry + EPT STAC, NOAA Digital Coast m4921, NJOGIS buckets, entwine resources.geojson;
JRC126223 European lidar inventory, European Point Cloud portal (TU Delft), national portals (AHN,
IGN LiDAR HD, PNOA, ISOK, swissSURFACE3D, hoydedata.no, EA Defra, LINZ, ELVIS, CanElevation,
PLATEAU); Overture Sept-2026 schema/release (ODbL, building heights whitepaper); 3D-GloBFP
(ESSD 16:5357, CC BY), GlobalBuildingAtlas (ESSD 17:6647, CC BY-NC), Google OB 2.5D (CC BY/ODbL),
GHS-BUILT-H/GHS-OBAT (JRC), Copernicus GLO-30, FABDEM license; roofer/geoflow/3DBAG plane-fit
defaults; OSM2World dispatch, Streets.GL atlases, Mapbox building_gen, Kelly–Wonka SIGGRAPH 2011;
manifold-3d vs three-bvh-csg benchmarks; three.js WebGPURenderer r183 reports; Spark 2.x;
TRELLIS.2; Bousseau 2006 watercolor turbulence.



## How does it this fit into timeline with OPEN_WORLD.md?

Brief fit — it slots into the existing timeline cleanly, mostly *strengthening* phases rather than adding new ones:

**Direct overlaps (same work, don't duplicate):**
- **Phase I (regional style engine)** — my doc's item 1 (`recipe.ts`/`styles.ts`) IS Phase I's building/prop half. `regionStyle(lat,lon)` and `styleTable` are the same LUT: palettes, roof mix, species. Build once, as Phase I — the recipe layer is how style reaches geometry.
- **Phase J (detail parity)** — vertex AO, banded roofs, dormers, SDF decals, rounded props are all feeder-agnostic (they improve baked + real-lite + synth alike). They expand J, or form a "J2 — asset craft" block. AO is cheap enough to pull early.
- **H2 (global terrain)** — upgraded, not changed: Terrarium stays the global floor, but the doc adds the tiered DEM ladder (3DEP/national DTMs where open, PC COG range-reads in the worker for live US `?at=`).

**New work the timeline doesn't have:**
- **The enrich stage** (Overture/3D-GloBFP height join → `bd.h`; LiDAR → `bd.rp`) — a **new phase L, "measured tier," after J**. It's the only piece that isn't feeder-agnostic: it enriches baked regions fully, and gives real-lite real heights cheaply (Overture heights or DSM COG reads instead of OSM's sparse `height` tags — a real win for `?at=` believability).
- The roof classifier and country lidar adapters are later sub-items of L.

**What it doesn't change:** the philosophy — "real data is the product, procedural is the floor" is literally the ladder (`lidar_tier → dsm → tags → priors`), and the four-feeder rule holds since `bd.h`/`bd.rp` are just richer TileJson fields any feeder can emit.

Want me to add a Phase L + the J2 block into `OPEN_WORLD.md`, with a cross-ref to the new doc?