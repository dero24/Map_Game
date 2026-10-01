import { describe, it, expect } from 'vitest';
import { frameFov, frameScale, acrossOf, LENS, MAX_TALL } from '../src/player/frame';

// The frame by the screen's shape (player/frame.ts; reviewer round 10: "a phone is a window, not a
// slot"). walkParams.fov is the lens; the camera's vertical angle is fitted to the screen from it.
const fov = (w: number, h: number, lens = LENS) => frameFov(lens, w / h);
const across = (w: number, h: number, lens = LENS) => acrossOf(fov(w, h, lens), w / h);

describe('frameFov', () => {
  it('a phone held upright is a window: ≥ 40° across at 390×844 (it was a 31° slot)', () => {
    expect(acrossOf(LENS, 390 / 844)).toBeLessThan(32); // (the fixed 62° it replaces)
    expect(across(390, 844)).toBeGreaterThanOrEqual(40);
    expect(across(390, 844)).toBeCloseTo(41, 1);
    expect(fov(390, 844)).toBeCloseTo(78, 0); // 78° up and down
  });

  it('a phone on its side stops at 95° across at 844×390 (it showed 105°)', () => {
    expect(acrossOf(LENS, 844 / 390)).toBeGreaterThan(104);
    expect(across(844, 390)).toBeLessThanOrEqual(95 + 1e-9);
    expect(across(844, 390)).toBeGreaterThan(94.9);
  });

  it('leaves every PC screen from 4:3 to 16:9 exactly as it was', () => {
    for (const [w, h] of [[1920, 1080], [1600, 900], [1366, 768], [1280, 720], [960, 540], [1440, 900], [1680, 1050], [1280, 1024], [1024, 768], [1280, 960]]) {
      expect(fov(w, h)).toBe(LENS);
      expect(frameScale(w / h)).toBe(1);
      for (const lens of [18, 35, 48, 80, 100]) expect(fov(w, h, lens)).toBe(lens); // (photo zoom, the panel's slider)
    }
    expect(across(1920, 1080)).toBeCloseTo(93.8, 1); // the 94° a 16:9 PC sees
  });

  it('every upright phone sees 41° across; every one on its side at most 95°', () => {
    // (the phones tools/hud-audit.mjs checks: what a page gets, the browser's bars taken off)
    const phones = [[320, 568], [320, 658], [375, 667], [375, 629], [360, 740], [390, 664], [393, 659], [393, 727], [412, 839], [430, 740], [360, 800], [430, 932]];
    for (const [w, h] of phones) {
      expect(across(w, h)).toBeCloseTo(41, 1);
      expect(fov(w, h)).toBeGreaterThan(LENS);
      expect(fov(w, h)).toBeLessThanOrEqual(MAX_TALL);
      expect(across(h, w)).toBeLessThanOrEqual(95 + 1e-9);
      expect(fov(h, w)).toBeLessThanOrEqual(LENS);
    }
    // an iPad upright already sees more than 41° across: its lens is left alone
    expect(fov(768, 1024)).toBe(LENS);
  });

  it('the tallest screens stop at 84° tall', () => {
    expect(fov(300, 900)).toBeCloseTo(MAX_TALL, 6);
    expect(fov(200, 1000)).toBeCloseTo(MAX_TALL, 6);
  });

  it('changes smoothly with the screen: no jump as a browser bar slides away or the phone turns', () => {
    let prev = frameFov(LENS, 0.3);
    for (let a = 0.3; a <= 3.2; a += 0.001) {
      const f = frameFov(LENS, a);
      expect(Math.abs(f - prev)).toBeLessThan(0.25);
      expect(f).toBeLessThanOrEqual(prev + 1e-9); // (wider screens never get taller frames)
      prev = f;
    }
  });

  it('a zoom scales the frame in proportion on every screen (photo mode, the brush)', () => {
    for (const a of [390 / 844, 320 / 568, 1, 16 / 9, 844 / 390, 21 / 9]) {
      const k = frameScale(a);
      for (const lens of [18, 30, 48, 62, 80]) {
        const t = Math.tan((frameFov(lens, a) * Math.PI) / 360) / Math.tan((lens * Math.PI) / 360);
        expect(t).toBeCloseTo(k, 9);
      }
      // the photo zoom's range keeps its order and its span
      expect(frameFov(18, a)).toBeLessThan(frameFov(62, a));
      expect(frameFov(62, a)).toBeLessThan(frameFov(80, a));
    }
    // upright at 390×844, the photo zoom runs from a 24° to a 97° frame (18–80° on a PC)
    expect(fov(390, 844, 18)).toBeCloseTo(24, 0);
    expect(fov(390, 844, 80)).toBeCloseTo(97, 0);
  });

  it('a broken size leaves the lens alone', () => {
    for (const a of [0, -1, NaN, Infinity]) expect(frameFov(LENS, a)).toBe(LENS);
  });
});
