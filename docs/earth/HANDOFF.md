# Handoff: the lower 48, alive (2026-10-04)

Robby, handing this to a cloud session: "i want to make sure all these places look alive lower 48
look alive with correct vegetatation and animals and all that".

Read this first, then the latest `docs/earth/LOG.md` entry ("Regional life (2)"),
`docs/REGIONAL_LIFE.md` and the build list `docs/regional-life/models.md`.

## Where things stand

- Branch `feature/foundation-first` (pushes to `feature/*` publish the Pages build). `main` is for
  PRs.
- Tier 0 is passing (every tile loads; phones pass on Robby's word). In Tier 1, getting in, people
  who stay in and walkers on the steps all pass.
- **Built:** the Northwest package, build order #1 in `models.md`. It has:
  - six trees: Douglas fir, western hemlock, Sitka spruce, western redcedar, red alder, vine maple;
  - moss on bark by region, and moss and licorice fern on the bigleaf maple;
  - wet side and dry side split at the Cascades' crest;
  - the forest floor: sword fern, salal and Oregon grape.
- **Measured:** the green spots, Mapillary photos against the game. green-2 nationally had
  vegetation 24% against the photos' 35%, mean score 0.72. The Northwest (pnw-flora-1) scores 0.683.
- **The biggest gap:** forests that neither OpenStreetMap draws nor the LiDAR records hold come out
  as meadow: Longmire, the Hoh, the Adirondacks' NY-73, Bend's ponderosa. That's the canopy layer
  below.

## The work, in order (`feature_list.json` Tier 1 keeps the same order)

1. **The canopy layer** (`regional-greenery`, blocked on it).
   - What: the USFS NLCD Tree Canopy Cover (30 m, the lower 48, public domain), baked into R2 by 1°
     blocks and read by the tree scan (`props.ts`) as its density, where today it uses WorldCover
     and the DEM's cover.
   - Why it waited: Robby deferred it on the local machine for the hours of processing.
   - Before starting: it uploads to R2 and may need a worker deploy, both outward-facing and both
     needing Cloudflare credentials. Confirm with Robby first.
2. **Regions as data** (`ecoregions`): a baked lat/lon → EPA Level III grid and a code → region
   table (`REGIONAL_LIFE.md` §2), so `regionStyle` carries the region key. `plantMix`, `faunaMix`
   and `understoryMix` then read it instead of the coarse climate boxes and `naSub`.
3. **The flora packages** (`regional-flora`), `models.md` build order #2–#10, in order:
   - #2 live oak and Spanish moss;
   - #3 northern and mountain forests: aspen, ponderosa, white pine, the spruces and firs;
   - #4 the eastern hardwoods and the flowering understory;
   - #5 bald cypress and cottonwoods;
   - #6 California's oaks and redwoods;
   - #7 the desert;
   - #8 palms;
   - #9 the ground layers;
   - #10 fields.

   Each package lands with:
   - the models in `src/assets/flora.ts`, validated, with vertex budgets in
     `tests/foundry.test.ts`;
   - placement by region in `props.ts` (and `understoryMix` for ground layers);
   - studio shots, in-game spots and the green-spot comparison for its regions (below).
4. **The wildlife packages** (`regional-wildlife`), #11–#16: backyard birds, water and big birds,
   mammals on the existing bases, new mammal plans, reptiles, small life.
   - Bodies go in `src/assets/fauna.ts`, behaviour in `src/sim/critters.ts`, motion in
     `critterMaterial`.
   - The casts go in `faunaMix` by region. Range rules from `docs/regional-life/ranges.md` get a
     test that places none out of range.
   - Robby asked for "amazing animation". Each row in `models.md` says how the animal moves: the
     heron stalks then strikes, the vulture teeters on a V, the deer bounds with its white flag up.
5. **Left from the Northwest:**
   - the ground under a wood painted as duff and moss, not the lawn wash;
   - moss on boulders;
   - OSM genera mapped to the new kinds in `realTile.treeKindOf` (Pseudotsuga → fir, Thuja → cedar,
     Tsuga → hemlock, Picea sitchensis → sitka, Alnus → alder, Acer circinatum → vinemaple). The
     worker bakes that `sp` into tiles, so it needs the paired cache bump (worker `t/vN` with the
     client's `&v=N`) and a worker deploy. Ask Robby first.
6. **Queued bug** (`upstairs-over-shopfront`): an upstairs flat's floor and furniture stand out
   over a shopfront (the Bonobos building, Brooklyn).

## How to check your work

- `npm run typecheck`, `npm test`, `npm run build`. The build must pass before every push.
- **Tree studio:** the models side by side, flat-lit, for silhouettes. On the dev server's
  `/kit.html`, run `await import('/tools/tree-shots.js'); await __TREES__('tag', ['fir', …])`. It
  saves `shots/trees-<tag>.jpg`. Headless, drive the page with Playwright (the shot harness at
  `../../shot-harness`).
- **In the game at a real place:**
  `node tools/capture.mjs --region=none --query="at=<lat>,<lon>" --shots=none --montage=only --eval="(async () => { await import('/tools/spot-shots.js'); return await window.__SPOTS__('tag', [{ lat, lon, bearing, pitch, eye: 1.7, label }]); })()"`
  saves `shots/spots-<tag>.jpg`. In Git Bash, set `MSYS_NO_PATHCONV=1`.
- **Against photos:**
  `node tools/real-compare.mjs --kind=green --states=<ST,…> --group=region --tag=<run>` saves
  `shots/real/<region>-montage.jpg`, with scores in `tools/real-scores.json`.
  - It needs the Mapillary token in `.env`. That file is git-ignored, so a fresh clone won't have
    it: ask Robby.
- Visual review reads only the montages.

## Robby's rules

- Do the work yourself. At most one subagent for a bounded side task, such as research or a list;
  never several subagents doing the work.
- Commit and push after each item, with a LOG entry each session and tests for every new system.
- Quote Robby's own words in the feature notes.
- Mapillary: never print or commit the token; photos stay in the git-ignored `raw/mapillary/` and
  are never shipped. Never unblur faces or plates; never use Mapillary Vistas.
- Never use Google Street View.
- Public places and public data only.
- Ask Robby before anything touching privacy or a big redesign.

## Things that bit us

- Many files are CRLF. A script that edits them must keep the line endings.
- A vitest title with an apostrophe goes in double quotes.
- **Tree models** are built under 14 m and scaled to the real tree. Their limits:
  - far model < 1,500 vertices;
  - near model ≤ 2,500 vertices (the wood plus 4 a card), with 8–20 cards (so ≤ 20 lobes);
  - the near trunk at the ground ≥ 1.3× where it meets the crown, so a crown to the ground needs a
    little bare trunk.
  - New kinds go at the end of `TREE_KINDS`.
- **Determinism:** never change the sequence of `rng.float()` calls in `props.ts`'s scans, or every
  region's layout reshuffles. New choices take position hashes (`hashf`, `variantAt`).
- The grass and the forest floor read tree crowns from `NearTrees.crownsNear`, which covers every
  mounted tile, shown yet or not. The scene's `instances()` skips tiles that haven't been revealed.
- A conifer's clumps are *sprays* (`lobe(…, { dir, stretch, bend })`): flat blobs read as stacked
  plates on a pole.
