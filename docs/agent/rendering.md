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
  window (4 km, 8 m) and, past it, the far window (`U.uExploreFar` / `U.uExploreFarBox`: ~32 km,
  64 m texels, RG = what photos painted / the share of each 64 m cell you walked), blended over
  the fine one's last ~200 m; inside the fine window far photo paint shows too. Only that branch
  reads the far window: the default mode renders exactly as before. Past ~12.5 km (depth ≥
  0.99999) is sky to the composite and never sketched.
- A photo (photo mode, Space) in that mode paints what it frames: `WatercolorPost.readSeen` packs
  the frame's depth into a small RGBA8 target (256 on the long side; log depth, 24 bits) and reads
  it back async; `render/seen.ts` unprojects it; `Explore.paintSeen` paints it (gameplay.md).
