import { describe, it, expect } from 'vitest';
import { WalkWorld } from '../src/player/collision';
import { landingAt, openGround } from '../src/player/landing';
import type { Terrain } from '../src/world/data';
import type { Door } from '../src/world/buildings';

// Where a teleport puts the walker (main.ts teleportLocal → player/landing.ts). Found by
// tools/playtest.js __TELEPORTS__: random map picks round the shore stood the walker on the water,
// where it couldn't take a single step.

// Land east of x = 0, the sea west of it (deep, well past the shoreline's walkable fringe).
const terrain = { heightAt: (x: number) => (x < 0 ? -3 : 0.5), sdfAt: (x: number) => x } as unknown as Terrain;
const bounds = { x0: -500, z0: -500, x1: 500, z1: 500 };
const canStep = (w: WalkWorld, x: number, z: number) => {
  // (a step any way at all: the walker isn't stuck where it stands)
  for (let a = 0; a < 8; a++) {
    const dx = Math.cos((a / 8) * Math.PI * 2) * 0.1, dz = Math.sin((a / 8) * Math.PI * 2) * 0.1;
    const [nx, nz] = w.move(x, z, dx, dz, 0.32, 0.5);
    if (Math.hypot(nx - x, nz - z) > 0.05) return true;
  }
  return false;
};

describe('teleport landing', () => {
  it('never stands you on the water: the nearest open ground instead', () => {
    const w = new WalkWorld(terrain, bounds);
    expect(w.walkable(-40, 10)).toBe(false);
    const at = landingAt(w, [], -40, 10);
    expect(w.walkable(at.x, at.z)).toBe(true);
    expect(at.x).toBeGreaterThan(-2); // (the shore, not some far field)
    expect(Math.abs(at.z - 10)).toBeLessThan(3);
    expect(canStep(w, at.x, at.z)).toBe(true);
  });

  it('steps you out of a solid building and off a wall', () => {
    const w = new WalkWorld(terrain, bounds);
    w.addPolygon([[10, -5], [20, -5], [20, 5], [10, 5]]); // a building with no rooms
    const inside = landingAt(w, [], 15, 0);
    expect(w.buildingAt(inside.x, inside.z)).toBe(-1);
    expect(w.touching(inside.x, inside.z, 0.45)).toBe(false);
    w.addWall([40, -10], [40, 10]); // a garden wall
    const onWall = landingAt(w, [], 40.1, 0);
    expect(w.touching(onWall.x, onWall.z, 0.45)).toBe(false);
    expect(Math.hypot(onWall.x - 40.1, onWall.z)).toBeLessThan(3);
    // open ground as given stays as given
    expect(openGround(w, 60, 30)).toEqual([60, 30]);
  });

  it('puts you 2.2 m inside the nearest door whose outside is open, never one onto a wall', () => {
    const w = new WalkWorld(terrain, bounds);
    // a house (x 100..110, z −5..5) with its door in the south wall, facing +z
    w.addPolygon([[100, -5], [110, -5], [110, 5], [100, 5]], { floor0: 0.5, floorH: 3, levels: 1 }, { x: 105, z: 5, w: 1 });
    const door: Door = { x: 105, z: 5.2, y: 0.5, nx: 0, nz: 1, fx: 105, fz: 6.4, fy: 0.5, b: 0, w: 1, h: 2.1, wx: 105, wz: 5, col: 0 };
    const at = landingAt(w, [door], 104, 20);
    expect(at.door).toBe(door);
    expect(at.x).toBeCloseTo(105, 6);
    expect(at.z).toBeCloseTo(2.8, 6);
    expect(at.y).toBe(0.5);
    // a wall across its outside: that door is skipped
    w.addWall([100, 5.9], [110, 5.9]);
    const shut = landingAt(w, [door], 104, 20);
    expect(shut.door).toBeUndefined();
    expect(w.buildingAt(shut.x, shut.z)).toBe(-1);
  });
});
