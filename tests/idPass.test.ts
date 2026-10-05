// The review's id pass (tools/id-pass.js), round 12's harness: "a walker pose must fail when no walker
// covers ≥ 1% of the frame" (14 re-posed "people on the street" onto empty sand), and "a thin occluder
// crossing ≥ 60% of the frame's height should fail too" (a pole ~2 m off split m5 in two at 3.7% of
// its pixels, under the 5% rule). The pure parts: lensVerdict and nearSpan.
import { describe, it, expect } from 'vitest';
import { lensVerdict, nearSpan } from '../tools/id-pass.js';

describe('the lens, round 12 (tools/id-pass.js)', () => {
  it('a thin thing at the lens across 60% of the frame\'s height fails; the ground at your feet, a hydrant\'s top, pass', () => {
    expect(lensVerdict({ subject: 0, near25: 0.037, near4: 0.04, world: 0.7, span: 0.92 })).toEqual(["a thin thing within 2.5 m across 92% of the frame's height"]);
    expect(lensVerdict({ subject: 0, near25: 0.02, near4: 0.03, world: 0.7, span: 0.3 })).toEqual([]);
    // (a pass without the span — an older caller — is judged as before)
    expect(lensVerdict({ subject: 0, near25: 0, near4: 0.03, world: 0.63 })).toEqual([]);
  });
  it('measures the span: a 3-px pole down 80% of a pass, beside a squat block', () => {
    const W = 100, H = 60, px = new Uint8Array(W * H * 4);
    const on = (x: number, y: number) => { px[(y * W + x) * 4 + 1] = 255; };
    for (let y = 5; y < 53; y++) for (let x = 40; x < 43; x++) on(x, y);
    for (let y = 40; y < 60; y++) for (let x = 60; x < 90; x++) on(x, y);
    expect(nearSpan(px, W, H)).toBeCloseTo(48 / 60, 5);
    // (two pieces that don't touch are two pieces: neither spans the frame)
    const q = new Uint8Array(W * H * 4);
    for (let y = 0; y < 25; y++) q[(y * W + 10) * 4 + 1] = 255;
    for (let y = 35; y < 60; y++) q[(y * W + 10) * 4 + 1] = 255;
    expect(nearSpan(q, W, H)).toBeCloseTo(25 / 60, 5);
    expect(nearSpan(new Uint8Array(W * H * 4), W, H)).toBe(0);
  });
  it('a walker pose with under 1% of walker in the frame fails', () => {
    expect(lensVerdict({ subject: 0.004, near25: 0, near4: 0, world: 0.8 }, { subject: 0.01 })).toEqual(['the subject 0.4% of the frame (under 1%)']);
    expect(lensVerdict({ subject: 0.026, near25: 0, near4: 0, world: 0.8 }, { subject: 0.01 })).toEqual([]);
  });
});
