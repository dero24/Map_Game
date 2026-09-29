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
