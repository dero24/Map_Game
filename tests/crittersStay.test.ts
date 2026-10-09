import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { Critters, STAY, type CritterEnv } from '../src/sim/critters';
import type { Terrain } from '../src/world/data';
import type { WalkWorld } from '../src/player/collision';

// Robby, 2026-10-08: "a lot of animals dissapear when i follow them they should be persistent as can be
// without losing performance in the game" — an animal goes only out of sight (STAY).

// a flat open lawn with no buildings, far from the sea
const lawn = { heightAt: () => 0, sdfAt: () => 20, coverAt: () => 30, oceanDistAt: () => 500 } as unknown as Terrain;
const walk = { buildingAt: () => -1, blocked: () => false } as unknown as WalkWorld;
const env = (o: Partial<CritterEnv> = {}): CritterEnv => ({ hour: 12, night: 0, month: 6, wind: 0.2, south: false, camFwd: new THREE.Vector3(0, 0, -1), trees: () => [], gardens: () => [], movers: [], ...o });
type Any = Record<string, unknown>;
const animal = (kind: string, x: number, z: number, o: Any = {}): Any => ({ kind, x, y: 0, z, yaw: 0, pitch: 0, state: 'idle', t: 5, tx: x, tz: z, ty: 0, phase: 0, amt: 0, s: 1, c: new THREE.Color(), seed: 7, vig: 0.5, ...o });
const list = (c: Critters) => (c as unknown as { list: Any[] }).list;
const drawnOf = (c: Critters, kind: string) => (c as unknown as { meshes: Map<string, { m: THREE.InstancedMesh }> }).meshes.get(kind)!.m.count;
/** Only the animals put there: none of the place's others comes (the tests of one animal's ways). */
const alone = (terrain = lawn) => { const c = new Critters(terrain, walk); c.amount = 0; return c; };
/** Walk after `a` (at a walking pace, 2.4 m/s, or `pace`) for `secs`, looking at it; each frame's `see(state, d)`. */
function follow(c: Critters, a: Any, secs: number, e: Partial<CritterEnv>, from: [number, number], see?: (state: string, d: number) => void, pace = 2.4) {
  let [wx, wz] = from;
  for (let t = 0; t < secs / 0.05; t++) {
    const dx = (a.x as number) - wx, dz = (a.z as number) - wz, d = Math.hypot(dx, dz) || 1;
    if (d > 3) { wx += (dx / d) * pace * 0.05; wz += (dz / d) * pace * 0.05; }
    c.update(0.05, wx, wz, env({ ...e, camFwd: new THREE.Vector3(dx / d, 0, dz / d) }));
    if (!list(c).includes(a)) return false;
    see?.(a.state as string, Math.hypot((a.x as number) - wx, (a.z as number) - wz));
  }
  return true;
}

describe('animals you follow stay (STAY)', () => {
  it('a songbird you walk after flushes, comes down again a little way on, and is the same bird for minutes', () => {
    const c = alone(), bird = animal('songbird', 0, -12);
    list(c).push(bird);
    let flights = 0, landings = 0, last = 'idle', far = 0;
    const kept = follow(c, bird, 180, {}, [0, 0], (s, d) => {
      if (s === 'fly' && last !== 'fly') flights++;
      if (s === 'idle' && last === 'alight') landings++;
      last = s; far = Math.max(far, d);
    });
    expect(kept).toBe(true);
    expect(flights).toBeGreaterThan(4); // (it flushed each time you came close…)
    expect(landings).toBeGreaterThan(4); // (…and came down again on the lawn)
    expect(far).toBeLessThan(60);
    expect(bird.y as number).toBeLessThan(15);
  });
  it('a goose you run at flies off its pond and comes down on the water again, or on the lawn by it', () => {
    // a pond west of x = 0 (sdf < 0), the lawn east of it
    const pond = { heightAt: () => 0, sdfAt: (x: number) => x, coverAt: () => 30, oceanDistAt: () => 500 } as unknown as Terrain;
    const c = alone(pond), goose = animal('canadagoose', -30, 0, { wl: 0.0 });
    list(c).push(goose);
    let flights = 0, down = 0, wet = 0, last = 'idle';
    const kept = follow(c, goose, 120, {}, [-30, 6], (s) => {
      if (s === 'fly' && last !== 'fly') flights++;
      if (s === 'idle' && last === 'alight') { down++; if (goose.wl !== undefined) wet++; }
      last = s;
    }, 6); // (a goose paddles off from a walker; run at it and it flies)
    expect(kept).toBe(true);
    expect(flights).toBeGreaterThan(0);
    expect(down).toBeGreaterThan(0);
    expect(wet).toBeGreaterThan(0); // (onto the water, some of the time)
  });
  it('a squirrel up its tree waits while you are close, then comes down head first once you are off, and goes about the lawn', () => {
    const tree = { x: 0, z: -30, trunk: 5, r: 0.3 };
    const c = alone(), sq = animal('squirrel', 0.5, -30, { state: 'perch', t: 0.5, y: 3, ty: 3, home: tree, pitch: 1.47 });
    list(c).push(sq);
    const e = env({ trees: () => [tree] });
    for (let t = 0; t < 100; t++) c.update(0.05, 0, -22, e); // (8 m off: it stays up)
    expect(sq.state).toBe('perch');
    let headDown = false;
    for (let t = 0; t < 200; t++) { c.update(0.05, 0, -5, e); if (sq.state === 'descend') headDown ||= (sq.pitch as number) < -1; } // (25 m off)
    expect(headDown).toBe(true);
    expect(list(c).includes(sq)).toBe(true);
    expect(['idle', 'move']).toContain(sq.state);
    expect(sq.y as number).toBeCloseTo(0, 1);
    // (before: past 18 m it vanished off the bark)
  });
  it('a ground squirrel down its burrow comes up again once you have gone by — not drawn while it is below', () => {
    const c = alone(), g = animal('groundSquirrel', 0, 5);
    list(c).push(g);
    const e = env({ climate: 'arid' });
    for (let t = 0; t < 80; t++) c.update(0.05, 0, 0, e);
    expect(g.state).toBe('dive');
    expect(drawnOf(c, 'groundSquirrel')).toBe(0);
    for (let t = 0; t < 400; t++) c.update(0.05, 0, 40, e); // (you walk on: 35 m off)
    expect(list(c).includes(g)).toBe(true);
    expect(g.state).not.toBe('dive');
    expect(drawnOf(c, 'groundSquirrel')).toBe(1);
  });
  it('past its range an animal stays while it is in sight — a deer off across the field — and goes once you look away; one too small to make out goes', () => {
    const c = alone(), deer = animal('deer', 0, -150, { t: 1e3 }), bird = animal('songbird', 4, -150, { t: 1e3 });
    list(c).push(deer, bird);
    const dawn = { hour: 7, night: 0.2 };
    for (let t = 0; t < 40; t++) c.update(0.05, 0, 0, env({ ...dawn, camFwd: new THREE.Vector3(0, 0, -1) }));
    expect(list(c).includes(deer)).toBe(true);
    expect(list(c).includes(bird)).toBe(false); // (a songbird at 150 m is a pixel: STAY.keep)
    c.update(0.05, 0, 0, env({ ...dawn, camFwd: new THREE.Vector3(0, 0, 1) }));
    expect(list(c).includes(deer)).toBe(false);
    // …and in sight only as far as it can be made out (STAY.max)
    const c2 = alone(), far = animal('deer', 0, -(STAY.max + 20), { t: 1e3 });
    list(c2).push(far);
    c2.update(0.05, 0, 0, env({ ...dawn, camFwd: new THREE.Vector3(0, 0, -1) }));
    expect(list(c2).includes(far)).toBe(false);
  });
  it('out of its hours an animal in sight stays until you look away: no deer vanishing off the field at the hour', () => {
    const c = alone(), deer = animal('deer', 0, -60, { t: 1e3 });
    list(c).push(deer);
    c.update(0.05, 0, 0, env({ hour: 11, night: 0 })); // (a deer's hours are dawn and dusk: past them it goes…)
    expect(list(c).includes(deer)).toBe(true); // (…but not in front of you)
    c.update(0.05, 0, 0, env({ hour: 11, night: 0, camFwd: new THREE.Vector3(0, 0, 1) }));
    expect(list(c).includes(deer)).toBe(false);
  });
  it('a bird flown off over the pavement with nowhere to come down flies on, and goes once out of sight', () => {
    const c = alone(), bird = animal('songbird', 0, -3);
    list(c).push(bird);
    const e = env({ paved: () => true });
    c.update(0.05, 0, 0, e);
    expect(bird.state).toBe('fly');
    let away = false;
    for (let t = 0; t < 400 && list(c).includes(bird); t++) { c.update(0.05, 0, 0, e); away ||= !!bird.away; }
    expect(away).toBe(true);
    expect(list(c).includes(bird)).toBe(false); // (on to the pixel it is past STAY.keep)
  });
  it('following costs nothing: never more of a kind than its cap, and only animals in sight past the range — a few at most', () => {
    const trees = Array.from({ length: 30 }, (_, i) => ({ x: ((i * 37) % 120) - 60, z: -((i * 53) % 200), trunk: 4, r: 0.3 }));
    const c = new Critters(lawn, walk);
    const e = (fwd: THREE.Vector3) => env({ hour: 7.5, night: 0.15, trees: (x: number, z: number, r: number) => trees.filter((t) => Math.hypot(t.x - x, t.z - z) < r), camFwd: fwd });
    let wx = 0, wz = 0, target: Any | null = null, maxFar = 0;
    const meshes = (c as unknown as { meshes: Map<string, { m: THREE.InstancedMesh }> }).meshes;
    for (let t = 0; t < 300 / 0.05; t++) {
      // walk after the nearest animal on the ground; a new one when it's gone
      if (!target || !list(c).includes(target)) target = list(c).filter((o) => o.state === 'idle').sort((a, b) => Math.hypot((a.x as number) - wx, (a.z as number) - wz) - Math.hypot((b.x as number) - wx, (b.z as number) - wz))[0] ?? null;
      const dx = target ? (target.x as number) - wx : 0, dz = target ? (target.z as number) - wz : -1, d = Math.hypot(dx, dz) || 1;
      if (d > 3) { wx += (dx / d) * 2.4 * 0.05; wz += (dz / d) * 2.4 * 0.05; }
      c.update(0.05, wx, wz, e(new THREE.Vector3(dx / d, 0, dz / d)));
      const per: Record<string, number> = {};
      for (const o of list(c)) per[o.kind as string] = (per[o.kind as string] ?? 0) + 1;
      for (const [k, n] of Object.entries(per)) expect(n, k).toBeLessThanOrEqual(meshes.get(k)!.m.instanceMatrix.count);
      maxFar = Math.max(maxFar, list(c).filter((o) => Math.hypot((o.x as number) - wx, (o.z as number) - wz) > STAY.keep).length);
    }
    expect(maxFar).toBeLessThanOrEqual(6);
  });
});
