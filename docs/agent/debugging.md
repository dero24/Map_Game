# Debugging — soak, screenshots, worker logs, dev-server quirks

Read this when the task involves hunting freezes, visual verification, or mysterious dev-only
behaviour.

## Freeze hunting

- `node tools/soak.mjs --region=<id> --seconds=120` drives the game (doors, stairs, streets,
  flight) and reports stalls/hitches/page errors. The frame loop schedules itself first and
  survives exceptions (counted in `__RENDER_INFO__.errors`).
- Hitches in a page you can script (the pane, pumped by `__PUMP__` on `?capture=1`):
  `await import('/tools/hitch-probe.js'); await __HITCH__({ seconds: 30, move: [0, -15] })`.
  It times every per-frame system `__GAME__` exposes, plus the stream's mount / unload / index
  rebuilds, the ground paint's hooks and `ctx.instances`. It moves the car you're in (or the walker)
  at `move` m/s, so new tiles stream in.
  - It reports the frames over `slow` ms, what took them, what nothing wrapped accounts for
    (`other`: unwrapped code, GC), and renders that compiled or uploaded (`+prog`, `+geo`, `+tex`).
  - `deep: true` adds the fine-grained wrappers (walk-world adds, interior registration). They
    inflate the numbers they measure.
  - To drive: `V = __GAME__.vehicles; V.summon('car'); V.enter(V.list.at(-1))`.
  - The car goes through buildings: the probe moves it, bypassing collision.

## Screenshots / montage

- `node tools/capture.mjs --shots=ocean-golden,ocean-night,bridge-golden [--region=<id>]` →
  `shots/<region>-montage.jpg` (one JPEG contact sheet — **agents: read ONLY this file, never
  the per-shot PNGs**; `--montage=only` skips writing PNGs).
- Extra shots beyond the ocean/bridge set: `houses, porch, shop, sign, raised, roofs,
  doorway, inside, inside-night, stairs, upstairs`. Also `top:x:z:alt` top-down,
  `--eval="…"` to poke `window.__GAME__`. Uses Playwright from `../../shot-harness`.
- No Playwright? (agent driving the built-in/live browser): open `?capture=1&region=<id>`,
  then `await import('/tools/inpage-montage.js')` and `await __MONTAGE__([shotName | {label,
  fn(game)}], {save:'x.jpg'})` — the dev server's `/__shot` sink (vite.config.ts, serve-only)
  writes `shots/x.jpg`. Emulate a landscape viewport (e.g. 1600×900) first; the canvas is the
  capture size.

- Hidden Browser pane: rAF stops and the canvas reads 0×0 or blank. Take one screenshot to wake
  it, emulate a 1600×900 viewport, and set `window.requestAnimationFrame = cb => setTimeout(() =>
  cb(performance.now()), 16)`. Montages with `{save}` land in `shots/`; copy them to a fresh name
  before reading (image reads are cached by path).
- Any place by lat/lon, checked on what the lens sees (`?at=…&capture=1`):
  `await import('/tools/spot-shots.js'); await __SPOTS__('tag', [{ lat, lon, bearing, pitch,
  subject: { lat, lon, h, r, name }, fill }, { car: 'parked', lat, lon }, …])` → `shots/spots-<tag>.jpg`.
  - An id render checks each frame: the subject's visible share (drawn alone against the world's
    depth), anything within 2.5 m / 4 m of the lens, how much of the frame is world, the lens not in
    a wall, a building or on a roof.
  - A frame that fails is re-posed round its subject until it passes; only what still fails is
    stamped under it. `repose: false` keeps a pose as given (a frame that must fail, e.g. facing the
    sky). `window.__SPOTKIT__` pokes one pose by hand.
  - A subject `name` matches the mesh's own name or a parent's (`retaining-walls`, `retaining-steps`,
    `player-vehicles`, `trees:`).
- Sketch look in shots: capture mode is fully painted unless the URL has `&sketch=1`.
- The brush's readability (reviewer round 9): with the brush out and a sketch showing on a
  `?capture=1` page, `await import('/tools/brush-check.js'); await __BRUSHCHECK__()` paints it in
  and returns the sketch's share of the frame, its visible share at the sketch and through the wash
  (a mask pass: `U.uGhost.w` = 1 draws red where the sketch is, green where it's hidden) and mean ΔE
  sketch → dry over its pixels (CIE76 + CIEDE2000), with pass flags (≥ 2%, ≥ 70%, ≥ 25). Painted
  rides persist (`map-game.vehicles.v1` in localStorage) — clear it between runs or they crowd the
  water the next sketch wants.
- Debug handles on `window.__GAME__`: `explore`, `commissions`, `photo`, `atlas`, `arrival`,
  `hints`.

## Phones: quality tiers + the boot report

- Boot picks a tier (`src/render/quality.ts` `pickTier`): `desktop` = the shipped defaults;
  `phone` (touch-first, a phone UA, or a small touch screen) = CSS-pixel paint (`hiDpi` off),
  `paintDetail` 0.6, 1024² shadows, 2048² ground-paint canvases, tile rings 900/1500/4000 m;
  `low` (a phone with ≤ 3 GB, ≤ 4 cores on Android, max texture ≤ 4096 — or a tab whose last
  load died on screen) = render scale 0.75, `paintDetail` 0.5, 1024² paint, no shadow pass,
  rings 750/1300/2500 m.
  A knob saved in the panel (`userKeys`) always wins. `?quality=desktop|phone|low` forces a tier;
  `window.__TIER__` says which one ran and what it set.
- A city is what kills a phone (Manhattan filled its GPU; Chrome crashed, then refused the site
  WebGL). So the phone/low tiers also: keep the detail tiles under `streamParams.budgetMB` of
  vertex data (200 / 120; `world/budget.ts` admits cells nearest first, the cell you stand in
  always; the rest keep their silhouettes), build 2 / 1 real tiles at once (`realConc`), read a
  4 / 3 km skyline, and measure no LiDAR (`?lidar=1` forces it). A PC's are unchanged (no budget,
  4 at once, LiDAR, 8 km). `stream.detailBytes` is the budget's measure. On every platform now: a
  tile's sign atlas is disposed with it (it leaked on every unload), and an unloaded tile's walls
  leave the walk world ~1.5 ms a frame (`purge`, `WalkWorld.purgeSome`; they were tombstoned for
  good — one long hop left 166k dead walls on a PC, and purging a tile's at once took 65 ms on a
  phone).
- A lost GPU context on a phone sheds memory at once (budget halved, silhouettes to `dropR`, no
  shadow pass) and the next load in the tab steps down a tier (`diag.lostBefore`). WebGL that
  won't start says how to get it back (`NO_WEBGL`: the browser may have blocked the site after a
  crash — close it completely and reopen).
- Phones sleep when put away (`ui/lifecycle.ts`, `window.__SLEEP__`): sound suspended, the life
  worker paused (on a PC too — it ticked on in hidden tabs), held input released. Never under
  `?capture=1`.
- A phone lands (✈) only once the cell under it is built (`stream.solidAt`), and on foot waits
  where it stands until it is: before that its buildings are silhouettes with no walls (a fast
  flight landed inside a house and walked out through its wall). Tested headless: fly to an
  unbuilt cell, press ✈, check `walkParams.fly` holds until `solidAt`, then the landing is outside.
- The boot report (`src/ui/diag.ts`, shown in `#fatal`): browser, WebGL version + GPU string,
  the key limits, float-buffer extensions, the tier, the boot stage, the first shader log and the
  first JS errors. It opens by itself when WebGL can't start, a shader won't compile, the boot
  throws, no frame is drawn 15 s after "Begin walking" or frames stop for 15 s while the page is
  on screen (`?watchdog=<s>` for slow software-GL rigs), every frame fails, or the GPU context is
  lost and not returned in 4 s. `?diag=1` opens it on demand (ask a phone user for a screenshot).
  `window.__BOOTDIAG__()` returns it as data.
- index.html's inline boot guard (a classic script) keeps errors from before the module runs and
  shows its own short report when the module never starts (a browser too old to parse it, a
  failed download). A load that died on screen leaves a `sessionStorage` breadcrumb
  (`mapgame.boot`): the next load says where it stopped and steps one tier down.
- `npm run build && node tools/mobile-check.mjs --device=pixel7|iphone|desktop [--query=quality=low]`
  runs all of the below and writes `shots/mobile-<device>.{png,json}`; it exits non-zero on a page
  error or a shader program over the phone limits.
- Headless mobile checks: Playwright device descriptors (`Pixel 7`, `iPhone 14`) +
  `--use-angle=swiftshader --enable-unsafe-swiftshader`, served under a sub-path with no
  COOP/COEP (like Pages). **Stub `Element.prototype.requestPointerLock`** in those runs: headless
  Chromium, once it grants pointer lock, sends a synthetic mousemove every frame and its renderer
  grows ~40 MB/s — it reproduces on a blank page and OOM-kills the tab within minutes (phones
  have no pointer lock). SwiftShader draws a frame every few seconds on 2 CPUs: poll
  `__RENDER_INFO__.frames`, click `#start` via `evaluate`, and allow minutes for screenshots.
- `npm run build && node tools/hud-audit.mjs [--phones="Pixel 7,iPhone SE"] [--verbose]`: the phone
  HUD's geometry — the built CSS and markup (the game's module blocked, so no WebGL: about a minute)
  on 10 phones from a 320-wide SE to a Pro Max, upright and on their side, walking / beside a ride /
  driving / flying a plane / flying on foot, a long hint and place name up. Every overlapping pair
  of HUD boxes is listed; exit 1 if any. It sets the states as `syncTouchControls` does and makes
  the ride readout as `vehicles.ts` does — keep those in step. Run it after any change to the touch
  layout (style.css); the montage shows one phone, this shows them all.

## Play checks (`tools/playtest.js`)

`await import('/tools/playtest.js')` in the running game (any page; `?capture=1` keeps the canvas
readable), then:

- `__OVERLAPS__({ all })`: footprints standing inside others in the walk world (real cells, or
  every mounted one with `all`). `nested` should be 0 (nest.ts); what's left is partial overlaps.
- `__DOORS__({ max, top })`: the nearest `max` front doors, walked in. First the straight
  approach: from a free spot a step past the foot of the steps, to the doorway, 1.5 m in, and back
  out. When that fails, a flood decides. It fills the ground in the door's frame (35 cm steps,
  14 m round) from 14 m out, by the walker's own `move`: sliding on walls, climbing a surface up to
  75 cm over its feet. A door counts as open if the flood reaches its rooms 70 cm or more past the
  doorway. Those are counted as `roundabout`: the way in goes round a tree, a hedge's end, a parked
  car. Stand-in doors are counted apart.
  - Why one is shut: `__DOORWHY__(x, z)` gives the door, its footprint, a profile along the normal
    (polygon, surface, blocked) and the walls within 3.5 m. `__DOORFLOOD__(x, z)` says how near the
    flood got to the foot of the stair and to the door (`__LANE__(i)` lists one lane's cells).
    `__WALKTRACE__(x0, z0, x1, z1, feet?)` walks a line and names the wall it stopped at, with its
    height band. `__SEGS__(x, z, R, feet?)` lists the walls round a point.
- `await __FLICKER__({ frames, jump, limit, near, bare })`: the real frame, drawn twice with the
  camera 5 cm apart along the view. A pixel counts when its colour jumps past `jump` (40) and past
  2.5× its own neighbourhood's variation, so edges and textured paint don't count. `worstShare`
  over `limit` (0.2%) fails.
  - It must be the real frame. An id pass (`__FLICKERWHO__` still names objects that way) can't
    follow the water's, grass's and roofs' vertices, which their shaders move. Its sky/water
    "fights" were artefacts.
  - Transparent surfaces that don't write depth (foam, wakes) blend rather than fight: leave them
    out.
  - `near: 0.25` and `bare: true` redraw with the old fixed near plane and no sea offset, for an
    A/B. `__FLICKER_SELFTEST__()` plants two slanted sheets 5 mm apart in the sky ahead; the check
    must fail on them (it reports 1.6%). Two camera-facing quads at the same spot don't fight:
    their depths round the same way.
- `await __ALTITUDE__({ heights, near, frames })`: flies up at the walker and runs `__FLICKER__` at
  each height. `await __FLYOVER__({ h, frames, step, yaw, pitch })` flies a line and posts a
  contact sheet to `shots/fly_<h>.jpg`, with the blue/green flips between frames.
- `__ROADPOSTS__({ R })`: short collision walls (a post, a mast, a hydrant: sides under a metre)
  standing 60 cm or more inside a car street's kerb. A car stops dead on one.

### Gameplay: walk, drive, teleport, stream, frames

These drive the game's own code: the walker's `update` with its keys held for it (the yaw steered)
and the interiors it walks past, the rides' `update` and E (`toggle`), `ctx.teleport` (the atlas's
"walk here") and `settleWalker`, the tile stream. A walk or a drive runs in fixed 1/60 s steps
without the page's frames in between (a few ms of real time a simulated second), so a seed gives
the same run on any GPU. Each returns `{ pass, …numbers, fails: [{ kind, at: [x, z, feet], … }] }`
and puts the walker back.

- `await __WALKABOUT__({ seconds: 300, seed })`: seeded legs along the street graph (one side of
  the street, 10 m goals) and to doors: to the foot of the steps, 1.5 m in, up the stairs (planned
  to the foot of the flight, then climbed flight by flight, round a dogleg's landing), back down
  and out. Paths come from an A* over the walker's own `move` + `surfaceAt` (40 cm lattice; in and
  out of buildings a node per 1.2 m of height, so a walk can pass under a landing and later cross
  it); the follower aims only at path points it can walk straight to. Fails on: `nan`; `wall` (a
  wall within 28 cm at the feet' height); `solid` (in a footprint with no rooms); `under` the
  lowest surface; `floating`/`sunk` 30 cm off the surface for 0.5 s; `stuck` (a planned path the
  walker couldn't follow for 4 s, twice); `trapped` (nowhere 3 m away); `noExit` (inside, no way
  back out, even on a 20 cm lattice); `stairs` (a flight it couldn't climb). `noUp` (no way to the
  foot of a stair), `shut` and `noWay` are counts, not failures. `trace: true` adds the legs' log.
- `await __DRIVE__({ seconds: 60, seed })`: stands beside one of the nearest parked or kerb cars
  and presses E (the developer summons only if none is in reach), drives seeded routes of the car
  graph (no service ways) by pure pursuit, gets out and back in every 10 s. A new route sets off
  the way the car is going; when the way on is behind it, it stops and three-point-turns (backing
  at a walking pace, never into a wall). Fails on: `nan`; `inside` (the
  centre in a footprint that isn't a raised house's pilings); `clip` (a corner or bumper over 60 cm
  into one); `flying`/`sinking`; `jump` (more than 1.5 m, or 3× its speed, or 1 m up or down in
  one step); `offroad` (over 1.5 m past the nearest carriageway's edge for a second while it
  follows its street: on a street segment of its route, lined up with it, not within 15 m of a
  corner of the route; after setting off from a driveway, backing off a stall or turning round it's
  judged again once it's back on the road); `blocked` (stopped dead on its street, lined up, a wall at its bumper:
  a post or a building in the road); `exit`/`reenter` (E out leaves the walker somewhere bad, or
  can't get back in). `stalls` and `turns` are counts. `trace: true` logs the pursuit.
- `await __TELEPORTS__({ n: 6, seed })`: to a door, a street and a random spot in turn, through
  `ctx.teleport`, then `settleWalker` (called directly: in capture mode its once-a-second turn is
  60 frames away), a frame, `settleWalker` again. Fails where the walker is left: not walkable, in
  a wall, in a solid building, under the ground or off the surface, shut in. `landings` lists
  each one (in rooms or not, facing in or out, how far the settle moved it).
- `await __STREAMING__({ seconds })`: teleports half to one load ring away, waits for every cell
  of the ring to be covered (its tile, or a real cell's stand-in) within `seconds` (30; 120 on
  software GL), flies low across it at 20 m/s for 20 s (the walker's own cell never empty for
  0.5 s) and waits again. It wraps the stream's own `mount`/`unload`: fails on a copy mounted over
  a live one (`twice`), a tile group in the world no loaded tile owns (`ghosts`), mount failures,
  baked or stand-in tiles that failed to load, worker errors (a dead worker, a failed build, an
  error in `workerLog`), page errors and new frame errors. Data it couldn't fetch (offline, the
  tile service or Overpass down, rate limits) is counted as `offline`, not failed: stand-ins cover
  those cells. Counts the frames over 50 and 100 ms meanwhile (`mountHitches`: the 100 ms ones
  that mounted a tile) without judging them.
- `await __FRAMES__({ seconds: 8, budget })`: the page's own frames standing, then walking down the
  street: p50/p95/p99 of the intervals, each frame's work (rAF to the end of the post pass), the
  frames over 50 and 100 ms, long tasks. Budgets (ms): `desktop` p50 20 · p95 34 · p99 50 · two
  100 ms hitches a minute; `phone` 34 · 50 · 100 · six; `soft` (SwiftShader, picked by itself)
  fails only a page that has all but stopped (a median frame over a minute, p99 over two: tens of
  seconds a frame is normal there after a flight). Or pass your own `{ p50, p95, p99, perMin100 }`.
- Self-tests: `await __SELFTESTS__({ only })` runs each check against failures planted for it (a
  walk-world scope of their own, taken out after) and passes when the check fails on every one:
  - `__WALKABOUT_SELFTEST__`: a ring of walls round the start, a wall landing through the walker,
    a building with no walls across its path, the feet sunk 2 m or held 1.2 m up, a controller
    that ignores its keys, NaN, a wall across a flight, the door walled up behind it.
  - `__DRIVE_SELFTEST__`: a wall-less building ahead of the car, the car held on the verge beside
    its street, a 4 m jump, the car held 2.5 m up, NaN speed.
  - `__TELEPORTS_SELFTEST__` (doors hidden, so it lands on the spot): a fenced yard with no gate,
    a 44 m solid block dropped over the landing, walls every 30 cm over it; standing on the water;
    2 m under the ground.
  - `__STREAMING_SELFTEST__`: a second copy of a mounted tile's group, a worker error, a page error
    (`playtest-planted`: the runner leaves those out), a ring cell unloaded with its rebuilds
    refused. `__FRAMES_SELFTEST__`: every third frame held up by 2.5× the median frame (≥ 150 ms).
    `__ROADPOSTS_SELFTEST__`: a lamp-post collider in the middle of the nearest street.
  - A case whose moment never came (no door to walk in at, no stair, no water near) is `null`
    ("n/a" in the report), not a miss.
- `await __PLAYTEST__({ only, skip, quick, selftest, seed, seconds, <check>: false | {…} })` runs
  the checks (`quick` leaves out flicker, altitude, frames and streaming: the ones that wait on the
  page's frames), with `selftest: true` the self-tests of those that ran, and keeps the report in
  `window.__PLAYTEST_LAST__` (`summary`: the verdict in a line). The pure parts (seeded stream,
  planner, road graph and routes, carriageway index, frame statistics, report text) are
  `tools/playtest-core.js`, unit-tested in `tests/playtest.test.ts`.

### The runner (`tools/playtest.mjs`)

`node tools/playtest.mjs --url=http://localhost:5173/ [--at=lat,lon] [--only=doors,walkabout,…]
[--quick] [--selftest] [--seed=N] [--seconds=N] [--opts='{"doors":{"max":300}}'] [--budget=…]
[--swiftshader] [--headed]` opens the page on `?capture=1`, clicks "Begin walking" if the intro is
up, waits for `__READY__` (or the boot report, which it prints), imports `/tools/playtest.js`,
runs `__PLAYTEST__`, prints the report, then the JSON, and writes `shots/playtest-<place>.json`.
Exit 0 pass, 1 a check failed or the page threw, 2 it couldn't run.

- Playwright: the project's `playwright` or `@playwright/test`, else `../../shot-harness`, else a
  global install (`--playwright=<dir>` to point elsewhere). With none it says what to install
  (`npm i -D playwright && npx playwright install chromium`).
- The GPU: headless Chromium uses the machine's GPU where it can. `--swiftshader` forces software
  GL (960×540): frames take seconds, the frame budget turns to `soft`, and a full run with
  self-tests takes 15–30 minutes. A localhost URL nobody answers gets vite started.
- Without the dev server (a sandbox with no npm registry): bundle `src/main.ts` and the three
  module workers with esbuild (rewrite `new URL('./x.worker.ts', import.meta.url)` to the built
  `.js`), and serve the bundle, `public/` and the repo root with COOP/COEP and a `/__shot` sink.
  Then `--url=` that server with `--swiftshader`. Only the baked region loads offline (no tile
  worker, Overpass or DEM); elsewhere (`--at=`) the world is procedural stand-ins, still good for
  walking, driving and streaming. Allow ~45 s to `__READY__`; run long checks in the background
  and poll their log.

## Dev-server + worker quirks

- Dev server is HTTP/1.1: slow `/__tiles` calls starve other same-origin fetches — anything
  the worker needs early ships in its bundle.
- Occluded browser panes stop rAF: montage with `{timers: true}`.
- Worker logs: page console + `__GAME__.stream.workerLog`.

## Known environment quirks (not bugs — don't chase them)

- Soak logs occasional multi-second frames **identically with the worker disabled** —
  headless GPU/GC, not tile-related. `frameErrors=0` is the signal that matters.
- `lifeSim` pedestrian test sits near the vitest timeout (bumped to 15 s) — flakes under load.
- Overpass latency observed 25–90 s/cell under load (plan assumed 2–8 s) — the synth
  placeholder hides it; R2 + in-flight dedup make it once-per-population.
- `wrangler dev --local` logs `Network connection lost` after ~30 s requests — miniflare
  artifact on long cold paths; responses still complete.
- The tile cache keeps two namespaces (page-relative vs worker-absolute base URLs) — correct
  but duplicates entries; dedupe only if disk matters.
- `w-*` real-lite tiles: water renders as flat tinted sheets (no shore shader), no landuse/POIs,
  buildings float on slopes until Phase J grading. Virtual-region terrain is a flat synthetic
  layer — `?at=` coasts get real water polygons but not real elevation yet.
