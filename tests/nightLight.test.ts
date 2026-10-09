import { describe, it, expect } from 'vitest';
import { POOL, poolLight, poolStamp, poolRead, poolStops, poolOn, FLOOR, floorLight, FIGURE, figureAlbedo, figureFloor, NIGHT_GRADE, nightGrade, reserved, tonemap, toSrgb, smoothstep } from '../src/render/nightLight';
import { SHIRTS, TROUSERS, SKIN_TONES } from '../src/assets/people';
import { critterGeometry, critterMaterial, type CritterKind } from '../src/assets/fauna';
import { creatureMaterial } from '../src/render/creature';
import { postParams } from '../src/render/post';
import { lab, lch, lstar, poolFalloff, nightGapPasses } from '../tools/night-core.js';

// Night as a painter lays it (src/render/nightLight.ts): the street lamps' pools — a pale warm glow
// under each lamp that dies away, the night's floor between them, never black — and the post's night
// grade. The shaders run the GLSL twins of these with the same numbers (shared.ts lampField and
// paintLight, post.ts nightGrade).

type RGB = [number, number, number];
const to8 = (c: number[]) => c.map((v) => Math.round(Math.min(1, Math.max(0, v)) * 255)) as RGB;
const labOf = (c: number[]) => { const [L, a, b] = lab(...to8(c)); return { L, a, b, ...lch(a, b) }; };
const lin = (v: number) => (v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4));
const Y = (c: number[]) => { const l = to8(c).map((v) => lin(v / 255)); return 0.2126 * l[0] + 0.7152 * l[1] + 0.0722 * l[2]; };

describe('a lamp pool', () => {
  it("is a lamp's own light: h³/(h² + d²)^1.5 at 8 m — half at 6 m, 17% at 12 m", () => {
    expect(poolLight(0)).toBeCloseTo(1, 6);
    expect(poolLight(6.1)).toBeCloseTo(0.5, 2);
    expect(poolLight(12)).toBeCloseTo(0.171, 3); // (the lamp's own curve holds to `ease`)
    expect(poolLight(16)).toBeGreaterThan(0.05); expect(poolLight(16)).toBeLessThan(0.09); // (9% unbent; eased a little)
    expect(poolLight(POOL.reach)).toBe(0);
    expect(poolLight(POOL.reach + 3)).toBe(0);
  });
  it('dies away: never flat, never a cliff', () => {
    let worst = 0;
    for (let d = 0; d < POOL.reach; d += 0.25) {
      expect(poolLight(d + 0.25)).toBeLessThanOrEqual(poolLight(d));
      worst = Math.max(worst, (poolLight(d) - poolLight(d + 0.25)) / 0.25);
    }
    expect(worst).toBeLessThan(0.11); // (at most 11% of the heart per metre, at its steepest)
    // round 11's pool: exp(−(d/5.2)³), cut to nothing by 9 m — 27% of its heart in its last two metres
    const old = (d: number) => Math.exp(-Math.pow(d / 5.2, 3)) * (1 - smoothstep(7.2, 9, d));
    expect(old(4) / old(0)).toBeGreaterThan(0.6); expect(old(8) / old(0)).toBeLessThan(0.05);
    expect(poolLight(4)).toBeGreaterThan(0.7); expect(poolLight(8)).toBeGreaterThan(0.3);
  });
  it('the map holds it as light, with headroom, and gives it back', () => {
    for (const d of [0, 3, 6, 12, 18]) expect(poolRead(poolStamp(d))).toBeCloseTo(poolLight(d), 9);
    expect(poolStamp(0)).toBeCloseTo(1 / POOL.headroom, 9);
    expect(poolRead(1.4)).toBe(POOL.headroom); // (the 8-bit map's end)
    // the sprite's stops: linear between them, within a hundredth of a heart of the curve
    const stops = poolStops();
    let worst = 0;
    for (let d = 0; d <= POOL.reach; d += 0.1) {
      const t = d / POOL.reach, i = Math.min(stops.length - 2, Math.floor(t * (stops.length - 1))), [t0, v0] = stops[i], [t1, v1] = stops[i + 1];
      worst = Math.max(worst, Math.abs(poolRead(v0 + ((v1 - v0) * (t - t0)) / (t1 - t0)) - poolLight(d)));
    }
    expect(worst).toBeLessThan(0.012);
  });
  // the street between two posts S m apart: their stamps added up in the map, as the shaders read it
  const along = (S: number) => (x: number) => poolRead(poolStamp(Math.abs(x)) + poolStamp(Math.abs(S - x)));
  it('pools meet faintly between lamps; a shop street (18 m) is lit end to end', () => {
    const shore = along(38); // (lamps on every pole of a shore street)
    expect(shore(19) / shore(0)).toBeGreaterThan(0.02); expect(shore(19) / shore(0)).toBeLessThan(0.1);
    const shop = along(18);
    expect(shop(9) / shop(0)).toBeGreaterThan(0.5);
    // a residential street (a lamp every third pole, 114 m) has the night's floor between its pools
    expect(along(114)(57)).toBe(0);
    // two lamps on one spot: twice the light, as the map's headroom allows
    expect(along(0)(0)).toBeCloseTo(2, 2);
  });
  it('the light survives the map’s 2 m texels and 8 bits', () => {
    // a 2 m grid of stamps (added up, quantised to 8 bits), sampled bilinearly as the GPU does
    const lamps = [[3.3, 4.1], [21.7, 3.6], [12.2, 20.4], [40.5, 30.2]];
    const cell = 2, n = 30, grid = (i: number, j: number) => Math.round(Math.min(1, lamps.reduce((s, [x, z]) => s + poolStamp(Math.hypot((i + 0.5) * cell - x, (j + 0.5) * cell - z)), 0)) * 255) / 255;
    const sample = (x: number, z: number) => {
      const u = x / cell - 0.5, v = z / cell - 0.5, i = Math.floor(u), j = Math.floor(v), fu = u - i, fv = v - j;
      return grid(i, j) * (1 - fu) * (1 - fv) + grid(i + 1, j) * fu * (1 - fv) + grid(i, j + 1) * (1 - fu) * fv + grid(i + 1, j + 1) * fu * fv;
    };
    let worst = 0;
    for (let x = 1; x < n * cell - 3; x += 0.37) for (let z = 1; z < n * cell - 3; z += 0.41) {
      const truth = lamps.reduce((s, [lx, lz]) => s + poolLight(Math.hypot(x - lx, z - lz)), 0);
      worst = Math.max(worst, Math.abs(poolRead(sample(x, z)) - truth));
    }
    expect(worst).toBeLessThan(0.05);
  });
});

describe('the night grade', () => {
  const night = (c: RGB) => nightGrade(c, 1, 0.5);
  const luma = (c: number[]) => c[0] * 0.299 + c[1] * 0.587 + c[2] * 0.114;
  it('by day it does nothing', () => {
    for (const c of [[0.3, 0.5, 0.7], [0.9, 0.6, 0.3], [0.05, 0.05, 0.05]] as RGB[]) expect(nightGrade(c, 0, 0.5)).toEqual(c);
  });
  it('the dark street, a lawn and a tan sidewalk read a deep, cool blue', () => {
    for (const c of [[0.06, 0.07, 0.1], [0.07, 0.11, 0.06], [0.16, 0.14, 0.12], [0.14, 0.11, 0.08]] as RGB[]) {
      const o = labOf(night(c));
      expect(o.h).toBeGreaterThan(220); expect(o.h).toBeLessThan(290);
    }
  });
  it("the lights keep their warmth: a lamp's heart, a lit window", () => {
    for (const c of [[0.95, 0.86, 0.7], [1.0, 0.86, 0.56], [0.86, 0.6, 0.3]] as RGB[]) {
      expect(reserved(c)).toBeGreaterThan(0.9);
      const o = night(c);
      for (let i = 0; i < 3; i++) expect(Math.abs(o[i] - c[i])).toBeLessThan(0.03);
    }
  });
  it('the reserve comes on over 0.15–0.6 of the brightest channel: a pool hands over gradually', () => {
    const warm = (v: number) => [v, v * 0.9, v * 0.72] as RGB;
    expect(reserved(warm(0.14))).toBe(0);
    expect(reserved(warm(0.36))).toBeGreaterThan(0.1); expect(reserved(warm(0.36))).toBeLessThan(0.3);
    expect(reserved(warm(0.7))).toBeGreaterThan(0.95);
    let last = -1;
    for (let v = 0.1; v <= 0.7; v += 0.02) { const r = reserved(warm(v)); expect(r).toBeGreaterThanOrEqual(last); last = r; }
  });
  it('nothing warm goes darker than its value (the dim that rimmed every pool is gone)', () => {
    for (const c of [[0.14, 0.11, 0.08], [0.3, 0.24, 0.17], [0.45, 0.38, 0.28]] as RGB[]) {
      const L = luma(c), deep = 1 - NIGHT_GRADE.deep * (1 - smoothstep(0, 0.45, L)), res = reserved(c);
      expect(luma(night(c))).toBeCloseTo(L * (deep + (1 - deep) * res), 5);
    }
  });
  it('the glaze thins as the value rises: the mid-values go grey-blue, not pale blue', () => {
    const grey = (v: number) => [v, v, v] as RGB;
    const C = (v: number, P = NIGHT_GRADE) => labOf(nightGrade(grey(v), 1, 0.5, P)).C;
    expect(C(0.5)).toBeLessThan(12); expect(C(0.5)).toBeLessThan(C(0.12) * 1.3);
    expect(C(0.5, { ...NIGHT_GRADE, fade: 0 })).toBeGreaterThan(25); // (an even glaze: pale blue)
  });
  it('darker stays darker (the wires against the sky, a pool against its gap)', () => {
    let last = -1;
    for (let v = 0; v <= 0.6; v += 0.02) {
      const o = night([v * 0.8, v * 0.85, v]);
      expect(luma(o)).toBeGreaterThan(last);
      last = luma(o);
    }
    // …and a pool's warm light, from its dying edge to its heart
    last = -1;
    for (let v = 0; v <= 1; v += 0.02) { const o = night([v, v * 0.9, v * 0.72]); expect(luma(o)).toBeGreaterThan(last); last = luma(o); }
  });
  it('the darks go deeper; the look’s night wash scales it', () => {
    const c = [0.05, 0.06, 0.09] as RGB;
    expect(luma(night(c))).toBeLessThan(luma(c) * (1 - NIGHT_GRADE.deep * 0.8));
    const half = nightGrade(c, 1, 0.25), full = night(c);
    for (let i = 0; i < 3; i++) expect(half[i]).toBeCloseTo((c[i] + full[i]) / 2, 6);
    expect(nightGrade(c, 1, 0)).toEqual(c);
  });
});

describe('the street at night, end to end (scene light → the default look → display)', () => {
  // the post's tail on one flat pixel (post.ts composite): the filmic curve, display encoding, the
  // look's saturation, vibrance and colour grade, the night grade, the paper (the brush, the grain and
  // the ink leave a flat wash's colour alone)
  const P = postParams;
  const s2lHex = (h: string) => [1, 3, 5].map((i) => lin(parseInt(h.slice(i, i + 2), 16) / 255)) as RGB; // (THREE.Color.set: linear)
  const paper = [1, 3, 5].map((i) => parseInt(P.paperColor.slice(i, i + 2), 16) / 255);
  const show = (x: number[]): RGB => {
    let c = x.map((v) => toSrgb(tonemap(v, P.exposure)));
    const lum = luma(c);
    c = c.map((v) => lum + (v - lum) * P.saturation);
    const chroma = Math.max(...c) - Math.min(...c);
    c = c.map((v) => lum + (v - lum) * (1 + P.vibrance * (1 - smoothstep(0, 0.5, chroma))));
    const gs = s2lHex(P.gradeShadow), gl = s2lHex(P.gradeLight), t = smoothstep(0.15, 0.75, lum);
    const tone = gs.map((v, i) => v + (gl[i] - v) * t), tl = Math.max(luma(tone), 1e-3);
    c = c.map((v, i) => Math.min(1, Math.max(0, v + ((v * tone[i]) / tl - v) * P.grade * 0.5)));
    c = nightGrade(c as RGB, 1, P.nightWash);
    return c.map((v, i) => Math.min(1, v * paper[i] * (1 - P.paperTexture * 0.5 * 0.1))) as RGB;
  };
  const luma = (c: number[]) => c[0] * 0.299 + c[1] * 0.587 + c[2] * 0.114;
  // the ground (groundPaint.ts, linear): a street's asphalt, a sidewalk, a lawn
  const ASPHALT = [0.117, 0.122, 0.13] as RGB, WALK = [0.48, 0.45, 0.37] as RGB, LAWN = [0.29, 0.4, 0.13] as RGB;
  const sky = [0.0145, 0.0212, 0.0543] as RGB; // the sky's fill on a moonless night (atmosphere.ts)
  const moon = [0.275 * 0.21, 0.381 * 0.21, 0.716 * 0.21] as RGB; // a gibbous moon, high
  const lit = (alb: RGB, d: number, m = 0, up = 1) => alb.map((a, i) => a * (sky[i] + moon[i] * m) + floorLight(alb)[i] + poolOn(alb, poolLight(d), up)[i]) as RGB;
  const gapOf = (alb: RGB, m = 0) => show(lit(alb, 60, m));

  it("the heart is a warm cream (C* ≤ 30), lit but not washed out", () => {
    for (const alb of [ASPHALT, WALK, LAWN]) {
      const h = labOf(show(lit(alb, 0)));
      expect(h.C).toBeLessThan(26); expect(h.C).toBeGreaterThan(12); // (cream, not white, not orange)
      expect(h.h).toBeGreaterThan(65); expect(h.h).toBeLessThan(100); // (a lawn's a little yellow)
      // (lit, a midtone that keeps what's under it: at L* 72–85 the cars and the street under a lamp went one
      // pale beige — Robby, 2026-10-04: "makes cars and everything glow way too light where it washes it all out")
      const [lo, hi] = alb === ASPHALT ? [55, 70] : [60, 82]; // (a pale sidewalk is paler under the same lamp)
      expect(h.L).toBeGreaterThan(lo); expect(h.L).toBeLessThan(hi);
    }
    // the sidewalk you stand on doesn't flare orange: its tan is muted under the lamp
    expect(labOf(show(lit(WALK, 0))).C).toBeLessThan(21);
  });
  it('a passer-by in the heart is lit, not blown out: a wall gets half the light the street does', () => {
    const coat = [0.45, 0.4, 0.35] as RGB;
    expect(labOf(show(lit(coat, 0, 0, 0))).L).toBeLessThan(labOf(show(lit(coat, 0))).L - 8);
    expect(poolOn(coat, 1, -1)).toEqual([0, 0, 0]); // (what faces down: the lamp is overhead)
  });

  // A walker by night (creature.ts people: shared.ts paintLight under FIGURE_NIGHT): their side (up 0)
  // lit by the sky's fill (the whole sky's here, a little over a side's: by night atmosphere.ts's ground
  // bounce is most of the sky's), the moon and the floor on the figure's evened colours, a lamp's pool
  // on their own. Every colour a walker wears: the shirts, the trousers, the skin tones (people.ts).
  const hexLin = (h: number) => [(h >> 16) & 255, (h >> 8) & 255, h & 255].map((v) => lin(v / 255)) as RGB;
  const WEAR = [...SHIRTS, ...TROUSERS, ...SKIN_TONES].map(hexLin);
  const walker = (alb: RGB, d = 60, m = 0, night = 1) => {
    const a = figureAlbedo(alb, night);
    return a.map((v, i) => v * (sky[i] * (1 - FIGURE.fill * night) + moon[i] * m) + figureFloor(a, night)[i] + poolOn(alb, poolLight(d), 0)[i]) as RGB;
  };
  const Ls = (f: (alb: RGB) => RGB) => WEAR.map((alb) => labOf(show(f(alb))).L);
  const mean = (xs: number[]) => xs.reduce((s, x) => s + x, 0) / xs.length;
  it('a walker between the pools is as dark as the street: a pale shirt about the asphalt, a dark coat darker, never black', () => {
    const street = labOf(gapOf(ASPHALT)).L, lawn = labOf(gapOf(LAWN)).L, walk = labOf(gapOf(WALK)).L;
    const now = Ls((alb) => walker(alb));
    expect(mean(now)).toBeLessThan(street); // (on the whole, darker than the darkest ground they walk on)
    expect(Math.max(...now)).toBeLessThan(street + 2.5); // (the palest shirt about the asphalt)
    expect(Math.max(...now)).toBeLessThan(Math.min(lawn, walk)); // (and under a lawn's or a sidewalk's)
    expect(Math.min(...now)).toBeGreaterThan(5); // (a silhouette with its form, not a hole in the night)
    expect(Math.max(...now) - Math.min(...now)).toBeGreaterThan(6); // (a white shirt still reads from a navy one)
    // before (2026-10-07): lit like the street — the floor's evening toward its middle grey and the sky's
    // whole fill — the palest twice the asphalt's L*, the mean over it
    const before = Ls((alb) => alb.map((a, i) => a * sky[i] + floorLight(alb)[i]) as RGB);
    expect(Math.max(...before)).toBeGreaterThan(street * 1.9);
    expect(mean(before)).toBeGreaterThan(street);
  });
  it('under a high moon a walker has a lit side, no lighter than the moonlit lawn', () => {
    const lawn = labOf(gapOf(LAWN, 1)).L;
    const lit = Ls((alb) => walker(alb, 60, 1)), dark = Ls((alb) => walker(alb));
    expect(Math.max(...lit)).toBeLessThan(lawn);
    lit.forEach((L, i) => expect(L).toBeGreaterThan(dark[i] + 3)); // (the moon's side reads: form)
  });
  it("in a lamp's heart a walker is lit, their own colours back", () => {
    for (const alb of WEAR) expect(labOf(show(walker(alb, 0))).L).toBeGreaterThan(labOf(show(walker(alb))).L + 12);
    // a pale shirt under the lamp is the same as before: the pool lights the walker's own colour
    const shirt = hexLin(0xf2efe6);
    expect(walker(shirt, 0)[0] - walker(shirt)[0]).toBeCloseTo(poolOn(shirt, 1, 0)[0], 9);
  });
  it("a gull on a lawn, a goose by the pond, a deer: their palest feather or coat by night about the street's, not twice it (Robby: \"Gulls on a lawn at night look pale\")", () => {
    const street = labOf(gapOf(ASPHALT)).L, lawn = labOf(gapOf(LAWN)).L;
    for (const kind of ['herringgull', 'laughinggull', 'canadagoose', 'greategret', 'deer', 'muleDeer'] as CritterKind[]) {
      const col = critterGeometry(kind).getAttribute('color');
      let palest: RGB = [0, 0, 0];
      for (let i = 0; i < col.count; i++) if (col.getX(i) + col.getY(i) + col.getZ(i) > palest[0] + palest[1] + palest[2] && Math.max(col.getX(i), col.getY(i), col.getZ(i)) < 0.98) palest = [col.getX(i), col.getY(i), col.getZ(i)];
      const now = labOf(show(walker(palest))).L, before = labOf(show(palest.map((a, i) => a * sky[i] + floorLight(palest)[i]) as RGB)).L;
      expect(now, kind).toBeLessThan(street + 2.5);
      expect(now, kind).toBeLessThan(lawn);
      if (palest[0] + palest[1] + palest[2] > 1.5) expect(before, kind).toBeGreaterThan(street * 1.5); // (the pale ones: as the walkers were)
    }
    // every animal out of doors takes the night as the walkers do; the residents indoors keep the room's light
    expect(critterMaterial('herringgull').defines.FIGURE_NIGHT).toBe(1);
    expect(creatureMaterial({ WINGS: 1 }).defines.FIGURE_NIGHT).toBe(1);
    expect(creatureMaterial({ LEGS: 1, PEOPLE: 1 }).defines.FIGURE_NIGHT).toBe(1);
    expect(creatureMaterial({ LEGS: 1, PEOPLE: 1, STATIC_PEOPLE: 1, INDOOR: 1 }).defines.FIGURE_NIGHT).toBeUndefined();
  });
  it('by day a walker is as they were', () => {
    for (const alb of WEAR) {
      expect(figureAlbedo(alb, 0)).toEqual(alb);
      expect(figureFloor(alb, 0)).toEqual([0, 0, 0]);
    }
  });
  it("the gap's ground: the night's floor, L* 10–20 and cool, never black", () => {
    for (const alb of [ASPHALT, WALK, LAWN]) {
      const g = labOf(gapOf(alb));
      expect(nightGapPasses({ n: 1, L: +g.L.toFixed(1), C: g.C, h: Math.round(g.h), L90: g.L }).pass).toBe(true);
    }
    // a gibbous moon high over the street lifts the asphalt a little, and keeps it in range
    const m = labOf(gapOf(ASPHALT, 1));
    expect(m.L).toBeGreaterThan(labOf(gapOf(ASPHALT)).L); expect(m.L).toBeLessThanOrEqual(20);
  });
  it('along the road the pool halves past 5 m, holds ≥ 8% at 12 m, and never rings', () => {
    for (const alb of [ASPHALT, WALK]) {
      const samples = Array.from({ length: 21 }, (_, d) => ({ d, Y: Y(show(lit(alb, d))) }));
      const r = poolFalloff(samples, Y(gapOf(alb)));
      expect(r.pass).toBe(true);
      expect(r.dHalf!).toBeGreaterThan(6); expect(r.at12!).toBeGreaterThan(0.12);
      expect(r.rise).toBe(0); // (darker all the way out: no rim)
      // and the hue hands over through a warm grey: no step of more than 10 in a*b* in a metre
      let last = labOf(show(lit(alb, 0)));
      for (let d = 0.5; d <= 24; d += 0.5) {
        const c = labOf(show(lit(alb, d)));
        expect(Math.hypot(c.a - last.a, c.b - last.b)).toBeLessThan(5);
        last = c;
      }
    }
  });
  it("heart to gap ≥ 2.5× down the street, with room to spare", () => {
    expect(Y(show(lit(ASPHALT, 0))) / Y(gapOf(ASPHALT))).toBeGreaterThan(12);
  });
  it("standing in a pool, the ground round you isn't an orange carpet (C* of the mean ≤ 22)", () => {
    // the ground under the bottom 40% of the frame: within ~2–14 m of a pool's heart, walk and road
    let a = 0, b = 0, n = 0;
    for (let d = 2; d <= 14; d += 1) for (const alb of [WALK, ASPHALT]) { const o = labOf(show(lit(alb, d))); a += o.a; b += o.b; n++; }
    expect(Math.hypot(a / n, b / n)).toBeLessThan(22);
  });
  it('round 11 before: an orange disc on black (the old pool, the old grade)', () => {
    // (kept as the record of what was measured: the heart at C* ~54, the gap at L* < 3)
    const oldLamp = [1.0, 0.479, 0.141];
    const oldGrade = { ...NIGHT_GRADE, reserve: [0.3, 0.56] as [number, number], fade: 0 };
    const old = (x: number[]) => nightGrade(x.map((v) => toSrgb(tonemap(v, P.exposure))) as RGB, 1, 0.5, oldGrade);
    expect(labOf(old(oldLamp.map((c, i) => 0.3 * c * 3 + ASPHALT[i] * sky[i]))).C).toBeGreaterThan(40);
    expect(lstar(Y(old(ASPHALT.map((a, i) => a * sky[i]))))).toBeLessThan(3);
  });
  it('by day the floor is nothing', () => {
    expect(floorLight(ASPHALT, 0)).toEqual([0, 0, 0]);
    expect(FLOOR.strength).toBeGreaterThan(0);
  });
  it('smoothstep is GLSL’s', () => {
    expect(smoothstep(0, 1, 0.5)).toBe(0.5);
    expect(smoothstep(0.2, 0.4, 0.1)).toBe(0);
    expect(smoothstep(0.2, 0.4, 0.5)).toBe(1);
  });
});
