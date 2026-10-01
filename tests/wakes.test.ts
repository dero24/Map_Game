import { describe, it, expect } from 'vitest';
import { Wakes, wakeFoam, WAKE_MAX, SHALLOW } from '../src/world/wakes';

// Review round 11 (calendar-autumn 3): "white lozenges fan across the water at the house's dock. If
// that's a passing boat's wake, its foam is too thick and opaque at 10 m." A wake reads as thin,
// broken foam lines that fade — measured on `wakeFoam`, the shader's twin — and it keeps out of water
// too shallow to carry it (the docks' sand).

const KELVIN = Math.tan((19.47 * Math.PI) / 180);
/** The V's half-width s metres behind a boat of beam b (wakes.ts: the hull's half, a margin, the arms). */
const halfW = (s: number, b = 2.4) => b / 2 + 0.7 + KELVIN * s;
/** The foam across the V at s (from the port edge to the track), every cm: [metres in from the edge, alpha]. */
const across = (s: number, t: number, b = 2.4) => {
  const w = halfW(s, b), out: [number, number][] = [];
  for (let din = 0; din <= w; din += 0.01) out.push([din, wakeFoam(-(1 - din / w), w, s, 1, b, t)]);
  return out;
};

describe('a wake (review round 11: "its foam is too thick and opaque at 10 m")', () => {
  it('is never more than half white', () => {
    let most = 0;
    for (let t = 0; t < 20; t += 1.3) for (let s = 0; s < 80; s += 0.25) for (let sd = -1; sd <= 1; sd += 0.02) most = Math.max(most, wakeFoam(sd, halfW(s), s, 1, 2.4, t));
    expect(most).toBeLessThanOrEqual(WAKE_MAX + 1e-9);
    expect(WAKE_MAX).toBeLessThanOrEqual(0.55);
    expect(most).toBeGreaterThan(0.3); // (and there is foam)
  });
  it('its arms are thin lines: each run of foam across the arms at 10 m is ≤ 30 cm wide; the crests between them faint', () => {
    let lit = 0;
    for (let t = 0; t < 30; t += 0.7) {
      // (the runs of foam over a tenth of its whitest in the arms' band, the outer metre of the V)
      const prof = across(10, t).filter(([din]) => din < 1.0);
      let run = 0, widest = 0;
      for (const [, a] of prof) { if (a > WAKE_MAX * 0.1) { run += 0.01; lit++; } else run = 0; widest = Math.max(widest, run); }
      expect(widest).toBeLessThanOrEqual(0.3);
      // (the crests across the track, between the arms and the churn: a quarter of its whitest at most)
      for (const [din, a] of across(10, t)) if (din > 1.0 && din < halfW(10) - 2.4) expect(a).toBeLessThanOrEqual(WAKE_MAX * 0.25);
    }
    expect(lit).toBeGreaterThan(0);
  });
  it('they are broken: dashes along each arm with gaps between, never a solid band', () => {
    for (const t of [0, 3.7, 11.2]) {
      for (const sd of [-1, 1]) {
        // along the arm's line (8 cm in from the V's edge) from 6 m to 40 m behind
        let on = 0, n = 0, gaps = 0, was = true;
        for (let s = 6; s <= 40; s += 0.05) {
          const w = halfW(s), a = wakeFoam(sd * (1 - 0.08 / w), w, s, 1, 2.4, t), lit = a > WAKE_MAX * 0.1;
          n++;
          if (lit) on++;
          if (!lit && was) gaps++;
          was = lit;
        }
        expect(on / n).toBeGreaterThan(0.2);
        expect(on / n).toBeLessThan(0.75);
        expect(gaps).toBeGreaterThanOrEqual(4);
      }
    }
  });
  it('fades as it spreads: its arms at 40–60 m are under 40% of what they are at 5–20 m', () => {
    const mean = (s0: number, s1: number) => {
      let a = 0, n = 0;
      for (let t = 0; t < 30; t += 0.9) for (let s = s0; s <= s1; s += 0.2) for (const sd of [-1, 1]) { const w = halfW(s); a += wakeFoam(sd * (1 - 0.08 / w), w, s, 1, 2.4, t); n++; }
      return a / n;
    };
    expect(mean(40, 60)).toBeLessThan(0.4 * mean(5, 20));
  });
  it('keeps out of water too shallow to carry it: a boat passing a dock leaves none over its sand', () => {
    // a channel 6 m deep, shoaling from z = 6 to a beach (the bed rising 25 cm a metre), the boat
    // running along it at 6 m/s: its V's edge reaches over the shallows behind it
    const bed = (_x: number, z: number) => Math.min(1.5, -6 + Math.max(0, z - 6) * 0.25);
    const W = new Wakes();
    W.bedAt = bed;
    for (let f = 0; f <= 120; f++) W.update(f / 10, [{ id: 1, x: -60 + f * 0.6, z: 3, yaw: -Math.PI / 2, v: 6, y: 0, stern: 3, beam: 2.4 }]);
    const vs = W.vertices();
    expect(vs.length).toBeGreaterThan(30);
    let shallow = 0, deep = 0;
    for (const [x, z, k] of vs) {
      const d = 0 - bed(x, z);
      if (d >= -1 && d < SHALLOW[0]) { shallow++; expect(k).toBe(0); }
      if (d > SHALLOW[1]) { deep++; }
    }
    expect(shallow).toBeGreaterThan(3);
    expect(deep).toBeGreaterThan(3);
    // (and deep water carries it as before)
    expect(vs.some(([x, z, k]) => 0 - bed(x, z) > SHALLOW[1] && k > 0.3)).toBe(true);
    // without a bed, deep everywhere
    const W2 = new Wakes();
    for (let f = 0; f <= 120; f++) W2.update(f / 10, [{ id: 1, x: -60 + f * 0.6, z: 3, yaw: -Math.PI / 2, v: 6, y: 0, stern: 3, beam: 2.4 }]);
    expect(W2.vertices().filter(([, , k]) => k === 0).length).toBe(0);
  });
});
