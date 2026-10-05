import { describe, it, expect } from 'vitest';
import { WalkWorld } from '../src/player/collision';
import { carBody, carMove } from '../src/player/vehicles';
import type { Terrain } from '../src/world/data';

// A car's collider is its body: a capsule along it, as long and as wide as the model. It was one
// 1.05 m circle round the car's middle — head on, the nose went 1.15 m into the wall before the
// circle touched it.

const terrain = { heightAt: () => 0.5, sdfAt: () => 50 } as unknown as Terrain; // (flat dry land)
const bounds = { x0: -500, z0: -500, x1: 500, z1: 500 };
const DT = 1 / 60;
type Car = { x: number; z: number; yaw: number; feet: number; model: string };
/** Drive `car` at `speed` m/s along its heading for `secs`, as vehicles.ts does a frame at a time; `each` sees every frame. */
function drive(w: WalkWorld, car: Car, speed: number, secs: number, each?: (c: Car) => void) {
  let metres = 0;
  for (let t = 0; t < secs; t += DT) {
    const dx = -Math.sin(car.yaw) * speed * DT, dz = -Math.cos(car.yaw) * speed * DT;
    const [nx, nz] = carMove(w, car, dx, dz);
    metres += Math.hypot(nx - car.x, nz - car.z);
    car.x = nx;
    car.z = nz;
    each?.(car);
  }
  return metres;
}
// heading +z: forward is (−sin yaw, −cos yaw)
const SOUTH = Math.PI;
const half = (model: string) => { const b = carBody(model); return { front: b.f + b.r, back: b.b + b.r, side: b.r }; };

describe('a car collides with its body, not a circle round its middle (vehicles.ts carBody)', () => {
  it('head on into a wall: the bumper stops at the wall, not a metre into it', () => {
    for (const model of ['sedan', 'pickup', 'hatch', 'van']) {
      const w = new WalkWorld(terrain, bounds);
      w.addPolygon([[-10, 0], [10, 0], [10, 8], [-10, 8]]); // a building whose front is z = 0
      const car = { x: 0.3, z: -12, yaw: SOUTH, feet: 0.5, model };
      const H = half(model);
      let deepest = -Infinity;
      drive(w, car, 25, 2, (c) => (deepest = Math.max(deepest, c.z + H.front)));
      expect(deepest).toBeLessThan(0.02); // (never past the wall's face)
      expect(car.z + H.front).toBeGreaterThan(-0.05); // (and right up to it)
    }
  });

  it('reversing into a wall: the back stops at it (a bike on the rack too)', () => {
    const w = new WalkWorld(terrain, bounds);
    w.addPolygon([[-10, 0], [10, 0], [10, 8], [-10, 8]]);
    const car = { x: 0, z: -9, yaw: 0, feet: 0.5, model: 'suv+bike' }; // (facing north: backing south)
    drive(w, car, -6, 3);
    const H = half('suv+bike');
    expect(car.z + H.back).toBeLessThan(0.02);
    expect(car.z + H.back).toBeGreaterThan(-0.05);
    expect(H.back - H.front).toBeCloseTo(0.33, 2);
  });

  it('a glancing hit slides along the wall, never into it, and keeps going', () => {
    const w = new WalkWorld(terrain, bounds);
    w.addPolygon([[-200, 0], [200, 0], [200, 8], [-200, 8]]);
    // heading east along the wall's face, turned 15° in toward it, from 4 m out
    const yaw = -Math.PI / 2 - (15 * Math.PI) / 180, car = { x: -60, z: -4, yaw, feet: 0.5, model: 'sedan' };
    const b = carBody('sedan');
    // (the body's farthest reach toward the wall: either end of its axis, plus its radius)
    const reach = (c: Car) => { const fz = -Math.cos(c.yaw); return c.z + Math.max(fz * b.f, -fz * b.b) + b.r; };
    let worst = -Infinity;
    const metres = drive(w, car, 15, 3, (c) => (worst = Math.max(worst, reach(c))));
    expect(worst).toBeLessThan(0.02);
    expect(metres).toBeGreaterThan(15 * 3 * Math.cos((15 * Math.PI) / 180) * 0.95); // (it slid on along the wall at speed)
    expect(car.x - -60).toBeGreaterThan(40);
    expect(reach(car)).toBeGreaterThan(-0.05); // (and it's still against it)
  });

  it('drives past a post beside it untouched, and is only nudged by one brushing its side', () => {
    for (const [gap, nudge] of [[0.1, 0], [-0.15, 0.15]]) {
      const w = new WalkWorld(terrain, bounds);
      const b = carBody('sedan'), px = b.r + gap + 0.17; // (a 34 cm post, its near face `gap` clear of the car's side)
      w.addLoop([[px - 0.17, -0.17], [px + 0.17, -0.17], [px + 0.17, 0.17], [px - 0.17, 0.17]]);
      const car = { x: 0, z: -20, yaw: SOUTH, feet: 0.5, model: 'sedan' };
      const metres = drive(w, car, 12, 3.5);
      expect(metres).toBeGreaterThan(12 * 3.5 * 0.97); // (no snag: it never slowed)
      expect(car.z).toBeGreaterThan(20);
      expect(Math.abs(-car.x - nudge)).toBeLessThan(0.02); // (pushed aside by exactly the overlap)
    }
  });

  it('a post in the lane stops the bumper at the post', () => {
    const w = new WalkWorld(terrain, bounds);
    w.addLoop([[-0.17, -0.17], [0.17, -0.17], [0.17, 0.17], [-0.17, 0.17]]);
    const car = { x: 0, z: -20, yaw: SOUTH, feet: 0.5, model: 'sedan' };
    drive(w, car, 12, 3);
    const nose = car.z + half('sedan').front;
    expect(nose).toBeLessThan(-0.17 + 0.02);
    expect(nose).toBeGreaterThan(-0.17 - 0.05);
  });

  it('through a gateway wider than the car, it neither snags nor wanders', () => {
    const w = new WalkWorld(terrain, bounds);
    // a fence across the way with a 2.2 m opening (the car is 1.82 m wide; the old circle was 2.1)
    w.addWall([-30, 0], [-1.1, 0]);
    w.addWall([1.1, 0], [30, 0]);
    const car = { x: 0, z: -15, yaw: SOUTH, feet: 0.5, model: 'sedan' };
    const metres = drive(w, car, 10, 3);
    expect(metres).toBeGreaterThan(10 * 3 * 0.99);
    expect(Math.abs(car.x)).toBeLessThan(0.01);
  });

  it('a fast car on a slow frame stops at a thin fence, not past it', () => {
    for (const ang of [0, 0.3, 0.9]) {
      const w = new WalkWorld(terrain, bounds);
      w.addWall([-40, 0], [40, 0]); // (one wall line, no building behind it)
      const car = { x: 0, z: -4, yaw: SOUTH + ang, feet: 0.5, model: 'pickup' };
      for (let k = 0; k < 20; k++) {
        const [nx, nz] = carMove(w, car, -Math.sin(car.yaw) * 38 * 0.05, -Math.cos(car.yaw) * 38 * 0.05); // (38 m/s, a 0.05 s frame)
        car.x = nx;
        car.z = nz;
      }
      const b = carBody('pickup'), fz = -Math.cos(car.yaw);
      expect(car.z + Math.max(fz * b.f, -fz * b.b) + b.r).toBeLessThan(0.02);
    }
  });

  it('turning into a wall at a standstill pushes the car off it, not its nose through it', () => {
    const w = new WalkWorld(terrain, bounds);
    w.addPolygon([[-10, 0], [10, 0], [10, 8], [-10, 8]]);
    // alongside the wall (heading east), its side 5 cm off; the nose swings toward the wall a frame at a time
    const b = carBody('sedan'), car = { x: 0, z: -b.r - 0.05, yaw: -Math.PI / 2, feet: 0.5, model: 'sedan' };
    for (let k = 0; k < 30; k++) {
      car.yaw += 0.02; // (the nose turning south, into the wall)
      const [nx, nz] = carMove(w, car, -Math.sin(car.yaw) * 0.05, -Math.cos(car.yaw) * 0.05);
      car.x = nx;
      car.z = nz;
      const fz = -Math.cos(car.yaw);
      expect(car.z + Math.max(fz * b.f, -fz * b.b) + b.r).toBeLessThan(0.02);
    }
  });
});
