# Rendering — style, shaders, ground paint, grass

Read this when the task touches the look: materials, shaders, palettes, ground paint, grass,
or per-region style.

## Style + recipe

- `src/world/styles.ts` — `regionStyle(lat,lon)`, `meta.style`, `setActiveStyle` on main +
  tile worker.
- `src/world/recipe.ts` — `recipeFor(bd, style)`: every per-building look decision, a pure
  f(bd.s, style, fc/rc).
- Facade shader codes: siding in the fraction of `vInfo.y` (kind + code/10), roof material in
  `vInfo.w` on roof faces, region window vocabulary in `uWinStyle`.

## Shader + material conventions

- All materials are custom ShaderMaterials sharing uniforms in `src/render/shared.ts`; the
  look lives in `src/render/post.ts`.
- Varyings that carry ids/seeds (`vInfo`, `vTan`, `vOut`) must be `flat` — interpolated ids
  (up to ~8.5 M) drift per pixel and every `seedOf(id)` choice shimmers (the old window
  flicker).
- Local frame: +x east, +z south (north = −z), metres, per-region origin from config.
- Depth precision: the camera's near plane follows the height (`render/nearPlane.ts`, set in the
  frame loop every 0.2 s). It is 1% of the clearance over the highest ground in a 120 m square and
  the sea, 0.25–40 m, in quarter-octave steps. At a fixed 25 cm, a 24-bit depth step was ~1 m at
  2 km, and low shore ground fought the sea plane from the air. Anything reading depth takes
  `camera.near` each frame (`post.ts`, `readSeen`); never assume 0.25.
- Fog (`shared.ts` `applyFog`): density `uFogDensity` (haze), thinning upward with `uFogFalloff`
  (scale ~33 m) plus a sea-fog term; heights are above the ground where you stand. It is the mean
  density along the whole sight line — eye height to the point's (`layerMean`, exact) — not the
  point's own layer taken the whole way: from a hill or a balloon the distant streets were buried
  under a flat white sheet while tower tops rose out of it. At street level eye and point share a
  layer, so nothing changes there. Auto weather's sea fog is a marine layer: coastal (oceanD <
  ~500 m), mornings, burned off by 11 (main.ts); never inland.
- Coplanar layers carry a polygon offset, in depth units (constant in steps, so metres far off and a
  hair up close). Streets, lakes and shore foam are pulled forward (−1/−4); wakes −2/−6; the sea
  plane is pushed back (+1/+2) under shore ground.

## Ground paint

- `groundPaint.ts` windows `detail` (300 m) + `mid` (1.6 km) re-centre on the walker and paint
  baked + streamed-tile features (stream `onTile`/`onUnload` → `paint.setTile/dropTile`); the
  shader applies them everywhere.

## Grass

- `src/world/grass.ts` — player-centred tuft cells, masked by `GroundPaint.grassMask` (grows
  only where the painted ground is open/green). Walks start at today's sunrise (`?hour=`).

## The brush's sketch pass

- `WatercolorPost.render(…, overlay)` draws the brush's scene (ui/brush.ts) into its own target
  (`ghostRT`: colour + depth, made the first time) after the scene, and the composite lays it over
  the painting before the ink: rgb display colour, alpha = coverage (+ 2 where the wash is wet, for
  the bleed past the line). Its outline is the Laplacian of 1/z on its own depth, drawn twice with a
  7 fps jitter (the boil) and broken by the paper's tooth; where the scene's depth is nearer it's
  dashed and the fill fainter. `U.uBrush` pales the world round it; `U.uRipple` rings the water as a
  painted boat settles; `U.uGhost` = (on, line, bleed, harness mask).

## Looks (the panel's Look menu, `post.ts` `LOOKS`)

- A look is a set of `postParams`; picking one saves like any knob. Every look sets the four
  cleaner-look knobs, so switching never inherits the last look's: `crisp` (the unbrushed frame
  laid back over the paint), `softGlow` (a mist over the lights + bloom on the bright sky and
  sunlit faces), `clarity` (the paint's local contrast against its small blur), `contrast` (an
  S-curve). The default is `watercolor HD`; `clean vibrant`, `clean HD`, `gouache` and `dreamy
  pastel` are cleaner options to try.

## Sketch → paint (post composite)

- `post.ts` composite reconstructs world position from depth (`uInvProj`, `uCamWorld`,
  `uWorldOff`) and samples `U.uExplore`. Unexplored pixels become view-anchored graphite hatching
  on paper (three stroke families by tone, lighter with distance), and ink lines get stronger.
  Explored pixels keep the wash, with pigment pooling at the bloom rim. The sky is never sketched.
- That full underdrawing is now a developer switch (`postParams.sketchFar`, panel → Watercolor →
  "…far away too"): off, unexplored ground is only a paler first wash within ~160 m. The paint
  reach round you on foot is `sketchReach` (45 m). In that mode the composite reads the fine
  window (4 km, 8 m) and, past it, the far window (`U.uExploreFar` / `U.uExploreFarBox`: ~48 km,
  64 m texels, RG = what photos painted / the share of each 64 m cell you walked), blended over
  the fine one's last ~200 m; inside the fine window far photo paint shows too. Only that branch
  reads the far window: the default mode renders exactly as before. Past ~12.5 km (depth ≥
  0.99999) is sky to the composite and never sketched.
- A photo (photo mode, Space) in that mode paints what it frames: `WatercolorPost.readSeen` packs
  the frame's depth into a small RGBA8 target (384 on the long side, a phone 256; log depth, 24 bits) and reads
  it back async; `render/seen.ts` unprojects it; `Explore.paintSeen` paints it (gameplay.md).
