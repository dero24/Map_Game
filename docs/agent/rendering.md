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
lamps' pools left warm — a pale cream glow under each lamp that dies away into the night — and the
lit windows as the accents. A town's night is never black between its lamps: the night's floor keeps
the street a readable deep blue. The shapes, the floor and the grade's maths are plain functions in
`nightLight.ts` (tests/nightLight.test.ts, which also runs the street end to end through the default
look); the shaders run GLSL twins fed the same numbers.

- **The pool** (`POOL`, `poolLight`): a lamp's own light on the street, `h³/(h² + d²)^1.5` at
  h = 8 m — half at 6 m, 17% at 12 m, 9% at 16 m — exact to `ease` (12 m), then eased out to nothing
  at `reach` (22 m). Lamps closer than 44 m meet faintly between them; a shore street's lamps (every
  third pole, ~114 m) leave the floor between their pools. Its light is `POOL.color`, a warm cream
  (sRGB #ffecce, ~4000 K), × `gain` 1.8: a pale heart (L\* ~75 on asphalt, C\* ~19) on the filmic
  curve's straight part, so the glow's fall-off shows. At gain 3 — right for the old small disc — a
  broad pool sat on the curve's shoulder: a flat cream plateau, and Ocean Ave's lamps (25–45 m
  apart) summed into a floodlit street (frame 3's bottom 40% at L\* 79).
  - Round 11 retired the pool before it: `exp(−(d/5.2)³)`, cut to nothing by 9 m — a flat top with
    a cliff, sodium orange (#ffb86a, hearts at C\* 48–55) on black. Every lamp was a stage light.
- **The lamp map** (`stream.ts` `repaintLamps`: 2 km round the walker at 2 m/px, repainted at most
  every 1.5 s for tiles, at once near its edge; one sprite stamped per lamp, added up). R holds the
  pools' light itself (`poolStamp`: the curve ÷ `headroom` 2, so overlapping pools add up to twice a
  heart before the 8 bits run out); the shaders read it straight back (`poolRead`). The curve is
  smooth enough to hold as light at 2 m texels (within 0.05 of a heart, 8-bit and bilinear,
  tested). G is the canyon field.
  - R has held, in turn: white gradients (r 13 m) added up then `pow 1.6` — a dim amber wash ~26 m
    across round every lamp (round 10's "amber-mud"); then a cone of distance the shaders shaped
    into the flat-topped heart above.
  - The old 13 m gradient still goes into G under the canyon field, unchanged — stamped from its
    own 13 px sprite exactly as before (the pool has a 23 px sprite of its own, R only; each adds
    only to its own channel): `canyonAt` reads it as sky lost, so by day the sky fill under every lamp is cut by up to
    45% (along a shop street with a post every 18 m, the whole street's shade). It's an accident of
    the two sharing the sprite, but the day look was judged with it: drawing the sprite's G as 0
    removes it and lifts a golden-hour shop street ~3.5 L\* (mean ΔE ~5). That's a look decision,
    left for one.
- **In the shaders** (`shared.ts`): `lampField` = the map's R × headroom × `streetLevel` (full to
  1.5 m over the local ground, nothing by 10.5 m: the pools light the street, not the roofs);
  `lampAt` = field × `uLampPower` × gain; `paintLight` adds `poolOn` (`nightLight.ts`, the TS twin
  for the tests): the surface's albedo with its own colour muted (`POOL.mute` 0.6: a tan sidewalk or
  a lawn doesn't flare orange or lime under the lamp), never under 0.3 (a pool is painted as light:
  dark asphalt would halve every heart), × `uPoolColor` × lampAt × (0.5 + 0.5 N.y) — the ground gets
  all of it, a wall or a passer-by half, what faces down none (the lamp is overhead). The term is
  skipped on a uniform branch by day. `U.uLampPool` = (height, reach, gain, headroom) — only gain and
  headroom are read; the shape is in the map.
  `U.uLampColor` (the old orange) is now only the sea foam's warm note.
- **The night's floor** (`FLOOR`, `nightFloor` in `paintLight`): the town's own glow at street level
  — sky glow, and the spill of windows and porches — a cool light (`FLOOR.color`, `strength` 0.16 in
  the scene's linear units; a high gibbous moon is ~0.08) on every surface, fading with height as the
  pools do, and drawing albedos together toward a middle grey (`even` 0.85: by night a white wall and
  a black road sit closer in value). Moonless, a street's asphalt reads L\* ~13, its sidewalk ~19, a
  lawn ~17, all hue 255–270° (the gap the review asks at L\* 10–20, hue 220–280°). It goes with
  `uNight` (0 from a sun 1° under the horizon up), so day and golden hour are untouched. `U.uNightFloor`
  = (colour, strength): set once, turn it in the page.
  - `atmosphere.ts` keeps the sky fill's blue night lift and the ground bounce without the sand's
    warmth; on their own they left a moonless street at L\* ~3 (round 11's frame 13: L\* 2.7).
- **The night grade** (`post.ts` composite → `nightGrade`, after the colour grade, on display
  colour): everything but the lights goes under one glaze (`NIGHT_GRADE.tint`, Payne's grey toward
  indigo) — its value kept, most of its own hue (`hue` 0.85) given up to the glaze, the darks a little
  deeper (`deep` at black) — so the floor's street, a lawn and a tan sidewalk all go the same blue,
  as the eye sees them by night. The glaze thins as the value rises (`fade` 0.8 over luma
  `fadeAt` 0.08–0.4): the last of a pool's glow goes a warm grey and then the night's blue, never a
  ring of pale blue round a warm heart. The lights (the brightest channel over `reserve` 0.15–0.6,
  red over blue by `warm`: a lamp's heart, a lit window) are reserved like paper, the reserve coming
  on over the pool's whole fall-off so its light hands over gradually. `postParams.nightWash` scales
  it (the default look's 0.5 is all of it).
  - Round 11 widened the reserve from 0.3–0.56 and dropped `dim` (everything warm under the glaze
    went up to half as dark again): together they turned a pool's own fall-off into a rim. The grade
    before that was a 50% multiply by (0.55, 0.62, 1.0), which left a dim amber street amber.
- **Wires** at night take the sky's zenith × 0.6: darker than any sky behind them (`props.ts`
  `wireMaterial`, 73e83ec).
- **Cost**: per pixel the pool is one texture read and a multiply (it was a sqrt, a pow and an exp);
  the floor a uniform branch and a mix; the grade swapped `dim` for `fade`. The repaint stamps two
  sprites per lamp (13 px and 23 px) instead of one (every 1.5 s at most, on the CPU canvas).
- **The check**: `tools/night-check.js` (debugging.md) measures the review's frames 3 and 13 against
  round 11's numbers — the band, the hearts, the gap, a pool's fall-off along the road, pools down the
  street, the wires and the lens — with the moon up or down.

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
  - The lawn things (birdbath, kayak, a house's bike, hoop, lawn and sale signs, surfboard) stand only
    on open ground — a lawn or a yard's gravel — never on what the paint lays paved (`paved` in
    `micro.ts`, from `groundCover.ts`: each street with its sidewalk band, mapped walks and paths,
    the tile's front walks and drives (`MicroInput.walks`), lots, plazas and piers, a dense block's
    paving (`pavedAprons`) and a shop's frontage). The carts out on collection day stand 40 cm back
    from the box's kerb line. `micro.test.ts` checks it on the shore pack against the painter's own
    strokes (Sea Bright's middle, two tiles).
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

## Near trees: limbs and leaf cards (`world/nearTrees.ts`, `render/leafCards.ts`)

Round 11's must-fix 4 ("trees at 5–10 m, ninth round: change the approach"). Within the hand-over
distance a tree is drawn from its **near model** (`assets/flora.ts` `nearTreeGeometry`, grown from
the far recipe's own plan: docs/ASSET_FOUNDRY.md): a trunk that flares and tapers, scaffold limbs
and a second order of branches reaching into the crown, and the crown 8–20 leaf-cluster cards with
the sky between the leaves. Past it, the tiles' own solid crowns, as before.

- **The layer** (main thread; stream `onTile`/`onUnload` → `add`/`remove`, `update` each frame):
  `add` finds a tile's `trees:<kind>:<v>` meshes (kinds in `NEAR_KINDS`), gives each a per-instance
  `aNear` and its material the `TREE_LOD 1` define. Every `step` m moved (and twice a second) it
  re-sorts the mounted trees within reach, nearest first under the tier's cap (`pickNear`), marks
  the taken ones' `aNear`, and fills the draws: **one instanced draw per model in use** for the
  limbs (`propMaterial({ treeLod: 'near' })`, the far instance's own matrix) and **one instanced
  draw for every card of every near tree** (`leafCards.ts`). Nothing per tree. A tree it hasn't
  taken (over the cap, a tile it was never told of, a palm) draws whole from its far mesh. The
  near wood is the props' material (`treeLod: 'near'`: the far trunk's own sway and paint) with bark
  furrows running up it in its own frame.
- **The hand-over** (`propMaterial` `TREE_LOD_U` = hand-over distance, band, mode): both models
  compute the far share from the tree foot's distance to the eye (`farShare`: 0 inside, 1 past the
  band) and split the pixels on one ordered dither (`dither4`) — the far crown where the dither is
  under its share, the near model the rest. A marked tree inside the hand-over folds its far
  instance to a point in the vertex shader (no fragments at all). When more trees are within reach
  than the cap allows, the hand-over comes in so the first tree left out stays past the band and a
  step's walk (a tree joins and leaves inside the band; it never pops in close). Mode 1 draws far
  crowns only, mode 2 near models only (`__GAME__.nearTrees.mode`, a comparison); `?neartrees=0`
  turns the layer off.
- **The cards**: a quad square to the eye through each cluster's middle (corners in `aCorner`; the
  position attribute folds to a point far underground, so an override pass — the id pass, the shadow
  pass — draws nothing of it), turned a little and every other one mirrored, swaying with the far
  crown's own wind and rocking in it. The picture is cut out leaf by leaf (alpha test, eased as the
  mips shrink it). Each card stands at the front of its cluster (pushed toward the eye by 45% of
  its half-width, drawn as large as from the cluster's middle), so the limbs inside a cluster go
  behind its leaves. Lit as the far crown is: each pixel takes the normal of the crown's ball
  (its middle and radius, the same ×1.4 flattening) where its sight line meets the ball's front —
  what the far crown shows there; the card's own place inside the crown would turn every leaf
  toward the eye and darken the crown a shade at the hand-over — with 25% of the cluster's own
  roundness, the far crown's underside AO and the heart's cards darker, the instance green × each
  leaf's shade, pigment, snow, the autumn turn by the species' fall hue, leaf fall leaf by leaf,
  the cherry's blossom. The shadow map holds the far crown's solid ball (the shadow pass's override
  draws every far instance whole, so the near tree's shadow is the far one's): a card looks it up
  from that ball's surface stepped toward the sun, as the far crown does, so only buildings and
  other trees shade it. The near wood casts nothing of its own for the same reason.
- **Budgets** (`render/quality.ts` `TREE_TIERS`, tested in `tests/foundry.test.ts` and
  `tests/nearTrees.test.ts`): ≤ 2,500 vertices a near tree; desktop 160 trees to 30 m (band 6),
  phone 40 to 24 m (band 5), low 20 to 16 m (band 4, 128 px pictures); leaf atlas 1024 × 512 RGBA
  (2.7 MB with mips; 0.7 MB on low). Draws: the models in use (a street's 2–6) + 1.
- **The check**: `tools/tree-check.js` (in-page, `?capture=1`: `await __TREECHECK__('tag')`) shoots
  review frame 15's tree at 5, 8, 10 and 11 m, the hand-over at 30 m (near only, far only, both)
  and 40 m, and a mask pass per close frame (that tree alone, leaves green, wood red, sky blue;
  `nearTrees.mask`); `python3 tools/tree-metrics.py shots/treecheck-<tag>-*-mask.png` measures sky
  through the crown, the longest straight edge of its outline, the limbs entering it and the
  trunk's taper. The workbench's "trees up close" family (`/kit.html`) runs the same layer on every
  species, orbit in and out across the hand-over.

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

### The ground you walk on (`groundCover.ts` + the fine window)

The street's cross-section and the lot's ground, in `src/world/groundCover.ts` (pure; the painter and
the micro layer share it): the sidewalk band (`sidewalkBand`: 1.5 m, 3.5 m on a main road), the
kerb (`KERB`: a 15 cm face, a 0.6 m gutter pan), the flags (`FLAG` 1.5 m, a centre joint on walks
`CENTRE_JOINT` 3 m or wider), the yard (`YARD` 5 m, `yardOf`), sand drift's reach (`DRIFT_REACH`
60 m), and the census of paved blocks (`pavedAprons`, the painter's sums).

- **Yards** (level ≥ 1, under everything): each house or shed stands in a yard out to 5 m: a mown
  lawn, white gravel or crushed shell, by its neighbourhood (`hood.ts`, measured per 256 m cell as
  windows reach it) and the coast (`Terrain.oceanDistAt` < 500 m): an old grid by the sea is about
  60% stone, a suburb a third, a tract or an estate nearly all lawn, a dry climate's mostly gravel. A
  house weighs 0.45 in the paving census on the bake too, so a street of houses keeps its yards and
  never takes the walk's concrete; the bake's shops stand on a paved frontage (`front`).
- **Level 2 only** (300 m, ~15 cm/px), in this order: front walks scored every 1.2 m, drives in
  blacktop, concrete or gravel (`DRIVE`, a hash of the house end); the sidewalk band in flags, each a
  shade darker or lighter (a hash of its middle) between joints, counted from the way's start
  (`flagRun`), and the mapped sidewalks and footways the same at their own width (`mappedFlags`,
  drawn when the pavement loop leaves the paths, before the streets cover their ends); the kerb's
  face (a 15 cm shadow line 25% darker than the walk); the gutter pans — every kerbed street's
  carriageway is laid in gutter concrete first and its asphalt then 0.6 m narrower, so at a junction
  each street's asphalt covers the others' pans and the pans turn the corners; the drives' aprons
  across the walk (kerb to back, flared 0.6 m at the kerb, drawn over the kerb's face: the kerb cut);
  traffic's marks (`traffic`, below); tar snakes and sealed patches on every street, the bake's too
  (`wear`); sand drift along the kerbs and walks within 60 m of a mapped beach (`drift`, its edges
  binned in 32 m cells).
- **The street as traffic wears it** (`traffic`, review round 12 must-fix 2: past the aggregate, a
  street's texture is its structure). The carriageway's lanes come from `laneLayout` (groundCover.ts,
  pure): inside the gutter pans, the map's parking lanes (`pk`: 2.2 m parallel, 4.8 m angled) — or,
  with none mapped, both kerbs parked on a North American street 9.5 m wide or more, as realTile's
  streets are — and travel lanes of ~3.3 m between (at least one, two on a two-way street 5 m wide).
  - Each travel lane's two **wheel paths** (`wheelPaths`: the lane's middle ± half a 1.7 m track,
    0.62 m wide) are erased to `WORN_ALPHA` (0.84) in the alpha: the shader lays them 12% darker and
    quiets their aggregate (below) — a shade darker and smoother.
  - The **oil**: smears 0.9–2.3 m long down each lane's middle (about half its 1.6 m stations), drips
    thick within 20 m of either end of a way (where the traffic waits at a junction), a stain in about
    half a parking lane's spaces (every 6.3 m, 3 m for angled bays) and two in three of a lot's stalls
    (`lotLayout`'s stalls, 0.9 m toward the nose: under the engine). One fill, `OIL`.
  - The **covers** (`COVERS`): a cast-iron manhole (0.66 m) in every junction (all its arms, as the
    crosswalks judge them) a little way into its first arm, and on the centre line evenly between a
    way's ends, no more than 95 m apart; valve covers (0.24 m) a few metres into about half a
    junction's arms, off the centre line, and every ~70 m along a way toward a kerb. One fill, `IRON`.
  - All from each way's own geometry, counted from its start or found at its nodes, so a slice lays
    exactly the window's marks; three draws a slice however many streets.
- **Loose stone** is marked in the fine window's alpha: a gravel or shell yard and a gravel drive
  are stroked again with `destination-out` at 1 − `STONE_ALPHA` (0.6); a lane's wheel paths the same
  at `WORN_ALPHA` (0.84). Everything opaque laid over them puts the alpha back (a translucent patch or
  drip mostly keeps it). The ground shader reads both (below); nothing else reads the detail canvas's
  alpha (the grass mask's "painted" test is `a ≥ 50`).
- Cost: everything is batched a style a path (a few dozen draws a slice); the bake's yards are
  binned in 64 m cells, so a slice looks at its own. `tests/groundPaint.test.ts` checks the flags'
  spacing from the way's start, the kerb/gutter/asphalt widths, the aprons' extent, the yards (no
  block paving on a street of houses), drift only near a beach, the lanes, wheel paths, oil and covers,
  determinism and that a slice draws exactly the window's strokes that reach it; and meters a flight:
  a frame's draws (≤ 80; 67 with traffic's marks, 63 before) and raster (≤ 0.6 of a window a frame,
  0.586; ≤ 0.25 on average, 0.221).

### The ground shader's grain (`ground.ts`)

Near the walker the paint's material gets the texture you'd see standing on it, inferred from the
paint (its chroma and value) and the stone alpha. The structure is the paint's (flags and joints,
the kerb's face, the gutter pan, aprons, tar snakes and sealed patches: groundCover.ts and the fine
window); the shader lays the surface between it:

- **Stones** (`stones`, paved ground): one round stone in each cell of a jittered grid. It keeps
  inside its cell, so no neighbour is looked at, and its size and shade are the cell's own. The
  octaves run a doubling apart from 3 cm to 1.9 m, and each is kept only while its cells are 3–16 px
  on screen. So the nearer ground shows the smaller stones and the further the bigger, two or three
  octaves at a time (the loop skips the rest), and the aggregate is the same size on screen at every
  distance. Finer, the brush wipes it and it shimmers; coarser, a stone is a blot. The band is sized
  to the frame as the brush is: 540 px tall is its own size, and a taller frame (a phone at 1266)
  widens it in step (`uViewport`).
  - Concrete: about half its stones lighter than the slab (+40%), most of the rest darker but faint
    (−7%).
  - Asphalt (`lumS` under ~0.2): pale stone in a dark binder (+70%), nothing darker. There's no
    speckle field.
  - The open ground (`grit`): a lighter fleck where an octave's noise peaks and a darker one where
    it dips, on the same octaves, fainter (+18%, −5%), under the lawn's mown stipple.
  - The broad mottle is the land's own wash (`wash`, ±8% at 1.1 m), everywhere.
- **Why darks stay faint:** post.ts pools pigment on the darker side of any edge (`uEdgeDark`). A
  pixel 2–3 L* under its 2.4 px blur is deepened by several L* more, and a pale fleck's rim gets the
  same. Round 11's symmetric four-octave grain (±25% albedo, up to 90 cm, plus soft stains) came out
  as dark specks: 10–13% of the bottom 40% ≥ 6 L* under its local mean, in 0.7–1.1 blobs per 1,000
  px. That's grime, and it read as gravel on pale asphalt.
- **Loose stone** (a gravel or shell yard, a gravel drive): pebbles of 3.5 cm close up and 9 cm
  clumps further, the gaps between them a shade, not a hole; a shell yard's blue-grey bits.
- **A beach** (warm, light sand by the sea: `sandy`) is all shadow, never a lighter patch:
  - the swells' far sides in a faint shadow, and the land's wash on sand only darkening (capped at
    0.96);
  - trampled sand with only its darker half, pocks (−9%) and footprints (−30%);
  - 11 cm ripples across the wind in the dry band: a lee 11% darker and a crest 2.5% lighter, long
    crests that bend gently, end now and then (a per-crest break) and are broken where a foot came
    down. They're gone by 15 m, and where the crests come under ~4 px.
  - The wrack line's dark clumps with pale shell through them.
- **Light, and the bloom.** The grain multiplies the albedo (`gm`). Once lit, the ground takes `gp`
  again in proportion to how bright it's lit (`col *= 1 + (gp − 1)·1.15·…`): the tonemap's shoulder
  otherwise takes a sunlit walk's grain. `gp` is the darks and the small lights only.
  - A broad lighter patch taken again tips sunlit sand over the day bloom's knee. post.ts adds
    `max(blurHdr·exposure − 1.3, 0)` per channel, so red crosses it first, and its steep sRGB
    encode turns a few % of excess into a peach disc.
  - That was round 11's "peach discs": on the beach, 1.6–3.6 L\* *lighter* than the sand round
    them, with a\* +4 and the hue 10° redder. Round 10 had faint ones from the wash alone.
  - Sunlit sand at noon sits just under the knee (its red ~1.25 at p95 against 1.3), so on sand
    nothing brightens over ~0.5 m.
- Every octave is kept only where it spans a few pixels (`octv`, `grit`: `fwidth` of the ground
  position, the steeper axis), so it fades into the wash with distance and height and never shimmers.
- Measure it as the reviewer does (`docs/earth/REVIEWER.md` round 11, must-fix 2), on the montage
  cut (800 px a review frame, 560 a merged one):
  - the bottom 40%'s median local L\* std, in windows 1.5% of the frame wide;
  - the share ≥ 6 L\* under the local mean (6% wide), and those blobs ≥ (0.6% W)² per 1,000 px;
  - on the beach, blotches ≥ (2% W)² with a\* ≥ the sand's + 3;
  - on review frames 2, 10, 11, 16, 17, the merged sheet's 4, 6 and 7, and the phone.
  - Structure counts too: the asphalt beside a bright walk and the pooled joints are "dark" by that
    test. Frame 2 holds ~5% of it with no grain at all, and 17's red car ~15%.

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
