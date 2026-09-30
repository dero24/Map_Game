import { describe, it, expect } from 'vitest';
import { applyTier, autoSteps, isPhoneClass, pickTier, type DeviceInfo } from '../src/render/quality';

const PIXEL7: DeviceInfo = { coarse: true, hover: false, touchPoints: 5, screenMin: 412, screenMax: 915, dpr: 2.625, memoryGB: 8, cores: 8, ua: 'Mozilla/5.0 (Linux; Android 14; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Mobile Safari/537.36', maxTex: 8192 };
const IPHONE: DeviceInfo = { coarse: true, hover: false, touchPoints: 5, screenMin: 390, screenMax: 844, dpr: 3, cores: 4, ua: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Mobile/15E148 Safari/604.1', maxTex: 16384 };
const DESKTOP: DeviceInfo = { coarse: false, hover: true, touchPoints: 0, screenMin: 1080, screenMax: 1920, dpr: 1, memoryGB: 8, cores: 12, ua: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36', maxTex: 16384 };
const IPAD: DeviceInfo = { coarse: true, hover: false, touchPoints: 5, screenMin: 820, screenMax: 1180, dpr: 2, ua: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Safari/605.1.15', maxTex: 16384 };
const TOUCH_LAPTOP: DeviceInfo = { coarse: false, hover: true, touchPoints: 10, screenMin: 900, screenMax: 1440, dpr: 1.5, memoryGB: 8, cores: 8, ua: DESKTOP.ua, maxTex: 16384 };

describe('pickTier', () => {
  it('keeps desktops on the shipped defaults', () => {
    const t = pickTier(DESKTOP);
    expect(t.tier).toBe('desktop');
    expect(t.post).toEqual({});
    expect(t.stream).toEqual({ loadR: 1500, dropR: 2400, coarseR: 8000 });
    expect(t.paintTex).toBe(4096);
    expect(pickTier(TOUCH_LAPTOP).tier).toBe('desktop'); // a mouse-first laptop with a touch screen
  });
  it('gives phones (Android, iPhone, iPad) the phone tier', () => {
    for (const d of [PIXEL7, IPHONE, IPAD]) {
      const t = pickTier(d);
      expect(t.tier).toBe('phone');
      expect(t.post.hiDpi).toBe(false);
      expect(t.shadow.size).toBe(1024);
      expect(t.paintTex).toBe(2048);
      expect(t.stream.loadR).toBeLessThan(1500);
      expect(t.stream.dropR).toBeGreaterThan(t.stream.loadR); // hysteresis kept
      expect(t.stream.coarseR).toBeGreaterThan(t.stream.dropR);
    }
    expect(isPhoneClass({ ...DESKTOP, ua: PIXEL7.ua })).toBe(true); // UA alone (desktop-mode off, mouse attached)
    expect(isPhoneClass({ ...DESKTOP, touchPoints: 5, screenMin: 400 })).toBe(true); // a small touch screen
  });
  it('drops weak phones to low', () => {
    expect(pickTier({ ...PIXEL7, memoryGB: 2 }).tier).toBe('low');
    expect(pickTier({ ...PIXEL7, memoryGB: 2 }).shadow).toEqual({ size: 1024, enabled: false });
    expect(pickTier(PIXEL7).shadow.enabled).toBeUndefined(); // (a phone keeps its shadows)
    expect(pickTier({ ...PIXEL7, maxTex: 4096 }).tier).toBe('low');
    expect(pickTier({ ...PIXEL7, cores: 4 }).tier).toBe('low');
    expect(pickTier(IPHONE).tier).toBe('phone'); // (Safari's hardwareConcurrency says little)
    expect(pickTier({ ...DESKTOP, memoryGB: 2 }).tier).toBe('phone');
  });
  it('steps down one tier after a load that died on screen', () => {
    expect(pickTier(DESKTOP, { crashed: true }).tier).toBe('phone');
    expect(pickTier(PIXEL7, { crashed: true }).tier).toBe('low');
    expect(pickTier({ ...PIXEL7, memoryGB: 2 }, { crashed: true }).tier).toBe('low');
    expect(pickTier(PIXEL7, { crashed: true }).why).toContain('cut short');
  });
  it('keeps a PC as it was, and a phone light in a city', () => {
    const d = pickTier(DESKTOP);
    expect(d.lidar).toBe(true);
    expect(d.skylineR).toBe(8000);
    expect(d.stream.budgetMB).toBeUndefined(); // (no budget: every cell of the ring, as ever)
    expect(d.stream.realConc).toBeUndefined();
    for (const t of [pickTier(PIXEL7), pickTier(IPHONE), pickTier({ ...PIXEL7, memoryGB: 2 })]) {
      expect(t.lidar).toBe(false);
      expect(t.skylineR).toBeLessThan(8000);
      expect(t.stream.budgetMB).toBeGreaterThan(0);
      expect(t.stream.realConc).toBeLessThan(4);
      expect(t.stream.purge).toBe(true);
    }
    expect(pickTier({ ...PIXEL7, memoryGB: 2 }).stream.budgetMB!).toBeLessThan(pickTier(PIXEL7).stream.budgetMB!);
  });
  it('honours ?quality=', () => {
    expect(pickTier(PIXEL7, { forced: 'desktop' }).tier).toBe('desktop');
    expect(pickTier(DESKTOP, { forced: 'phone' }).tier).toBe('phone');
    expect(pickTier(DESKTOP, { forced: 'LOW' }).tier).toBe('low');
    expect(pickTier(DESKTOP, { forced: 'bogus' }).tier).toBe('desktop');
  });
  it('hands out independent configs', () => {
    const a = pickTier(PIXEL7), b = pickTier(PIXEL7);
    a.stream.loadR = 1;
    expect(b.stream.loadR).toBe(900);
  });
});

describe('applyTier', () => {
  it('lays the tier over the bags but never over a knob the player saved', () => {
    const post = { hiDpi: true, paintDetail: 0.82, renderScale: 1, exposure: 0.92 };
    const shadow = { size: 2048, enabled: true };
    const stream = { loadR: 1500, dropR: 2400, coarseR: 8000 };
    const set = applyTier(pickTier(PIXEL7), { post, shadow, stream }, new Set(['post.paintDetail']));
    expect(post.hiDpi).toBe(false);
    expect(post.paintDetail).toBe(0.82); // saved in the panel — kept
    expect(post.exposure).toBe(0.92);
    expect(shadow.size).toBe(1024);
    expect(stream.loadR).toBe(900);
    expect(set).toContain('post.hiDpi');
    expect(set.includes('post.paintDetail')).toBe(false);
  });
  it('changes nothing on a desktop', () => {
    const post = { hiDpi: true, paintDetail: 0.82, renderScale: 1 };
    const shadow = { size: 2048 };
    const stream = { loadR: 1500, dropR: 2400, coarseR: 8000 };
    expect(applyTier(pickTier(DESKTOP), { post, shadow, stream }, new Set())).toEqual([]);
    expect(post).toEqual({ hiDpi: true, paintDetail: 0.82, renderScale: 1 });
  });
});

describe('autoSteps', () => {
  const P = { hiDpi: true, paintDetail: 0.82, renderScale: 1 };
  const S = { size: 2048 };
  it('leaves a fast GPU alone', () => {
    expect(autoSteps(16, 0, P, S, new Set(), 2)).toEqual([]);
    expect(autoSteps(20, 1, P, S, new Set(), 2)).toEqual([]);
  });
  it('trades resolution first, then scale and shadows', () => {
    expect(autoSteps(30, 0, P, S, new Set(), 2)).toEqual([['post', 'hiDpi', false], ['post', 'paintDetail', 0.5]]);
    expect(autoSteps(30, 0, P, S, new Set(), 1)).toEqual([['post', 'paintDetail', 0.5]]); // no hi-DPI to drop at DPR 1
    expect(autoSteps(30, 1, P, S, new Set(), 2)).toEqual([]); // 30 ms after round 0: good enough
    expect(autoSteps(50, 1, P, S, new Set(), 2)).toEqual([['post', 'renderScale', 0.75], ['shadow', 'size', 1024]]);
  });
  it('never touches a saved knob', () => {
    expect(autoSteps(60, 0, P, S, new Set(['post.hiDpi', 'post.paintDetail']), 2)).toEqual([]);
    expect(autoSteps(60, 1, P, S, new Set(['shadow.size']), 2)).toEqual([['post', 'renderScale', 0.75]]);
  });
});
