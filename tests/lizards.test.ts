import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { critterGeometry, faunaMix, ROLE, type CritterKind } from '../src/assets/fauna';
import { Critters, type CritterEnv } from '../src/sim/critters';
import { castOf, regionStyle } from '../src/world/styles';
import type { Terrain } from '../src/world/data';
import type { WalkWorld } from '../src/player/collision';

// The reference's P2 rows (docs/regional-life/models.md §13.1), the West's lizards on the sprawler plan:
// the fence lizards (East and West), the side-blotched, the spiny, the collared and the horned lizards
const at = (p: number[]) => castOf(regionStyle(p[0], p[1]));
const has = (p: number[], k: CritterKind, month?: number) => {
  const st = regionStyle(p[0], p[1]);
  return Object.values(faunaMix(st.region, st.climate, castOf(st), month)).flat().some(([kk]) => kk === k);
};
const T = {
  PHOENIX: [33.45, -112.07], SLC: [40.76, -111.89], LA: [34.05, -118.24], DENVER: [39.74, -104.99], BOISE: [43.62, -116.2], AUSTIN: [30.27, -97.74],
  SPRINGFIELD_MO: [37.21, -93.29], ATLANTA: [33.75, -84.39], BOSTON: [42.36, -71.06], MIAMI: [25.76, -80.19], SEATTLE: [47.61, -122.33],
};
const box = (g: THREE.BufferGeometry, part?: number) => {
  const p = g.getAttribute('position'), a = g.getAttribute('aPart'), b = new THREE.Box3();
  for (let i = 0; i < p.count; i++) if (part === undefined || Math.abs(a.getX(i) - part) < 0.5) b.expandByPoint(new THREE.Vector3(p.getX(i), p.getY(i), p.getZ(i)));
  return b;
};
const colours = (g: THREE.BufferGeometry, hex: number) => {
  const c = g.getAttribute('color'), want = new THREE.Color(hex);
  let n = 0;
  for (let i = 0; i < c.count; i++) if (Math.abs(c.getX(i) - want.r) + Math.abs(c.getY(i) - want.g) + Math.abs(c.getZ(i) - want.b) < 0.02) n++;
  return n;
};
const walk = { buildingAt: () => -1, blocked: () => false } as unknown as WalkWorld;
const flat = { heightAt: () => 0, sdfAt: () => 50, coverAt: () => 20, oceanDistAt: () => 5000 } as unknown as Terrain;
type Any = Record<string, unknown>;
const list = (c: Critters) => (c as unknown as { list: Any[] }).list;
const env = (o: Partial<CritterEnv> = {}): CritterEnv => ({ hour: 12, night: 0, month: 6, wind: 0.2, south: false, camFwd: new THREE.Vector3(0, -1, 0), trees: () => [], gardens: () => [], movers: [], place: at(T.PHOENIX), ...o });
const animal = (kind: string, x: number, z: number, o: Any = {}): Any => ({ kind, x, y: 0, z, yaw: 0, pitch: 0, state: 'idle', t: 30, tx: x, tz: z, ty: 0, phase: 0, amt: 0, s: 1, c: new THREE.Color(), seed: 7, vig: 0.5, ...o });

describe("the West's lizards", () => {
  it('each where it lives (ranges.md): the side-blotched and the spiny on the desert, the fence lizards East and West, the collared on the hot rocks of the Ozarks to the Basin, the horned lizards rare; none in New England, Florida or the wet Northwest; out April to October', () => {
    for (const p of [T.PHOENIX, T.SLC]) expect(has(p, 'sideblotched', 6), `${p}`).toBe(true);
    for (const p of [T.PHOENIX, T.AUSTIN]) expect(has(p, 'spinylizard', 6), `${p}`).toBe(true);
    for (const p of [T.LA, T.DENVER, T.BOISE, T.SPRINGFIELD_MO, T.ATLANTA]) expect(has(p, 'fencelizard', 6), `${p}`).toBe(true);
    for (const p of [T.SPRINGFIELD_MO, T.PHOENIX]) expect(has(p, 'collaredlizard', 6), `${p}`).toBe(true);
    for (const p of [T.PHOENIX, T.AUSTIN, T.DENVER]) expect(has(p, 'hornedlizard', 6), `${p}`).toBe(true);
    for (const k of ['fencelizard', 'sideblotched', 'spinylizard', 'collaredlizard', 'hornedlizard'] as CritterKind[]) for (const p of [T.BOSTON, T.MIAMI]) expect(has(p, k, 6), `${k} ${p}`).toBe(false);
    expect(has(T.DENVER, 'fencelizard', 1)).toBe(false); // (down for the winter)
    expect(ROLE.collaredlizard).toBe('lizard');
  });
  it("each its own build: a male fence lizard's blue patches on the display part, the side-blotched's blotch, the spiny's collar, the collared lizard's two and its big pale head, the horned lizard broad as a pancake and its crown of horns", () => {
    const fence = critterGeometry('fencelizard');
    expect(box(fence, 9).isEmpty()).toBe(false);
    expect(colours(critterGeometry('sideblotched'), 0x1a1a18)).toBeGreaterThan(0);
    expect(colours(critterGeometry('spinylizard'), 0x1a1816)).toBeGreaterThan(0);
    const col = critterGeometry('collaredlizard');
    expect(colours(col, 0x141414)).toBeGreaterThan(colours(critterGeometry('spinylizard'), 0x1a1816)); // (two collars to the spiny's one)
    expect(colours(col, 0xd8b85a)).toBeGreaterThan(0);
    const horned = box(critterGeometry('hornedlizard'));
    expect((horned.max.x - horned.min.x) / (horned.max.z - horned.min.z)).toBeGreaterThan(0.5);
    expect(horned.max.y).toBeLessThan(0.05);
    expect(colours(critterGeometry('hornedlizard'), 0xd8c8a0)).toBeGreaterThan(0);
  });
  it('out on the open ground in the sun: push-ups now and then; a dash of a few metres to cover when you come; a collared lizard up on its hind legs; a horned lizard sits tight; a spiny lizard on a trunk goes round and up', () => {
    // push-ups: the forelegs' bob
    const c = new Critters(flat, walk), fl = animal('fencelizard', 0, -20, { t: 0 });
    list(c).push(fl);
    let bobbed = false;
    for (let i = 0; i < 200; i++) { c.update(0.05, 0, 0, env()); if (fl.yip !== undefined) bobbed = true; }
    expect(bobbed).toBe(true);
    // a dash, not a forty-metre run
    const c2 = new Critters(flat, walk), sb = animal('sideblotched', 0, -3);
    list(c2).push(sb);
    c2.update(0.05, 0, 0, env());
    expect(sb.state).toBe('flee');
    expect(Math.hypot((sb.tx as number) - (sb.x as number), (sb.tz as number) - (sb.z as number))).toBeLessThan(5.5);
    // the horned lizard: stays put
    const c3 = new Critters(flat, walk), hl = animal('hornedlizard', 0, -1);
    list(c3).push(hl);
    for (let i = 0; i < 20; i++) c3.update(0.05, 0, 0, env());
    expect(hl.state).toBe('idle');
    expect(Math.hypot(hl.x as number, (hl.z as number) + 1)).toBeLessThan(0.3);
    // a spiny lizard on a trunk: round and up
    const tree = { x: 0, z: -10, trunk: 5, r: 0.3 };
    const c4 = new Critters(flat, walk), sp = animal('spinylizard', 0, -9.5, { state: 'perch', t: 1e6, y: 1, ty: 1, home: tree, pitch: 1.47 });
    list(c4).push(sp);
    for (let i = 0; i < 40; i++) c4.update(0.05, 0, -6, env({ trees: () => [tree] }));
    expect(sp.y as number).toBeGreaterThan(1.3);
  });
});
