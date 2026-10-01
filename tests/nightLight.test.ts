import { describe, it, expect } from 'vitest';
import { POOL, poolCone, poolDistance, poolLight, NIGHT_GRADE, nightGrade, reserved, tonemap, toSrgb, smoothstep } from '../src/render/nightLight';
import { lab, lch } from '../tools/night-core.js';

// Night as a painter lays it (src/render/nightLight.ts): the street lamps' pools — a bright heart,
// a quick soft edge, dark between them — and the post's night grade. The shaders run the GLSL twins
// of these with the same numbers (shared.ts lampField, post.ts nightGrade).

const to8 = (c: number[]) => c.map((v) => Math.round(Math.min(1, Math.max(0, v)) * 255)) as [number, number, number];
const labOf = (c: number[]) => { const [L, a, b] = lab(...to8(c)); return { L, ...lch(a, b) }; };

describe('a lamp pool', () => {
  it('reads its distance back from the cone it painted', () => {
    for (const d of [0, 1.5, 4, 7.3, 8.9]) expect(poolDistance(poolCone(d))).toBeCloseTo(d, 6);
    expect(poolCone(POOL.reach + 3)).toBe(0);
  });
  it('a bright heart, a quick soft edge, then dark', () => {
    expect(poolLight(0)).toBeCloseTo(1, 6);
    expect(poolLight(3)).toBeGreaterThan(0.8); // the heart is broad and even…
    expect(poolLight(POOL.radius)).toBeCloseTo(Math.exp(-1), 2); // …down to 1/e at its radius…
    expect(poolLight(7)).toBeLessThan(0.1); // …and gone a couple of metres past it
    expect(poolLight(8.5)).toBeLessThan(0.015);
    expect(poolLight(POOL.reach)).toBe(0);
    for (let d = 0; d < POOL.reach; d += 0.25) expect(poolLight(d + 0.25)).toBeLessThanOrEqual(poolLight(d));
  });
  it('lamps on a shop street (18 m apart) leave real dark between their pools', () => {
    // the street between two posts: their cones added up, as the map holds them
    const along = (S: number) => (x: number) => poolLight(poolDistance(Math.min(1, poolCone(Math.abs(x)) + poolCone(Math.abs(S - x)))));
    const at = along(18);
    expect(at(0) / at(9)).toBeGreaterThan(50);
    // posts closer than that share a brighter middle, still well under a heart
    expect(along(14)(7)).toBeLessThan(0.3);
    // the old pools (white sprite added up, pow 1.6): r 13 m, 1 → 0.5 at 4.55 m → 0
    const old = (d: number) => { const t = d / 13; const v = t > 1 ? 0 : t < 0.35 ? 1 - (t / 0.35) * 0.5 : 0.5 * (1 - (t - 0.35) / 0.65); return v; };
    const oldAt = (x: number) => Math.pow(Math.min(1, old(Math.abs(x)) + old(Math.abs(18 - x))), 1.6);
    expect(oldAt(0) / oldAt(9)).toBeLessThan(4); // (the wash: under 2 stops from heart to gap)
  });
  it('the distance survives the map’s 2 m texels', () => {
    // a 2 m grid of cones (added up, lamps 18 m or more apart), sampled bilinearly as the GPU does
    const lamps = [[3.3, 4.1], [21.7, 3.6], [12.2, 20.4]];
    const cell = 2, n = 20, grid = (i: number, j: number) => Math.min(1, lamps.reduce((s, [x, z]) => s + poolCone(Math.hypot((i + 0.5) * cell - x, (j + 0.5) * cell - z)), 0));
    const sample = (x: number, z: number) => {
      const u = x / cell - 0.5, v = z / cell - 0.5, i = Math.floor(u), j = Math.floor(v), fu = u - i, fv = v - j;
      return grid(i, j) * (1 - fu) * (1 - fv) + grid(i + 1, j) * fu * (1 - fv) + grid(i, j + 1) * (1 - fu) * fv + grid(i + 1, j + 1) * fu * fv;
    };
    let worst = 0;
    for (let x = 1; x < n * cell - 3; x += 0.37) for (let z = 1; z < n * cell - 3; z += 0.41) {
      const truth = poolLight(Math.min(...lamps.map(([lx, lz]) => Math.hypot(x - lx, z - lz))));
      worst = Math.max(worst, Math.abs(poolLight(poolDistance(sample(x, z))) - truth));
    }
    expect(worst).toBeLessThan(0.12);
  });
});

describe('the night grade', () => {
  const night = (c: [number, number, number]) => nightGrade(c, 1, 0.5);
  it('by day it does nothing', () => {
    for (const c of [[0.3, 0.5, 0.7], [0.9, 0.6, 0.3], [0.05, 0.05, 0.05]] as [number, number, number][]) expect(nightGrade(c, 0, 0.5)).toEqual(c);
  });
  it("round 10's amber-mud goes under the indigo: cool, and no lighter", () => {
    const mud = [0.36, 0.26, 0.18] as [number, number, number]; // L* 26–28, hue ~50°, C* ~15 (display)
    const before = labOf(mud), after = labOf(night(mud));
    expect(before.h).toBeLessThan(70);
    expect(after.L).toBeLessThanOrEqual(before.L);
    expect(after.C <= 6 || (after.h >= 200 && after.h <= 290)).toBe(true);
  });
  it('the dark street, a lawn and a tan sidewalk by moonlight all read cool', () => {
    for (const c of [[0.06, 0.07, 0.1], [0.07, 0.11, 0.06], [0.16, 0.14, 0.12]] as [number, number, number][]) {
      const o = labOf(night(c));
      expect(o.C <= 6 || (o.h >= 200 && o.h <= 290)).toBe(true);
    }
  });
  it("the lights keep their warmth: a lamp's heart, a lit window", () => {
    for (const c of [[0.95, 0.82, 0.52], [1.0, 0.86, 0.56], [0.86, 0.6, 0.3]] as [number, number, number][]) {
      expect(reserved(c)).toBeGreaterThan(0.9);
      const o = night(c);
      for (let i = 0; i < 3; i++) expect(Math.abs(o[i] - c[i])).toBeLessThan(0.03);
    }
  });
  it('darker stays darker (the wires against the sky, a pool against its gap)', () => {
    let last = -1;
    for (let v = 0; v <= 0.5; v += 0.02) {
      const o = night([v * 0.8, v * 0.85, v]);
      const L = o[0] * 0.299 + o[1] * 0.587 + o[2] * 0.114;
      expect(L).toBeGreaterThan(last);
      last = L;
    }
  });
  it('the darks go deeper; the look’s night wash scales it', () => {
    const c = [0.05, 0.06, 0.09] as [number, number, number];
    const L = (x: number[]) => x[0] * 0.299 + x[1] * 0.587 + x[2] * 0.114;
    expect(L(night(c))).toBeLessThan(L(c) * (1 - NIGHT_GRADE.deep * 0.8));
    const half = nightGrade(c, 1, 0.25), full = night(c);
    for (let i = 0; i < 3; i++) expect(half[i]).toBeCloseTo((c[i] + full[i]) / 2, 6);
    expect(nightGrade(c, 1, 0)).toEqual(c);
  });
});

describe('the street, end to end (scene light → display)', () => {
  // the post's tail on one pixel: the filmic curve, display encoding, the night grade (the default
  // look's saturation and colour grade left out: they move these by a few units)
  const show = (lin: [number, number, number]) => night(lin.map((v) => toSrgb(tonemap(v))) as [number, number, number]);
  const night = (c: [number, number, number]) => nightGrade(c, 1, 0.5);
  const lampColour = [1.0, 0.479, 0.144]; // 0xffb86a, linear
  const heart = (alb: number, d: number) => lampColour.map((c) => Math.max(alb, 0.3) * c * POOL.gain * poolLight(d)) as [number, number, number];
  it("an asphalt pool's heart is bright and warm, its gap dark", () => {
    const moonlit = [0.0084, 0.011, 0.02] as [number, number, number]; // asphalt under a gibbous moon
    const h = show(heart(0.1, 0).map((v, i) => v + moonlit[i]) as [number, number, number]);
    const gap = show(moonlit);
    const Lh = labOf(h), Lg = labOf(gap);
    expect(Lh.L).toBeGreaterThan(60);
    expect(Lh.h).toBeGreaterThan(40); expect(Lh.h).toBeLessThan(100); // warm: orange to yellow
    expect(Lg.L).toBeLessThan(18);
    const Y = (c: number[]) => { const l = c.map((v) => (v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4))); return 0.2126 * l[0] + 0.7152 * l[1] + 0.0722 * l[2]; };
    expect(Y(h) / Y(gap)).toBeGreaterThan(2.5 * 4);
  });
  it('smoothstep is GLSL’s', () => {
    expect(smoothstep(0, 1, 0.5)).toBe(0.5);
    expect(smoothstep(0.2, 0.4, 0.1)).toBe(0);
    expect(smoothstep(0.2, 0.4, 0.5)).toBe(1);
  });
});
