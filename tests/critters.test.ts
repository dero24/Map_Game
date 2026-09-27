import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { Critters, type CritterEnv } from '../src/sim/critters';
import type { Terrain } from '../src/world/data';
import type { WalkWorld } from '../src/player/collision';

// a flat open lawn with no buildings, far from the sea
const terrain = { heightAt: () => 0, sdfAt: () => 20, coverAt: () => 30, oceanDistAt: () => 500 } as unknown as Terrain;
const walk = { buildingAt: () => -1, blocked: () => false } as unknown as WalkWorld;
const env = (o: Partial<CritterEnv> = {}): CritterEnv => ({ hour: 18.5, night: 0.1, month: 6, wind: 0.2, south: false, camFwd: new THREE.Vector3(0, 0, -1), trees: () => [], gardens: () => [], movers: [], ...o });
type Any = Record<string, unknown>;
const animal = (kind: string, x: number, z: number, o: Any = {}): Any => ({ kind, x, y: 0, z, yaw: 0, pitch: 0, state: 'idle', t: 5, tx: x, tz: z, ty: 0, phase: 0, amt: 0, s: 1, c: new THREE.Color(), seed: 7, vig: 0.5, ...o });
const list = (c: Critters) => (c as unknown as { list: Any[] }).list;
const run = (c: Critters, secs: number, e: CritterEnv, wx = 0, wz = -70) => { for (let t = 0; t < secs / 0.05; t++) c.update(0.05, wx, wz, e); };

describe('Critters ecosystem', () => {
  it('animals bolt from a passing car, and the alarm spreads to their neighbours', () => {
    const c = new Critters(terrain, walk);
    const a = animal('rabbit', 10, 0), b = animal('rabbit', 15, 4);
    list(c).push(a, b);
    run(c, 0.05, env({ movers: [{ x: -5, z: 0, vx: 12, vz: 0 }] }));
    expect(a.state).toBe('flee');
    expect(a.tx as number).toBeGreaterThan(10); // away from the car
    expect(c.eco.car).toBeGreaterThanOrEqual(1);
    run(c, 1, env());
    expect(['flee', 'idle', 'move']).toContain(b.state);
    expect(c.eco.alarm).toBeGreaterThanOrEqual(1); // b heard a and ran too
  });

  it('a fox stalks and pounces on a dozy rabbit; a watchful one gets away', () => {
    const c = new Critters(terrain, walk);
    const r = animal('rabbit', 0, 0, { vig: 0, t: 30 }), f = animal('fox', 9, 0, { t: 0 });
    list(c).push(r, f);
    let caught = false;
    for (let k = 0; k < 400 && !caught; k++) { run(c, 0.05, env()); caught = !!r.dead; }
    expect(c.eco.hunts).toBeGreaterThanOrEqual(1);
    expect(caught).toBe(true);

    const c2 = new Critters(terrain, walk);
    const r2 = animal('rabbit', 0, 0, { vig: 1, t: 30 }), f2 = animal('fox', 9, 0, { t: 0 });
    list(c2).push(r2, f2);
    run(c2, 20, env());
    expect(c2.eco.hunts).toBeGreaterThanOrEqual(1);
    expect(!!r2.dead).toBe(false);
    expect(c2.eco.fox).toBeGreaterThanOrEqual(1); // it saw the fox coming
  });

  it('a fox gives the walker a wide berth', () => {
    const c = new Critters(terrain, walk);
    const f = animal('fox', 0, 10);
    list(c).push(f);
    run(c, 0.05, env(), 0, 0);
    expect(f.state).toBe('flee');
  });

  it('the hawk circles and stoops on songbirds in the open, which flush', () => {
    const c = new Critters(terrain, walk);
    const h = animal('hawk', 20, 0, { state: 'soar', y: 32, ty: 32, t: 0, home: { x: 0, z: 0 } });
    const birds = [animal('songbird', 3, 2), animal('songbird', 5, -1), animal('songbird', -2, 4)];
    list(c).push(h, ...birds);
    run(c, 60, env({ hour: 12, night: 0 }));
    expect(c.eco.hunts).toBeGreaterThanOrEqual(1);
    expect(c.eco.hawk).toBeGreaterThanOrEqual(1);
    expect(h.y as number).toBeGreaterThan(5); // back up on the thermal (or still climbing)
  });
});
