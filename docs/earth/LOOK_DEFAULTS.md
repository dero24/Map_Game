# Look defaults — record

## The shipped default: 'watercolor HD' (2026-09-27)

This look was chosen side by side on Tucson's 4th Avenue — the morning street, golden hour and
the mountain horizon — against every preset (`shots/looks-tucson.jpg`). It keeps the watercolor
wash but adds three things:

- **A finer brush** — paint detail 0.82, Kuwahara radius 4, sharpness 10.5.
- **A sharper frame** — less paper (0.52) and less wobble (0.42), so wires and signs read.
- **A light grade** — teal in the shade and warm in the light, with grade 0.2, vibrance 0.2 and
  saturation 1.16.

| Knob | watercolor HD | classic (Sep 27 default) |
|---|---|---|
| kuwaharaRadius | 4 | 5 |
| kuwaharaSharpness | 10.5 | 8 |
| exposure | 0.92 | 0.9 |
| saturation | 1.16 | 1.12 |
| wobble | 0.42 | 0.55 |
| edgeDarkening | 0.85 | 0.9 |
| pigmentTurbulence | 0.2 | 0.22 |
| granulation | 0.25 | 0.3 |
| paperTexture | 0.52 | 0.7 |
| ink | 0.52 | 0.55 |
| glow | 0.92 | 0.8 |
| vignette | 0.45 | 0.55 |
| nightWash | 0.5 | 0.55 |
| paintDetail | 0.82 | 0.6 |
| hiDpi (full screen resolution) | on | on |
| grade / vibrance | 0.2 / 0.2 | 0 / 0 |
| gradeShadow / gradeLight | #3f6f8a / #ffcf9a | (#2f6f8f / #ffb27a, unused at grade 0) |

## Getting the old default back

The default as it stood before the comparison is kept verbatim as the Look preset
**'classic (Sep 27 default)'**: press backquote, open Look, then choose the preset.

The look from before the paint-detail knob existed (paintDetail 0.5, hiDpi off) is the preset
**'classic half-res'**.

## How the default gets changed

- Anything you change in the Look panel is saved and wins over the default. The panel stores
  only the knobs you touched, so a new default still reaches every knob you left alone.
- Tell Claude which settings to lock, and they become the shipped default.
- Compare looks on any place with `__PLACE__(tag, { looks: [...], frames: [0, 2, 7] })`, which
  writes `shots/looks-<tag>.jpg`.
- On a slow GPU (over 25 ms a frame, ten seconds into a walk), auto quality steps paint detail and
  full resolution down once. It never overrides a knob you set.
