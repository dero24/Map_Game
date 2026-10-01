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
- The far layer lies past the camera's far plane and has a depth of its own (`shared.ts`
  `farDepth`, linear to 150 km): `farSkyline.ts` towers (renderOrder −9.5, test + write) →
  `horizon.ts` ring (−9, test only: its nearer ridges and sea hide the towers) → a hook (−8.5)
  clears depth, and the near world paints over the whole layer. Anything new past the far plane
  joins it the same way; nothing near may sort before −8.5. `?farskyline=0` turns the towers off.
- The far skyline (`farSkyline.ts`): one Overpass read of the very tall (≥ 120 m or 35 storeys,
  masts ≥ 150 m) within 60 km, through the tiles' `osmToTile`, cached in IndexedDB and re-read
  after a 15 km walk; flat-topped prisms merged per 8 km sector on the bare-earth DEM (z11). The
  earth's curve with refraction (R/0.87) lowers them, the sea's bulge hides their bases (from a
  Jersey beach Manhattan's lowest ~100 m), the day's air takes them toward the sky (`airT`: clear
  air shows them to ~75 km, the usual haze faintly, a hazy day or sea fog not at all). Towers the
  skyline ring (`skyline.ts` `box`) or the detail tiles draw are left to them. Real size: from the
  Sea Bright beach Manhattan stands a few pixels tall at the eye's field of view — a line on the
  horizon you notice, plainer through the photo zoom.
- Fog (`shared.ts` `applyFog`): density `uFogDensity` (haze), thinning upward with `uFogFalloff`
  (scale ~33 m) plus a sea-fog term; heights are above the ground where you stand. It is the mean
  density along the whole sight line — eye height to the point's (`layerMean`, exact) — not the
  point's own layer taken the whole way: from a hill or a balloon the distant streets were buried
  under a flat white sheet while tower tops rose out of it. At street level eye and point share a
  layer, so nothing changes there. Drifting weather's fog (`weatherParams.fogMode`, panel
  "drifting fog"): 'rare, anywhere' (default — about one hour in eleven, lighter, plus a coast's
  morning marine layer), 'coastal mornings' (oceanD < ~500 m, burned off by 11) or 'never'.
- Weather presets (panel Weather → "weather preset", `WEATHER_PRESETS` in ui/panel.ts): clear, fair,
  hazy summer, marine layer, thick fog, overcast, blustery, snow day — each pins the weather
  (drifting off); 'drifting' hands it back to the clock. Moving any slider shows 'custom'.
- Coplanar layers carry a polygon offset, in depth units (constant in steps, so metres far off and a
  hair up close). Streets, lakes and shore foam are pulled forward (−1/−4); wakes −2/−6; the sea
  plane is pushed back (+1/+2) under shore ground.

## Night: lamp pools, the night's floor, the night grade (`render/nightLight.ts`)

Night is laid the way a watercolourist lays it: one deep, cool wash over everything, the street
lamps' pools left warm (a bright heart, a quick soft edge, real dark between one pool and the next),
lit windows as the accents. The shapes and the grade's maths are plain functions in
`nightLight.ts` (tests/nightLight.test.ts); the shaders run GLSL twins fed the same numbers.

- **The lamp map** (`stream.ts` `repaintLamps`: 2 km round the walker at 2 m/px, repainted at most
  every 1.5 s for tiles, at once near its edge; one sprite stamped per lamp, added up). R holds how
  near a lamp is: a cone per lamp, 1 at its foot and 0 at `POOL.reach` (9 m), squared — lamps 18 m or
  more apart never meet in it, and two closer than that share a middle a little brighter than
  either. G is the canyon field.
  - R used to hold the pool itself: white gradients (r 13 m) added up, then `pow 1.6`. At 2 m texels
    that was a blur; every lamp spread a dim amber wash ~26 m across that ran into the next (round
    10's "amber-mud": the night street's lower 40% at L\* 26, hue 46–50°, C\* 15).
  - The old gradient still goes into G under the canyon field, unchanged: `canyonAt` reads it as
    sky lost, so by day the sky fill under every lamp is cut by up to 45% (along a shop street
    with a post every 18 m, the whole street's shade). It's an accident of the two sharing the
    sprite, but the day look was judged with it: drawing the sprite's G as 0 removes it and lifts a
    golden-hour shop street ~3.5 L\* (mean ΔE ~5). That's a look decision, left for one.
- **The pool** (`shared.ts` `lampField`, `lampAt`): the distance read back from the cone, shaped as
  `exp(−(d / radius)^edge)` — a broad, even heart, down to 1/e at `radius`, gone a couple of metres
  past it — times the height falloff (full to 1.5 m over the local ground, nothing by 10.5 m).
  `lampAt` = field × `uLampPower` × `gain`; `paintLight` adds `max(albedo, 0.3) × uLampColor ×
  lampAt`, so an asphalt heart is near paper-white and warm. `U.uLampPool` = (reach, radius, edge,
  gain): turn it in the page to try a shape.
- **The night's floor** (`atmosphere.ts`): the sky fill's night lift is blue (it was a grey 0.015
  that lit the shadows grey), and the ground's bounce loses the sand's warmth with the sun. Both
  scale with `uNight`, which is 0 from a sun 1° under the horizon up: day and golden hour are
  untouched.
- **The night grade** (`post.ts` composite → `nightGrade`, after the colour grade, on display
  colour): everything but the lights goes under one glaze (`NIGHT_GRADE.tint`, Payne's grey toward
  indigo) — its value kept, most of its own hue (`hue`) given up to the glaze, the darks a little
  deeper (`deep` at black) — so a pool's dim edge, a lawn and a tan sidewalk all go the same blue,
  as the eye sees them by night. The lights (the brightest channel over `reserve`, red over blue
  by `warm`: a lamp's heart, a lit window, the moon) are reserved, like paper. `postParams.nightWash`
  scales it (the default look's 0.5 is all of it). It replaced a 50% multiply by (0.55, 0.62, 1.0),
  which left a dim amber street amber.
- **Wires** at night take the sky's zenith × 0.6: darker than any sky behind them (`props.ts`
  `wireMaterial`, 73e83ec).
- **The check**: `tools/night-check.js` (debugging.md) measures the review's night street against
  round 10's numbers.

## The micro layer: impostor cards for the small things

The small made things of a place — carts, A-frames, porch chairs, flags, hoops, AC units, cleats,
dock boxes, buoys, beach gear, and what the map tags one by one (picnic tables, information
boards, street cabinets, recycling containers, vending machines, clocks, fire rings, planters,
the channel's buoys and markers) — are one layer, drawn in **two draws** however many there are.

- **Pieces** (`src/assets/micro.ts`, a foundry family): 37 recipes in a fixed order — a record
  carries the index, so add at the end, never reorder. Front −z, origin on the ground (a wall
  mount at its bracket, a float at the waterline), TINT where the instance colour paints. Budgets
  and boxes in `tests/foundry.test.ts`.
- **Placement** (`src/world/micro.ts`, in the tile worker, after every other builder): plain
  records (`MICRO_STRIDE` 8: x, y, z, yaw, piece, scale, 0xRRGGBB, flags) on `BuiltTile.micro`.
  Real data first (realTile `furnitureClass`/`seamarkOf`), then a seeded fill keyed by position
  and by what's there: each house's trash and recycling carts (at the kerb on the round's
  collection day — a weekday per ~2 km cell, from the real date; the round's cart colour), porch
  chairs, a flag by the door, lawn things by hood and coast, a hoop by the drive, an AC unit and a
  grill or fire ring; shopfront A-frames, planters, newspaper boxes; kerb pedestals and signs; the
  beach crowd in the dry sand by the season (`BEACH_SEASON`); cleats, dock boxes, life rings and
  traps on piers; moorings and pot floats off them. Each tile places only on its own ground, on a
  world-aligned grid (a beach or pier the map gives a neighbour still gets dressed). Solid pieces
  are walls in the walk world. `?date=` reaches the worker (`setMicroDate`).
- **Drawing** (`src/world/microLayer.ts`, main thread; stream `onTile`/`onUnload` → `add`/`remove`,
  `update` each frame): every `step` m moved it re-sorts the mounted tiles' records, nearest first,
  under the tier's caps. Close up, the real pieces are written into **one merged mesh**
  (`propMaterial({ fade: true })`: lit, shaded and casting like any prop). Further out, **one
  instanced draw of impostor cards** (`src/render/impostor.ts`).
- **Impostors**: each piece is photographed once on the GPU, a few a frame at boot, from an 8 × 8
  **hemi-octahedral** grid of directions (the square's middle straight down, its rim the horizon,
  28 azimuths on it) into an atlas: RGBA8 colour (√-encoded, premultiplied coverage) + RGBA8
  octahedral normal, depth toward the camera and the TINT mask. Pictures are 64 px for big pieces
  (R ≥ 1.2 m) and 32 px for the rest on a desktop (32 / 16 on phones), blocks packed on a
  power-of-two grid so mips never mix pictures (cards read to a 4-texel picture). A card is a quad
  square to the sight line through the piece's middle; the vertex shader turns the view into the
  piece's frame (yaw), picks the grid triangle it falls in (three pictures, barycentric weights)
  and carries each corner along the sight line onto each picture's plane (Brucks' virtual-frame
  projection — no swimming between pictures). The fragment shader blends the three, decodes the
  normal (turned by the yaw), writes **per-pixel depth** from the baked depth (`gl_FragDepth`: it
  sits in the ground and behind posts, and the ink finds its outline) and lights it with the
  props' own `snowOn` / `pigment` / `shadowAt` (it receives shadows) / `paintLight` / `applyFog`.
- **Hand-over**: per piece, where a texel of its pictures is about a pixel on screen
  (`handoverAt`), clamped to the tier's range (desktop 25–60 m, phone 18–40, low 14–30). Across
  `band` m both draw, splitting the pixels on one ordered dither (`dither4`): the mesh where the
  dither is under its share, the card the rest — the share computed identically from the piece's
  foot in both shaders. A piece only one side holds (capped out, or not yet photographed) draws
  whole on that side. Far off the cards thin out the same way at the piece's `far`.
- **Budgets** (`render/quality.ts` `MICRO_TIERS`, tested in `tests/micro.test.ts`): two draws in
  the main pass (+1 in the shadow pass where the 3D pieces cast: desktop and phone); cards
  12,000 / 4,000 / 1,500 and 3D pieces 500 / 160 / 80 (160k / 50k / 24k vertices) for desktop /
  phone / low; atlas ≤ 48 MB / 12 MB / 12 MB with mips.
- Debug: `__GAME__.micro` (`stats`, `mode` 0 hand over · 1 cards only · 2 3D only), `?micro=0`.
- The atlas takes any foundry geometry: people (9.5) and trees (1.15) can use the same
  `ImpostorAtlas` + card shader.

## Ground paint

- `groundPaint.ts` windows `detail` (300 m) + `mid` (1.6 km) re-centre on the walker and paint
  baked + streamed-tile features (stream `onTile`/`onUnload` → `paint.setTile/dropTile`); the
  shader applies them everywhere.
- A window never repaints whole in a frame (`DetailGround`). The wash goes through a blur, and a
  whole repaint was the flying hitch: ~0.5 s every 66 m wherever the browser rasters 2D canvases
  on the CPU.
  - It moves in whole steps of its own pixels (size/32: 9.375 m and 50 m). What it still shows
    slides across in one canvas copy.
  - It paints only the strip it moved onto, plus the band behind it, where the blur fades the wash
    out at the edge. Slices go a frame at a time, each on a small canvas of its own with the blur's
    reach as margin.
  - The texture and `box` change together when a move is whole.
  - A tile's change (`touch`: its box + 100 m) waits while the window moves, then repaints the same
    way.
  - Slices skip what they can't show: a land-cover layer lying opaque over a slice hides the lawn
    and the layers under it.
  - `tests/groundPaint.test.ts` meters each frame's blurred pixels on a flight.
- `Painter.paint(…, clip)`: the window decides (each building's block-paving census), and the clip
  only limits what's drawn. A slice draws the whole window's strokes that reach it, the same way.
  Junctions are judged on all their arms, the roads within 50 m.

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
