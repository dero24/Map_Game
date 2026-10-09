import { describe, it, expect } from 'vitest';
import { LOOKS, postParams } from '../src/render/post';

// The paint's looks (render/post.ts LOOKS, the panel's Look menu). The crisp watercolor (look-crisp-preset;
// Robby, 2026-10-08: "create the additional preset for better watercolor overlay") sharpens the default
// wash without leaving it: its notes' list, cheapest first — the brush at the frame's own resolution, the
// focal band clean, the darks deeper, a thinner torn edge.
describe('the looks', () => {
  const HD = LOOKS['watercolor HD'], C = LOOKS['crisp watercolor'];
  it("the default is watercolor HD, as it was (the crisp look's knobs off)", () => {
    for (const [k, v] of Object.entries(HD)) expect((postParams as Record<string, unknown>)[k], k).toEqual(v);
    expect(postParams.focal).toBe(0); expect(postParams.darks).toBe(0);
  });
  it("every look says what the crisp look's knobs are (picking one after it takes them away)", () => {
    for (const [name, l] of Object.entries(LOOKS)) { expect(l.focal, name).toBeDefined(); expect(l.darks, name).toBeDefined(); }
    expect(HD.focal).toBe(0); expect(HD.darks).toBe(0);
  });
  it('crisp watercolor is still a watercolor: the brush, the pooled rims, the paper and its grain, the ink', () => {
    expect(C).toBeDefined();
    expect(C.kuwaharaRadius!).toBeGreaterThanOrEqual(3); // (the brush still paints: 'clean vibrant' is 2.2)
    expect(C.crisp!).toBeLessThanOrEqual(0.2); // (the clean frame a touch, everywhere; 'clean HD' lays 0.3)
    expect(C.edgeDarkening!).toBeGreaterThanOrEqual(HD.edgeDarkening! * 0.9);
    expect(C.paperTexture!).toBeGreaterThan(0.3); expect(C.granulation!).toBeGreaterThan(0.1); expect(C.pigmentTurbulence!).toBeGreaterThan(0.1);
    expect(C.ink!).toBeGreaterThanOrEqual(HD.ink!);
    expect(C.vignette!).toBeGreaterThan(0); // (the torn edge kept, thinner)
  });
  it("…and sharper than the default: the brush at the frame's resolution, a finer stroke, the focal band clear, the darks deeper, a thinner edge, less wobble", () => {
    expect(C.paintDetail).toBe(1);
    expect(C.kuwaharaRadius!).toBeLessThan(HD.kuwaharaRadius!);
    expect(C.kuwaharaSharpness!).toBeGreaterThan(HD.kuwaharaSharpness!);
    expect(C.focal!).toBeGreaterThan(0.3); expect(C.darks!).toBeGreaterThan(0.2); expect(C.clarity!).toBeGreaterThan(0);
    expect(C.vignette!).toBeLessThan(HD.vignette!);
    expect(C.wobble!).toBeLessThan(HD.wobble!);
    // the colour as the default's: the same grade, near the same saturation and exposure
    expect(C.gradeShadow).toBe(HD.gradeShadow); expect(C.gradeLight).toBe(HD.gradeLight); expect(C.grade).toBe(HD.grade);
    expect(Math.abs(C.saturation! - HD.saturation!)).toBeLessThan(0.05); expect(C.exposure).toBe(HD.exposure);
  });
});
