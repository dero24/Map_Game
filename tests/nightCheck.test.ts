import { describe, it, expect } from 'vitest';
import { luminance, lab, lstar, lch, regionColour, nightDarkPasses, wiresVsSky, poolContrast, windowMean, flipRows } from '../tools/night-core.js';

// The night check's pure parts (tools/night-core.js): the colour science and the reviewer's round-10
// night tests the page runs on its own frames (tools/night-check.js).

// a w × h frame of one colour, rows from the top
const frame = (w: number, h: number, rgb: (x: number, y: number) => [number, number, number]) => {
  const px = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { const [r, g, b] = rgb(x, y), i = (y * w + x) * 4; px[i] = r; px[i + 1] = g; px[i + 2] = b; px[i + 3] = 255; }
  return px;
};

describe('colour science', () => {
  it('Lab of the sRGB primaries and greys (D65)', () => {
    const [Lw, aw, bw] = lab(255, 255, 255);
    expect(Lw).toBeCloseTo(100, 1); expect(Math.abs(aw)).toBeLessThan(0.05); expect(Math.abs(bw)).toBeLessThan(0.05);
    expect(lab(0, 0, 0)[0]).toBeCloseTo(0, 3);
    expect(lab(119, 119, 119)[0]).toBeCloseTo(50, 0);
    const red = lab(255, 0, 0);
    expect(red[0]).toBeCloseTo(53.24, 1); expect(red[1]).toBeCloseTo(80.09, 0); expect(red[2]).toBeCloseTo(67.2, 0);
  });
  it('hue angles: blue ~306°, an amber wash ~50°, the night indigo 260–290°', () => {
    const [, ab, bb] = lab(0, 0, 255);
    expect(lch(ab, bb).h).toBeCloseTo(306.3, 0);
    const [, aa, ba] = lab(92, 66, 46); // the round-10 lower 40%: L* 26-ish, amber-brown
    expect(lch(aa, ba).h).toBeGreaterThan(40); expect(lch(aa, ba).h).toBeLessThan(65);
    const [, an, bn] = lab(22, 34, 52);
    expect(lch(an, bn).h).toBeGreaterThan(260); expect(lch(an, bn).h).toBeLessThan(290);
  });
  it('luminance and L* agree with Lab', () => {
    for (const [r, g, b] of [[30, 40, 70], [200, 150, 90], [12, 12, 12]] as const) expect(lstar(luminance(r, g, b))).toBeCloseTo(lab(r, g, b)[0], 3);
  });
});

describe('the dark (bottom 40% outside the lamp hearts)', () => {
  it("round 10's amber-mud fails, a deep indigo or a dark grey passes", () => {
    expect(nightDarkPasses({ n: 100, L: 26, C: 15, h: 46, L90: 30 }).pass).toBe(false);
    expect(nightDarkPasses({ n: 100, L: 12, C: 10, h: 262, L90: 16 }).pass).toBe(true);
    expect(nightDarkPasses({ n: 100, L: 12, C: 4, h: 40, L90: 16 }).pass).toBe(true); // (grey: any hue)
    expect(nightDarkPasses({ n: 100, L: 20, C: 10, h: 250, L90: 25 }).pass).toBe(false); // too light
    expect(nightDarkPasses({ n: 100, L: 12, C: 9, h: 310, L90: 16 }).pass).toBe(false); // violet, not blue
    expect(nightDarkPasses({ n: 0, L: null, C: null, h: null, L90: null }).pass).toBe(false);
  });
  it('a region: the mean L*, and the chroma and hue of the mean a*/b*', () => {
    // top half amber, bottom half navy: the bottom half alone reads navy
    const w = 20, h = 10, px = frame(w, h, (_x, y) => (y < 5 ? [140, 95, 50] : [24, 30, 56]));
    const all = regionColour(px, w, h, () => true), low = regionColour(px, w, h, (i) => i >= 5 * w);
    expect(low.n).toBe(100);
    expect(low.L!).toBeLessThan(14);
    expect(low.h!).toBeGreaterThan(255); expect(low.h!).toBeLessThan(290);
    expect(nightDarkPasses(low).pass).toBe(true);
    expect(nightDarkPasses(all).pass).toBe(false);
    expect(regionColour(px, w, h, () => false).n).toBe(0);
  });
});

describe('wires against the sky', () => {
  const w = 10, h = 4, sky = frame(w, h, () => [8, 10, 26]);
  const mask = new Uint8Array(w * h).map((_, i) => (i % w === 3 ? 1 : 0)); // one wire, a column
  it('a wire darker than the sky passes; a navy wire lighter than a black sky fails', () => {
    const dark = frame(w, h, (x) => (x === 3 ? [4, 5, 12] : [8, 10, 26]));
    const r = wiresVsSky(dark, sky, mask);
    expect(r.n).toBe(4); expect(r.delta!).toBeLessThan(0); expect(r.pass).toBe(true);
    const glow = frame(w, h, (x) => (x === 3 ? [40, 46, 74] : [8, 10, 26])); // round 10: L* 14–20 against 4
    const g = wiresVsSky(glow, sky, mask);
    expect(g.pass).toBe(false); expect(g.delta!).toBeGreaterThan(10); expect(g.over).toBe(1);
  });
  it('within 2 L* of the sky passes (a wire smeared into the sky by the brush)', () => {
    const near = frame(w, h, (x) => (x === 3 ? [10, 12, 29] : [8, 10, 26]));
    const r = wiresVsSky(near, sky, mask);
    expect(r.delta!).toBeGreaterThan(0); expect(r.delta!).toBeLessThanOrEqual(2); expect(r.pass).toBe(true);
  });
  it('no wire against the sky: nothing to judge', () => {
    expect(wiresVsSky(sky, sky, new Uint8Array(w * h)).pass).toBeNull();
  });
});

describe('pools down the street', () => {
  it('counts the pools whose heart is ≥ 2.5× the gap after it', () => {
    const r = poolContrast([{ heartY: 0.3, gapY: 0.02 }, { heartY: 0.12, gapY: 0.03 }, { heartY: 0.05, gapY: 0.03 }]);
    expect(r.pools.map((p) => p.ratio)).toEqual([15, 4, 1.67]);
    expect(r.good).toBe(2); expect(r.pass).toBe(true);
  });
  it('a dim wash (pools that run together) has no pool', () => {
    const r = poolContrast([{ heartY: 0.06, gapY: 0.045 }, { heartY: 0.05, gapY: null }]);
    expect(r.good).toBe(0); expect(r.pass).toBe(false);
    expect(r.pools[1].ratio).toBe(0); // (no dark ground between them at all)
  });
  it('one pool is not a street of them', () => {
    expect(poolContrast([{ heartY: 0.4, gapY: 0.01 }]).pass).toBe(false);
  });
});

describe('frames', () => {
  it('a window mean of luminance over the kept pixels', () => {
    const w = 8, h = 6, px = frame(w, h, (x) => (x < 4 ? [255, 255, 255] : [0, 0, 0]));
    expect(windowMean(px, w, h, 1, 2, 1, 1).Y).toBeCloseTo(1, 5);
    expect(windowMean(px, w, h, 4, 2, 1, 1).Y).toBeCloseTo(1 / 3, 5); // (x 3..5: one white column of three)
    expect(windowMean(px, w, h, 1, 2, 1, 1, () => false).n).toBe(0);
  });
  it('a WebGL read-back flips to the canvas order', () => {
    const px = new Uint8Array([1, 1, 1, 1, 2, 2, 2, 2]); // 1 × 2: bottom row first
    expect([...flipRows(px, 1, 2)]).toEqual([2, 2, 2, 2, 1, 1, 1, 1]);
  });
});
