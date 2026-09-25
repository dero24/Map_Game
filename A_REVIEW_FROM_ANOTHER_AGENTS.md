Nice — let me look at what got built before answering. Checking the project structure and what's data-driven vs hardcoded.

The AGENTS.md gives me a map — real fetch scripts exist (`fetch-osm`, `fetch-terrain`, `fetch-worldcover`, `fetch-overture`), a bake step, and even an `EARTH_SCALE_THOUGHTS.md`. Let me see the real source tree and key files.

Glob hit node_modules. Let me list just the project dirs.

The previous agent already wrote an `EARTH_SCALE_THOUGHTS.md` tackling exactly this — good sign. Let me verify what's actually hardcoded in the code vs data-driven.

The pipeline is real data — now checking what's hardcoded in the runtime and how big the baked output is.

Let me check the baked data size and what `interiors.ts` and `structures.ts` contain (the landmark overlay question).

Now I can answer both questions concretely — and the agent actually pre-answered the second one in `EARTH_SCALE_THOUGHTS.md`, which is a solid doc.

## How much is hardcoded?

Less than you'd think. The town itself is **real data, not hardcoded**: `scripts/fetch-osm.mjs`, `fetch-overture.mjs`, `fetch-terrain.mjs`, `fetch-worldcover.mjs` pull live OSM/Overture/Terrarium/WorldCover data, and `bake.mjs` turns it into `public/data/world.json` + `terrain.bin` — coastlines flood-filled from real coastline ways, buildings from Overture footprints with heights, terrain from elevation tiles. Even the interiors are generated per-building on demand from footprints (`src/world/interiors.ts`), and bridges/seawall/groynes come from OSM line tags (`src/world/structures.ts`).

The genuinely Sea-Bright-hardcoded part is a thin skin:

- `scripts/config.mjs` — the slice bbox, backdrop bbox, and tangent-plane origin. **This is the one file that chooses the town.**
- `src/main.ts` — spawn logic anchored by road name (`Rumson Road` bridge landing, `Ocean Avenue` points) and the "Sea Bright"/"the beach" place labels.
- `src/ui/journal.ts` + `src/ui/panel.ts` — IndexedDB name `seabright-walk`, panel title/respawn label.

Everything else — renderer, watercolor pass, day/night, weather, interiors, ambient sim, collision — is place-agnostic code. Call it ~95% data-driven, with the town-ness being one config file plus ~a dozen name-anchored strings.

## Can the planet stream instead of downloading?

Yes, and the groundwork is already there — the current `slice (2m grid) + backdrop (10m grid)` split is literally a 2-level LOD ring. The agent's own `EARTH_SCALE_THOUGHTS.md` lays out the path and it's sound:

1. **Tile the bake.** Refactor `bake.mjs` into `bakeTile(z, x, y)` — web-mercator quadtree tiles (~2.4 km at z14), each emitting the same packed format as `world.json`+`terrain.bin`. ~50–300 KB per populated tile; ocean/desert tiles nearly free.
2. **Two production modes, both free:**
   - *Pre-baked tiles* for hotspots, hosted as static files on Cloudflare Pages/R2 (free tier) — works today, zero backend.
   - *On-demand* — and here's the nice part: Protomaps publishes the whole planet as PMTiles, and Overture has PMTiles too. PMTiles reads via HTTP range requests from static hosting, so **the bake itself can move into a Web Worker in the browser** — fetch vector tiles for wherever the player walks, decode+mesh on demand, cache forever. No server-side bake backend required, nothing to download upfront, still $0.
   - Terrain doesn't even need pre-baking: Terrarium PNG tiles are already a streaming format, fetchable per-tile with no key.
3. **Client changes:** tile streaming ring (detailed near, coarse far — generalizes the current two-layer split), worker-side decode/mesh building (the `protocol.ts` transferable-buffer pattern the ambient sim already uses), and a floating origin that re-centers as you walk — currently there's one fixed origin, and float32 drifts a few km out.
4. **Thin-data regions:** the bake already does height/roof/color heuristics; global mode just needs regional style presets (terracotta Mediterranean roofs, steep Scandinavian roofs, etc.) driven by climate zone.
5. **Landmark registry** keyed by OSM/Wikidata IDs — the bascule bridge handling now is the prototype of that.

Two honest caveats: (a) serving OSM-*derived* tiles edges toward "Derivative Database" under ODbL — keep the © OpenStreetMap attribution visible and be prepared to share the tile packs under ODbL; (b) the all-free on-demand path leans on free tiers — fine at hobby scale, and the fix at viral scale is just pre-baking popular tiles + rate limits, not money.
