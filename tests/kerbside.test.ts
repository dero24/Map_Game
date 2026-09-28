import { describe, it, expect } from 'vitest';
import { kerbSpaces, crossingPaint, oneToASpace, CLEAR, OCCUPANCY } from '../src/world/kerbside';
import type { Point, Road } from '../src/world/data';

// Main Street runs east along z = 0, 12 m kerb to kerb, parked both sides. A cross street goes
// through at x = 100, a driveway meets it at x = 50, a footway crosses at x = 150; a hydrant on the
// south kerb at x = 30, a bus stop on the north kerb at x = 175, a mapped crosswalk at x = 120.
const q = (pts: [number, number][]) => pts.flatMap(([x, z]) => [Math.round(x * 10), Math.round(z * 10)]);
const main: Road = { p: q([[0, 0], [30, 0], [50, 0], [100, 0], [150, 0], [200, 0]]), c: 'residential', w: 12, pk: 1 + 4 * 1 };
const ctx: Road[] = [
  main,
  { p: q([[100, -100], [100, 0], [100, 100]]), c: 'residential', w: 10 },
  { p: q([[50, 0], [50, 30]]), c: 'service', w: 3, sv: 'driveway' },
  { p: q([[150, -8], [150, 0], [150, 8]]), c: 'footway', w: 2 },
];
const pts: Point[] = [
  { c: 'hydrant', x: 30, z: 7 },
  { c: 'bus', x: 175, z: -8 },
  { c: 'xing', x: 120, z: 0.5 },
];
const HL = 2.35;
const opts = { left: false, built: () => 1, all: true };
const near = (s: { x: number; z: number }[], x: number, r: number, side?: 1 | -1) => s.filter((k) => Math.abs(k.x - x) < r && (!side || Math.sign(k.z) === side));

describe('kerbside parking', () => {
  const all = kerbSpaces([main], ctx, pts, opts);
  it('parks both kerbs, a space every 6.3 m, and keeps every corner clear', () => {
    expect(near(all, 80, 20, 1).length).toBeGreaterThan(0);
    expect(near(all, 80, 20, -1).length).toBeGreaterThan(0);
    expect(near(all, 100, CLEAR.corner + HL)).toEqual([]);
    expect(near(all, 100, CLEAR.corner + HL + 7).length).toBeGreaterThan(0);
  });
  it('leaves a driveway its mouth, and a crosswalk (mapped or where a footway crosses) its 20 ft', () => {
    expect(near(all, 50, CLEAR.curbCut + HL)).toEqual([]);
    expect(near(all, 50, CLEAR.curbCut + HL + 6.3).length).toBeGreaterThan(0); // (a driveway is not a corner)
    expect(near(all, 150, CLEAR.crossing + HL)).toEqual([]);
    expect(near(all, 120, CLEAR.crossing + HL)).toEqual([]);
  });
  it('keeps a hydrant and a bus zone clear on their own kerb only', () => {
    expect(near(all, 30, CLEAR.hydrant + HL, 1)).toEqual([]);
    expect(near(all, 30, CLEAR.hydrant + HL, -1).length).toBeGreaterThan(0);
    expect(near(all, 175, CLEAR.busStop + HL, -1)).toEqual([]);
    expect(near(all, 175, CLEAR.busStop + HL, 1).length).toBeGreaterThan(0);
  });
  it('a stop mapped on the street\'s own line keeps both kerbs clear', () => {
    const k2 = kerbSpaces([main], ctx, [{ c: 'bus', x: 175, z: 0 }], opts);
    expect(near(k2, 175, CLEAR.busStop + HL, 1)).toEqual([]);
    expect(near(k2, 175, CLEAR.busStop + HL, -1)).toEqual([]);
  });
  it('parks with the traffic on each side (and the other way round where they drive on the left)', () => {
    const fwd = (k: { yaw: number }) => [-Math.sin(k.yaw), -Math.cos(k.yaw)];
    for (const k of all) expect(Math.sign(fwd(k)[0])).toBe(k.z > 0 ? 1 : -1); // south kerb eastbound
    for (const k of kerbSpaces([main], ctx, pts, { ...opts, left: true })) expect(Math.sign(fwd(k)[0])).toBe(k.z > 0 ? -1 : 1);
    for (const k of all) expect(Math.abs(Math.abs(k.z) - (6 - 1.15))).toBeLessThan(1e-6); // in the parking lane
  });
  it('fills four in five downtown, fewer in the suburbs, none in open country — the same every visit', () => {
    const long: Road = { p: q([[0, 0], [3000, 0]]), c: 'residential', w: 12, pk: 5 };
    const n = kerbSpaces([long], [long], [], opts).length;
    const town = kerbSpaces([long], [long], [], { left: false, built: () => 1 }).length / n;
    const burbs = kerbSpaces([long], [long], [], { left: false, built: () => 0.1 }).length / n;
    expect(town).toBeGreaterThan(OCCUPANCY - 0.08);
    expect(town).toBeLessThan(OCCUPANCY + 0.08);
    expect(burbs).toBeLessThan(town * 0.5);
    expect(kerbSpaces([long], [long], [], { left: false, built: () => 0.02 })).toEqual([]);
    expect(kerbSpaces([long], [long], [], { left: false, built: () => 1 })).toEqual(kerbSpaces([long], [long], [], { left: false, built: () => 1 }));
  });

  it('one car to a space: a sharp bend\'s inside kerb and a lot drawn up to the street', () => {
    const body = (k: { x: number; z: number; yaw: number }, L = 5.2, W = 2) => {
      const c = Math.cos(k.yaw), s = Math.sin(k.yaw), hl = L / 2, hw = W / 2;
      return { ...k, corners: ([[-hw, -hl], [hw, -hl], [hw, hl], [-hw, hl]] as [number, number][]).map(([u, v]) => [k.x + u * c + v * s, k.z - u * s + v * c] as [number, number]) };
    };
    // bodies overlapping, by separating axes
    const hit = (A: [number, number][], B: [number, number][]) => {
      for (const Q of [A, B])
        for (let e = 0; e < 2; e++) {
          const nx = Q[e + 1][1] - Q[e][1], nz = Q[e][0] - Q[e + 1][0], pa = A.map(([x, z]) => x * nx + z * nz), pb = B.map(([x, z]) => x * nx + z * nz);
          if (Math.max(...pa) <= Math.min(...pb) || Math.max(...pb) <= Math.min(...pa)) return false;
        }
      return true;
    };
    const overlaps = (cars: ReturnType<typeof body>[]) => {
      let n = 0;
      for (let i = 0; i < cars.length; i++) for (let j = i + 1; j < cars.length; j++) if (hit(cars[i].corners, cars[j].corners)) n++;
      return n;
    };
    // a street doubling back at 130° with parking both sides: the inside kerb's spaces crowd together
    const bend: Road = { p: q([[0, 0], [60, 0], [20, 30]]), c: 'residential', w: 14, pk: 5 };
    const cars = kerbSpaces([bend], [bend], [], opts).map((k) => body(k));
    const kept = oneToASpace(cars);
    expect(overlaps(cars)).toBeGreaterThan(1);
    expect(overlaps(kept)).toBe(0);
    expect(kept.length).toBeGreaterThan(cars.length - 6); // only the crowded corner gives way
    // a lot's stall on the kerb's car: the kerb (first) keeps it; a clear stall still parks
    const lot = [body({ x: cars[0].x + 1, z: cars[0].z + 0.5, yaw: cars[0].yaw + 1.2 }), body({ x: 30, z: 40, yaw: 0 })];
    const withLot = oneToASpace([...kept, ...lot]);
    expect(withLot).toContain(kept[0]);
    expect(withLot).not.toContain(lot[0]);
    expect(withLot).toContain(lot[1]);
    expect(oneToASpace(kept)).toEqual(kept); // the same every visit, order kept
  });
});

describe('mapped crosswalks', () => {
  it('lies on the street it crosses, square to it, with its markings', () => {
    const rec = crossingPaint(ctx, [{ c: 'xing', x: 120, z: 0.5 }, { c: 'xing_l', x: 60, z: -0.4 }, { c: 'xing_u', x: 180, z: 0 }, { c: 'xing', x: 20, z: 0, own: 0 }, { c: 'xing', x: 60, z: 40 }]);
    expect(rec.length).toBe(18);
    expect(rec.slice(0, 6)).toEqual([120, 0, 1, 0, 12, 1]);
    expect(rec[11]).toBe(2);
    expect(rec[17]).toBe(0);
  });
});
