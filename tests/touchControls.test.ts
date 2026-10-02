import { describe, it, expect } from 'vitest';
import { stickAxes } from '../src/player/vehicles';
import { shortRegion } from '../src/ui/geo';

// The walking stick as a ride's controls (player/vehicles.ts): +y is the stick pulled down.
describe('stickAxes', () => {
  it('steering sideways never touches the throttle', () => {
    for (const y of [-0.25, -0.12, 0, 0.1, 0.25]) expect(stickAxes(-1, y).y).toBe(0);
    expect(stickAxes(-1, 0.2).x).toBe(-1);
    expect(stickAxes(0.97, -0.24).y).toBe(0);
  });

  it('a wobble round the centre is nothing at all', () => {
    expect(stickAxes(0.08, -0.2)).toEqual({ x: 0, y: 0 });
    expect(stickAxes(-0.1, 0.25)).toEqual({ x: 0, y: 0 });
  });

  it('past the dead zone the rest of the throw is the whole range', () => {
    expect(stickAxes(0, -1).y).toBe(-1);
    expect(stickAxes(1, 1)).toEqual({ x: 1, y: 1 });
    expect(stickAxes(0, -0.625).y).toBeCloseTo(-0.5, 9); // halfway from the dead zone (0.25) to the rim
    expect(stickAxes(0.55, 0).x).toBeCloseTo(0.5, 9); // …and from steering's (0.1)
    expect(Math.abs(stickAxes(0, -0.26).y)).toBeLessThan(0.02); // (no jump at the edge of the zone)
  });

  it('left mirrors right and down mirrors up, and never past the rim', () => {
    for (const [x, y] of [[0.3, 0.7], [0.9, -0.4], [1.2, -1.5]]) {
      const a = stickAxes(x, y), b = stickAxes(-x, -y);
      expect(b.x).toBeCloseTo(-a.x, 12);
      expect(b.y).toBeCloseTo(-a.y, 12);
      expect(Math.abs(a.x)).toBeLessThanOrEqual(1);
      expect(Math.abs(a.y)).toBeLessThanOrEqual(1);
    }
  });
});

describe('shortRegion (a phone\'s arrival card: "Monmouth County, NJ · 7:42 pm")', () => {
  it('writes a US state at the end as its postal code, anything else as it is', () => {
    expect(shortRegion('Monmouth County, New Jersey')).toBe('Monmouth County, NJ');
    expect(shortRegion('New York')).toBe('NY');
    expect(shortRegion('King County, Washington')).toBe('King County, WA');
    expect(shortRegion('Gloucestershire, England')).toBe('Gloucestershire, England');
    expect(shortRegion('')).toBe('');
  });
});
