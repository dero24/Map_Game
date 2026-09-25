import { describe, it, expect } from 'vitest';
import { makeRng, hash32 } from '../src/core/rng';
import { sunPosition, localToMs, localHour } from '../src/core/sun';

describe('rng', () => {
  it('is deterministic per seed and differs across seeds', () => {
    const a = makeRng(42), b = makeRng(42), c = makeRng(43);
    const sa = Array.from({ length: 50 }, () => a.u32());
    const sb = Array.from({ length: 50 }, () => b.u32());
    const sc = Array.from({ length: 50 }, () => c.u32());
    expect(sa).toEqual(sb);
    expect(sa).not.toEqual(sc);
  });
  it('floats stay in [0,1) and hash is stable', () => {
    const r = makeRng(7);
    for (let i = 0; i < 1000; i++) {
      const f = r.float();
      expect(f).toBeGreaterThanOrEqual(0);
      expect(f).toBeLessThan(1);
    }
    expect(hash32(12345)).toBe(hash32(12345));
  });
});

describe('sun over Sea Bright', () => {
  const lat = 40.362, lon = -73.9755, tz = 'America/New_York';
  it('is high at local solar noon near the September equinox', () => {
    const ms = localToMs(Date.UTC(2026, 8, 23, 16), 12.9, tz);
    const s = sunPosition(ms, lat, lon);
    expect(s.alt).toBeGreaterThan(45);
    expect(s.alt).toBeLessThan(53);
    expect(Math.abs(s.az - 180)).toBeLessThan(10);
  });
  it('sets in the west around 7pm and is well down at 10pm', () => {
    const base = Date.UTC(2026, 8, 23, 16);
    const dusk = sunPosition(localToMs(base, 18.9, tz), lat, lon);
    expect(Math.abs(dusk.alt)).toBeLessThan(3);
    expect(dusk.az).toBeGreaterThan(260);
    expect(dusk.az).toBeLessThan(280);
    expect(sunPosition(localToMs(base, 22, tz), lat, lon).alt).toBeLessThan(-20);
  });
  it('round-trips region-local hours', () => {
    const ms = localToMs(Date.UTC(2026, 0, 10, 12), 7.25, tz);
    expect(localHour(ms, tz)).toBeCloseTo(7.25, 3);
  });
  it('tracks a different timezone', () => {
    const ms = localToMs(Date.UTC(2026, 8, 23, 16), 12, 'America/Los_Angeles');
    expect(localHour(ms, 'America/Los_Angeles')).toBeCloseTo(12, 3);
    expect(localHour(ms, 'America/New_York')).toBeCloseTo(15, 3);
  });
});
