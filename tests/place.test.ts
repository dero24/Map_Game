import { describe, it, expect } from 'vitest';
import { placeBoat, placeCar, boatRoom, compass, type PlaceWorld } from '../src/player/place';
import type { Road } from '../src/world/data';

// Land to the west at 2 m, a beach sloping into a bay from x = 0 to 20, the bay deepening east;
// one street along z = 0 from x = -200 to -10 (8 m wide).
const H = (x: number) => (x < 0 ? 2 : x < 20 ? 2 - 0.25 * x : -3 - 0.02 * (x - 20));
const street: Road = { p: [-2000, 0, -100, 0], c: 'residential', w: 8 };
const world = (o: Partial<PlaceWorld> = {}): PlaceWorld => ({
  height: (x) => H(x),
  sdf: (x) => 10 - x,
  building: () => -1,
  roads: () => [street],
  driveLeft: false,
  ...o,
});
const fwd = (yaw: number) => [-Math.sin(yaw), -Math.cos(yaw)];

describe('placing a painted boat', () => {
  it('sets down right where you aim on open water, bow off the land', () => {
    const p = placeBoat(world(), 60, 5, 0);
    expect(p.ok).toBe(true);
    if (!p.ok) return;
    expect(p.spot.d).toBe(0);
    expect([p.spot.x, p.spot.z]).toEqual([60, 5]);
    expect(fwd(p.spot.yaw)[0]).toBeGreaterThan(0.99); // the bay deepens east: bow east
  });

  it('aimed at the beach, finds the nearest water with room for a hull', () => {
    const w = world();
    const p = placeBoat(w, 5, 0, -Math.PI / 2); // facing east
    expect(p.ok).toBe(true);
    if (!p.ok) return;
    expect(boatRoom(w, p.spot.x, p.spot.z)).toBe(true);
    expect(p.spot.x).toBeGreaterThan(16);
    expect(p.spot.d).toBeLessThan(16);
    expect(fwd(p.spot.yaw)[0]).toBeGreaterThan(0.9);
    // the same aim is the same boat, every time
    expect(placeBoat(w, 5, 0, -Math.PI / 2)).toEqual(p);
  });

  it('a small hull lies nearer the bank than a big one (where you can step aboard)', () => {
    const skiff = placeBoat(world(), 5, 0, -Math.PI / 2, 60, 0, { room: 3.3, depth: 0.45 });
    const cruiser = placeBoat(world(), 5, 0, -Math.PI / 2, 60, 0, { room: 6.1, depth: 0.95 });
    expect(skiff.ok && cruiser.ok).toBe(true);
    if (!skiff.ok || !cruiser.ok) return;
    expect(skiff.spot.x).toBeLessThan(cruiser.spot.x);
    expect(boatRoom(world(), skiff.spot.x, skiff.spot.z, 3.3)).toBe(true);
    expect(boatRoom(world(), cruiser.spot.x, cruiser.spot.z, 6.1, 0.95)).toBe(true);
  });

  it('far inland says there is no water in reach, and which way it is', () => {
    const p = placeBoat(world(), -300, 0, 0);
    expect(p.ok).toBe(false);
    if (p.ok) return;
    expect(/open water — the nearest is \d+ m east$/.test(p.why)).toBe(true);
    const q = placeBoat(world({ height: () => 3, sdf: () => 50 }), 0, 0, 0);
    expect(!q.ok && q.why).toBe('a boat needs open water — there is none nearby');
  });
});

describe('placing a painted car', () => {
  it('sets down in the lane nearest your aim, going the way you look', () => {
    const west = Math.PI / 2;
    const p = placeCar(world(), -100, 3, west);
    expect(p.ok).toBe(true);
    if (!p.ok) return;
    expect(p.spot.x).toBeCloseTo(-100, 5);
    expect(p.spot.z).toBeCloseTo(-2, 5); // heading west, the right-hand lane is the north one
    expect(fwd(p.spot.yaw)[0]).toBeCloseTo(-1, 5);
    const left = placeCar(world({ driveLeft: true }), -100, 3, west);
    expect(left.ok && left.spot.z).toBeCloseTo(2, 5);
    const east = placeCar(world(), -100, 3, -west);
    expect(east.ok && east.spot.z).toBeCloseTo(2, 5);
  });

  it('never in a building, never on a footpath, and says where the street is when none is near', () => {
    // a house right up to the kerb where you aimed: the car pulls up just past it
    const blocked = placeCar(world({ building: (x, z) => (Math.abs(x + 100) < 7 && z < 0 ? 1 : -1) }), -100, 3, Math.PI / 2);
    expect(blocked.ok).toBe(true);
    if (blocked.ok) expect(Math.abs(blocked.spot.x + 100)).toBeGreaterThanOrEqual(7);
    if (blocked.ok) expect(Math.abs(blocked.spot.x + 100)).toBeLessThan(12);
    // a whole block of them, and the street out of reach past it: no car, and why
    const walled = placeCar(world({ building: (x, z) => (Math.abs(x + 100) < 40 && z < 0 ? 1 : -1) }), -100, 3, Math.PI / 2);
    expect(walled.ok).toBe(false);
    const path = placeCar(world({ roads: () => [{ ...street, c: 'footway' }] }), -100, 3, 0);
    expect(!path.ok && path.why).toBe('a car needs a street — there is none nearby');
    const far = placeCar(world(), -100, 400, 0);
    expect(!far.ok && /street — the nearest is \d+ m north$/.test(far.why)).toBe(true);
  });
});

describe('compass', () => {
  it('names the eight directions in the local frame (+x east, +z south)', () => {
    expect([compass(0, -1), compass(1, 0), compass(0, 1), compass(-1, 0), compass(1, -1), compass(-1, 1)]).toEqual(['north', 'east', 'south', 'west', 'north-east', 'south-west']);
  });
});

describe('never on top of what is already there', () => {
  it('a boat skips the water a moored boat already holds; a car the kerb a parked car holds', () => {
    const moored = { x: 60, z: 5 };
    const p = placeBoat(world({ free: (x, z) => Math.hypot(x - moored.x, z - moored.z) >= 6.5 }), 60, 5, 0);
    expect(p.ok).toBe(true);
    if (p.ok) expect(Math.hypot(p.spot.x - moored.x, p.spot.z - moored.z)).toBeGreaterThanOrEqual(6.5);
    const parked = { x: -100, z: -2 };
    const c = placeCar(world({ free: (x, z) => Math.hypot(x - parked.x, z - parked.z) >= 4.2 }), -100, 3, Math.PI / 2);
    expect(c.ok).toBe(true);
    if (c.ok) expect(Math.hypot(c.spot.x - parked.x, c.spot.z - parked.z)).toBeGreaterThanOrEqual(4.2);
  });
});
