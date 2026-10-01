import { describe, it, expect } from 'vitest';
import { lampRepaintDue } from '../src/world/stream';

// The night lamp window (stream.ts repaintLamps): a 1024² canvas repainted for the walker and for
// tiles' lamps coming and going — on a flight, a tile mounts every few seconds.
describe('lamp window repaints', () => {
  it('paints the first time, and at once when the walker nears its edge', () => {
    expect(lampRepaintDue(0, -Infinity, true, false)).toBe(true);
    expect(lampRepaintDue(100, 50, false, true)).toBe(true);
    expect(lampRepaintDue(100, 50, true, true)).toBe(true);
  });
  it('waits for tiles: at most one repaint every 1.5 s for their lamps', () => {
    expect(lampRepaintDue(1000, 0, true, false)).toBe(false);
    expect(lampRepaintDue(1499, 0, true, false)).toBe(false);
    expect(lampRepaintDue(1500, 0, true, false)).toBe(true);
  });
  it('a flight mounting a tile a frame repaints at most once per 1.5 s', () => {
    let last = -Infinity, n = 0;
    for (let t = 0; t < 15000; t += 16) if (lampRepaintDue(t, last, true, false)) (last = t), n++;
    expect(n).toBeLessThanOrEqual(11);
  });
  it('nothing to do: no repaint', () => {
    expect(lampRepaintDue(5000, 0, false, false)).toBe(false);
  });
});
