# Debugging — soak, screenshots, worker logs, dev-server quirks

Read this when the task involves hunting freezes, visual verification, or mysterious dev-only
behaviour.

## Freeze hunting

- `node tools/soak.mjs --region=<id> --seconds=120` drives the game (doors, stairs, streets,
  flight) and reports stalls/hitches/page errors. The frame loop schedules itself first and
  survives exceptions (counted in `__RENDER_INFO__.errors`).

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
