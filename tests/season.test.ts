import { describe, it, expect } from 'vitest';
import { seasonAt, meanTemp, dayOfYear } from '../src/world/season';

const JAN = 25, APR = 105, JUL = 200, SEP = 270, OCT = 280, NOV = 320;

describe('seasons', () => {
  it('January means land near the real normals', () => {
    const near = (lat: number, lon: number, elev: number, want: number, tol = 3.5) => expect(Math.abs(meanTemp(lat, lon, elev, 20) - want)).toBeLessThan(tol);
    near(40.76, -73.98, 10, 0.5); // New York
    near(42.36, -71.06, 10, -1.5); // Boston
    near(47.61, -122.33, 50, 5); // Seattle
    near(32.23, -110.97, 730, 11.6); // Tucson
    near(25.78, -80.13, 2, 20); // Miami
    near(33.75, -84.39, 300, 6.5); // Atlanta
    near(44.98, -93.27, 260, -9, 5); // Minneapolis (the model runs a little mild)
  });
  it('snow lies where winters freeze, not where they do not', () => {
    expect(seasonAt(44.98, -93.27, 260, JAN).snow).toBeGreaterThan(0.8); // Minneapolis in January
    expect(seasonAt(44.98, -93.27, 260, JUL).snow).toBe(0);
    expect(seasonAt(40.76, -73.98, 10, JAN).snow).toBeLessThan(0.5); // New York: a dusting at most
    expect(seasonAt(40.76, -73.98, 10, SEP).snow).toBe(0);
    expect(seasonAt(32.23, -110.97, 730, JAN).snow).toBe(0); // Tucson…
    expect(seasonAt(32.44, -110.79, 2700, JAN).snow).toBeGreaterThan(0.5); // …but not Mount Lemmon
    expect(seasonAt(25.78, -80.13, 2, JAN).snow).toBe(0); // Miami
  });
  it('broadleaf trees are bare in a northern winter, in leaf in summer, and colour in autumn', () => {
    expect(seasonAt(40.76, -73.98, 10, JAN).leafFall).toBe(1);
    expect(seasonAt(40.76, -73.98, 10, JUL).leafFall).toBe(0);
    expect(seasonAt(40.76, -73.98, 10, SEP).leafFall).toBe(0);
    expect(seasonAt(47.61, -122.33, 50, JAN).leafFall).toBe(1); // Seattle's maples too
    expect(seasonAt(25.78, -80.13, 2, JAN).leafFall).toBe(0); // Miami never drops
    expect(seasonAt(44.48, -73.21, 60, OCT).autumn).toBeGreaterThan(0.4); // Vermont in October
    expect(seasonAt(40.76, -73.98, 10, APR).autumn).toBe(0); // spring greens, not autumn reds
    expect(seasonAt(40.76, -73.98, 10, NOV).autumn).toBeGreaterThan(0.2); // New York's late colour
  });
  it('the far snowline follows the year, and the southern year is turned round', () => {
    expect(seasonAt(39.74, -104.99, 1600, JUL).snowline).toBeGreaterThan(3500); // Colorado summer peaks bare
    expect(seasonAt(39.74, -104.99, 1600, JAN).snowline).toBeLessThan(1500);
    const nz = (d: number) => seasonAt(-45.03, 168.66, 330, d).snowline; // Queenstown
    expect(nz(JUL)).toBeLessThan(nz(JAN));
  });
  it('counts days from 1 January', () => {
    expect(dayOfYear(Date.UTC(2026, 0, 1, 12))).toBe(1);
    expect(dayOfYear(Date.UTC(2026, 8, 27, 12))).toBe(270);
  });
  it('the cherries blossom in spring, not in autumn', () => {
    const MAY = 125;
    const nj = (d: number) => seasonAt(40.36, -73.97, 5, d).bloom;
    expect(Math.max(nj(APR), nj(MAY), nj(95))).toBeGreaterThan(0.5); // New Jersey, April–May
    expect(nj(OCT)).toBe(0);
    expect(nj(JUL)).toBe(0);
    expect(nj(JAN)).toBe(0);
  });
  it('a marine autumn waits for the short days; the tropics never turn', async () => {
    const { dayLength } = await import('../src/world/season');
    expect(dayLength(47.6, 172)).toBeGreaterThan(15.5); // Seattle midsummer
    expect(Math.abs(dayLength(40, 265) - 12)).toBeLessThan(0.25); // the equinox, everywhere
    expect(seasonAt(47.63, -122.36, 90, 271).autumn).toBeLessThan(0.4); // Seattle, late September
    expect(seasonAt(47.63, -122.36, 90, 295).autumn).toBeGreaterThan(0.4); // …late October
    expect(seasonAt(25.78, -80.13, 2, NOV).autumn).toBe(0); // Miami
    expect(seasonAt(25.78, -80.13, 2, NOV).turn).toBe(0);
  });
  it('the turning only goes one way: from the first colour to the last leaf, then green again in spring', () => {
    for (const [lat, lon] of [[47.63, -122.36], [44.48, -73.21], [40.76, -73.98]]) {
      let prev = 0;
      for (let d = 200; d <= 366; d += 3) {
        const t = seasonAt(lat, lon, 50, d).turn;
        expect(t, `${lat} day ${d}`).toBeGreaterThanOrEqual(prev - 1e-9);
        prev = t;
      }
      expect(prev).toBeGreaterThan(0.9); // by the new year, every tree has turned (and dropped)
      expect(seasonAt(lat, lon, 50, 120).turn).toBe(0); // May: green
    }
    // …and after the coldest turn of the year it fades as the spring warms, never all at once
    for (const [lat, lon] of [[29.76, -95.37], [47.63, -122.36], [-37.81, 144.96]]) {
      let prev = seasonAt(lat, lon, 20, 1).turn;
      for (let d = 1; d <= 365; d += 2) {
        const t = seasonAt(lat, lon, 20, d).turn;
        expect(Math.abs(t - prev), `${lat} day ${d}`).toBeLessThan(0.25);
        prev = t;
      }
    }
    expect(seasonAt(47.63, -122.36, 90, 271).turn).toBeGreaterThan(0); // Seattle, late September: the first ones
    expect(seasonAt(47.63, -122.36, 90, 271).turn).toBeLessThan(0.3);
  });
});
