import { describe, it, expect } from 'vitest';
import { BEACH_SEASON, beachDay, beachLotFill, beachSeason, lifeguardSeason, marinaSeason, present, presentPacked, packWindow, warmMonth, windowFor, BEACH_LOT_FLOOR } from '../src/world/calendar';

// The shore's calendar (world/calendar.ts): one season and one day for the beach, its lot and the
// marina, everywhere at once.

describe('the shore calendar', () => {
  it('a beach day rises once and falls once: full from half past eleven to half past three, empty at night', () => {
    expect(beachDay(4)).toBe(0);
    expect(beachDay(23)).toBe(0);
    expect(beachDay(13)).toBeGreaterThan(0.99);
    expect(beachDay(15.4)).toBeGreaterThan(0.99);
    expect(beachDay(10)).toBeGreaterThan(0.4);
    expect(beachDay(10)).toBeLessThan(0.75);
    expect(beachDay(17.8)).toBeGreaterThan(0.3);
    expect(beachDay(17.8)).toBeLessThan(0.6);
    // one rise, one fall
    let peak = 0, falls = false;
    for (let h = 0; h < 24; h += 0.05) {
      const v = beachDay(h);
      if (v < peak - 1e-9) falls = true;
      else if (falls) expect(v).toBeLessThanOrEqual(peak + 1e-9);
      peak = Math.max(peak, v);
    }
  });
  it('the beach lot: a few cars at night, full on a July afternoon, under a quarter on an October evening', () => {
    const july = beachSeason(7, false, 'temperate'), oct = beachSeason(10, false, 'temperate');
    expect(beachLotFill(3, july)).toBeCloseTo(BEACH_LOT_FLOOR, 3);
    expect(beachLotFill(13, july)).toBeGreaterThan(0.95);
    expect(beachLotFill(17.8, oct)).toBeLessThanOrEqual(0.25);
    expect(beachLotFill(13, beachSeason(1, false, 'temperate'))).toBeCloseTo(BEACH_LOT_FLOOR, 3);
    // a cold coast's beach is a third as full; the southern summer is half a year round
    expect(beachSeason(7, false, 'boreal')).toBeCloseTo(BEACH_SEASON[6] * 0.3, 5);
    expect(beachSeason(1, true, 'temperate')).toBe(BEACH_SEASON[6]);
    expect(warmMonth(1, true)).toBe(7);
  });
  it('marina slips: nearly full in July and August, about half in October; a warm coast stays busy', () => {
    expect(marinaSeason(7, false, 'temperate')).toBeCloseTo(0.9, 5);
    expect(marinaSeason(8, false, 'temperate')).toBeCloseTo(0.9, 5);
    expect(marinaSeason(10, false, 'temperate')).toBeCloseTo(0.55, 5);
    expect(marinaSeason(1, false, 'temperate')).toBeLessThan(0.3);
    expect(marinaSeason(1, false, 'tropical')).toBeGreaterThanOrEqual(0.72);
    expect(marinaSeason(1, true, 'temperate')).toBeCloseTo(0.9, 5); // (January is the southern July)
  });
  it('lifeguards: Memorial Day to Labor Day (and the southern summer)', () => {
    const d = (s: string) => new Date(s + 'T12:00:00Z');
    expect(lifeguardSeason(d('2026-05-24'), false)).toBe(false);
    expect(lifeguardSeason(d('2026-05-25'), false)).toBe(true); // Memorial Day 2026
    expect(lifeguardSeason(d('2026-07-15'), false)).toBe(true);
    expect(lifeguardSeason(d('2026-09-07'), false)).toBe(true); // Labor Day 2026
    expect(lifeguardSeason(d('2026-09-08'), false)).toBe(false);
    expect(lifeguardSeason(d('2026-10-01'), false)).toBe(false);
    expect(lifeguardSeason(d('2026-01-15'), true)).toBe(true);
    expect(lifeguardSeason(d('2026-07-15'), true)).toBe(false);
  });
  it('windows: what is there at an hour is exactly the fill, and the early ones stay latest', () => {
    const fill = (h: number) => beachLotFill(h, beachSeason(7, false, 'temperate'));
    const keys = Array.from({ length: 1000 }, (_, i) => (i + 0.5) / 1000);
    const wins = keys.map((u) => windowFor(u, fill));
    for (const h of [6, 9, 10.5, 13, 16, 17.8, 19, 22]) {
      const n = wins.filter((w) => w && present(h, w[0], w[1])).length;
      expect(Math.abs(n / 1000 - fill(h))).toBeLessThan(0.02);
    }
    // nested: a lower key's stretch holds a higher one's
    const a = windowFor(0.2, fill)!, b = windowFor(0.7, fill)!;
    expect(a[0]).toBeLessThanOrEqual(b[0]);
    expect(a[1]).toBeGreaterThanOrEqual(b[1]);
    expect(windowFor(0.01, fill)).toEqual([0, 24]); // (under the floor: there all day and night)
    expect(windowFor(0.5, () => 0.1)).toBeNull();
    // in one float (a micro record's flags): exact to the tenth of an hour
    expect(presentPacked(12, 0)).toBe(true);
    expect(presentPacked(12, packWindow([10.3, 16.7]))).toBe(true);
    expect(presentPacked(10.2, packWindow([10.3, 16.7]))).toBe(false);
    expect(presentPacked(16.8, packWindow([10.3, 16.7]))).toBe(false);
    expect(packWindow([0, 24])).toBe(0);
    // overnight windows
    expect(present(23, 20, 7)).toBe(true);
    expect(present(3, 20, 7)).toBe(true);
    expect(present(12, 20, 7)).toBe(false);
  });
});
