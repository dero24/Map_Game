import { describe, it, expect } from 'vitest';
import { Explore, revealRadius, bloomRate } from '../src/world/explore';
import { fromLatLon, toLatLon } from '../src/world/data';
import { parseLatLon, searchLocal } from '../src/ui/geo';

describe('paint as you explore', () => {
  it('reveal grows with height, bloom is fastest underfoot', () => {
    expect(revealRadius(1.6)).toBeCloseTo(45, 0);
    expect(revealRadius(300)).toBeGreaterThan(200);
    expect(revealRadius(5000)).toBeLessThanOrEqual(450);
    expect(bloomRate(0, 45)).toBeGreaterThan(bloomRate(40, 45));
    expect(bloomRate(50, 45)).toBe(0);
  });

  it('paints around the walker and nowhere else', () => {
    const e = new Explore({ lat: 40.36, lon: -73.97 });
    for (let i = 0; i < 30; i++) e.update(0, 0, 1.6, 0.1);
    expect(e.valueAt(0, 0)).toBe(255);
    expect(e.valueAt(30, 0)).toBeGreaterThan(150);
    expect(e.valueAt(200, 0)).toBe(0);
    expect(e.stats().painted).toBeGreaterThan(50);
    expect(e.stats().km2).toBeGreaterThan(0.003);
  });

  it('the record is global: a re-anchored frame sees the same painted ground', () => {
    const o1 = { lat: 40.36, lon: -73.97 };
    const e = new Explore(o1);
    for (let i = 0; i < 30; i++) e.update(500, -300, 1.6, 0.1);
    const [lat, lon] = toLatLon(o1, 500, -300);
    const o2 = { lat: 40.41, lon: -74.05 }; // teleport far enough to re-anchor
    e.setOrigin(o2);
    const [x2, z2] = fromLatLon(o2, lat, lon);
    expect(e.valueAt(x2, z2)).toBe(255);
    expect(e.valueAt(x2 + 300, z2)).toBe(0);
  });
});

describe('place search', () => {
  it('parses coordinates', () => {
    expect(parseLatLon('40.3620, -73.9755')?.lat).toBeCloseTo(40.362, 3);
    expect(parseLatLon('40.3620 -73.9755')?.lon).toBeCloseTo(-73.9755, 3);
    expect(parseLatLon('ocean ave')).toBeNull();
    expect(parseLatLon('95, 10')).toBeNull();
  });
  it('finds loaded streets and buildings, prefix matches first', () => {
    const items = [
      { name: 'Ocean Avenue', detail: 'street', lat: 1, lon: 1, kind: 'street' },
      { name: 'North Ocean Avenue', detail: 'street', lat: 2, lon: 2, kind: 'street' },
      { name: 'Ocean Avenue', detail: 'dup', lat: 3, lon: 3, kind: 'street' },
      { name: 'Peninsula Avenue', detail: 'street', lat: 4, lon: 4, kind: 'street' },
    ];
    const r = searchLocal('ocean ave', items);
    expect(r.map((p) => p.name)).toEqual(['Ocean Avenue', 'North Ocean Avenue']);
    expect(searchLocal('x', items)).toHaveLength(0);
  });
});
