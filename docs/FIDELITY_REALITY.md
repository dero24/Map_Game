# Fidelity reality check — how close can we get to "my actual house"?

Research synthesis (3 parallel agents, 2026-09-25). Companion to `ASSET_FIDELITY.md`.
Answers: "MSFS shows even my home house correctly — can we? Should we pivot?"

## TL;DR — don't pivot, don't chase photogrammetry

MSFS achieves per-house correctness via **aerial photogrammetry** (Vexcel oblique
cameras → dense textured meshes) that is legally and economically unreachable:
Bing owns the data, Google PR-3D-Tiles/Bing/Esri ToS all ban facade extraction, and
there's no license to buy at hobby scale. **It also only covers a few hundred metro
areas — most of MSFS is autogen too.** Our product is the opposite win:
"a watercolor painting of my actual street" — something photogrammetry can't do.

Recognition science says a painted world only needs: **right footprint + right
massing/height + right roof shape/orientation + right roof color + right street.**
The wall being "interpreted" reads as artistic license, not error.

## Achievable coverage per attribute (license-clean, global)

| Attribute | Coverage | How |
|---|---|---|
| Footprint + plot position | ~global (OSM-dense areas + hybrid fill) | already shipped |
| Height (`bd.h`) | ~80–90% | Overture/3D-GloBFP spatial join (~2 d, item 7 in ASSET_FIDELITY §7) |
| Roof shape + orientation | US ≈ universal (LiDAR `bd.rp`); DE/NL/PL national LoD2; Japan PLATEAU | enrich stage (~3 d + adapters) |
| Roof color | ~30–50% | open orthos: US NAIP (already in bake — `fetch-imagery.mjs`), FR/DE/ES/NL/DK/PL/EE/FI/AT/JP state orthos |
| **Facade color** | **~1–3% global** | OSM `building:colour` tags + Mapillary (CC BY-SA, sparse) — effectively unreachable |
| **Facade texture** | **~1–2%, mostly Japan** | PLATEAU LOD2 photo textures |

## The one big discovery: Japan PLATEAU

MLIT's PLATEAU ships CityGML LOD2 for ~250+ cities (target ~500 by FY2027) including
**real photographic building textures**, under CC BY 4.0 — the ONLY national open
dataset combining real roof geometry + real facade/roof photos. A Japan region bake
could literally show real facades legally. Other LoD2 sets (Germany ~58M buildings,
Netherlands 3DBAG ~10M) have geometry, **no textures anywhere**.

## AI generation (Sept 2026 SOTA)

TRELLIS.2 (MIT, ~8 s/building, ~$40–80 per town on spot H100) and friends make
*plausible regional* houses — never *your actual* house; they hallucinate facades.
Useful wedge ideas if AI gen is ever wanted:

- **User-photo upload** — "upload 3 photos of your house" → multi-image conditioning
  → their actual home in watercolor. Legally clean (user consent), unique, delightful.
  The only path to per-house photographic fidelity that exists.
- **Geo-anchored stylized kits** — OSM footprint + massing → AI-detailed facade; the
  Sat2RealCity direction. Plausibility tier, not identity.
- Cost/licensing notes: TRELLIS.2 MIT-clean; Hunyuan3D has a community license with
  MAU/EU carve-outs (read before use); Meshy/Tripo APIs ~$0.2–0.4/model (fine to
  prototype, wrong dependency to ship).

## Strategic verdict

1. **Keep the watercolor path** — it's the moat. Photorealism fights MSFS at its
   strongest point with our weakest hand.
2. **Invest in measured geometry** — wrong storey count/roof silhouette is what
   screams "generic autogen"; wrong wall color is invisible under paint.
3. **Skip facade-photo pipelines** — license-hostile and medium-inappropriate. The
   only license-clean partial is a bake-time facade-tone bucket (light/dark/brick)
   from open orthos → `bd.fc` prior. Optional footnote, not a phase.
4. **Baked towns are the flagship** — they can reach "structurally 1:1, painted"
   (footprint + height + measured roof + real roof color). `?at=` US cells reach
   "my street" (real massing, guessed roof/color). Rest of world: neighborhood pattern.
5. **AI asset builder as a separate venture is legitimate** — seeded, geo-anchored,
   NPR-styled architecture kits are unserved (Meshy/Tripo/Luma don't do seeded
   batch or real-world anchoring). But it's a different business, not a substitute
   for the game's data pipeline.
6. **Deferred until proven needed**: ortho roof classifier for `?at=`, manifold-3d
   openings, facade canvas atlases. `bd.h` join + US lidar roofs + vertex AO come first.

## Sources (selected)

MSFS/Vexcel photogrammetry pipeline + Bing ToS; Google Map Tiles API policies §3.2.3;
Esri World Imagery ToU; MLIT PLATEAU LOD2/CC BY 4.0; 3DBAG (CC BY); LoD2-DE per-state
catalogues; IGN BD TOPO Licence Ouverte 2.0; Overture building schema + height
whitepaper; taginfo coverage counts; Mapillary CC BY-SA; TRELLIS.2 (CVPR 2026, MIT);
Sat3DGen (ICLR 2026); Sat2RealCity (arXiv 2511.11470); "From Orbit to Ground"
(arXiv 2512.07527); Montesdeoca/Bousseau watercolor NPR.
