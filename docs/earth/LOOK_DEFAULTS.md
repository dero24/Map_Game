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

## Cleaner looks to try (2026-09-29)

Robby liked the clean, vibrant feel of a bright day on the Hudson and asked for cleaner paint to try
beside watercolor HD, which stays the default. Four new Look presets use four new knobs:

- **crisp** ("clean edges"): lays the unbrushed frame back over the paint. 0 is all brush; 1 gives
  clean edges and flat colour.
- **softGlow** ("soft glow"): a mist over the lights, and the bright sky and sunlit faces bloom a
  little past their edges.
- **clarity**: lifts the paint's local contrast against its own small blur.
- **contrast**: a gentle S-curve on the whole frame.

| Preset | What it is |
|---|---|
| clean vibrant | Saturated colour and crisp forms, a soft glow, no paper edge (crisp 0.6, clarity 0.35, contrast 0.22, saturation 1.42, vibrance 0.55, paper 0.04, vignette 0) |
| clean HD | Watercolor HD with less paper and grain, plus a little of the clean frame (crisp 0.3, clarity 0.2, paper 0.25) |
| gouache | Opaque, flat, saturated shapes with soft edges (brush 5.5, sharpness 16, contrast 0.12) |
| dreamy pastel | A pastel bloom over clean colour (soft glow 0.5, exposure 1.05, a lilac and rose grade) |

Compared side by side at Kerry Park, 16:00 (`shots/looks-kerry3.jpg`).

**Paint as you walk, far away too.** This is a developer switch in Watercolor, "…far away too",
off by default. Every place you haven't been is a pencil underdrawing at any distance, as in the
first version, and walking paints it in. "paint reach as you walk (m)" sets how far round you
paints (45 m by default).

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
