import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { P } from '../src/assets/core';
import { ROLE, critterGeometry, faunaMix, swimSink, type CritterKind } from '../src/assets/fauna';
import { Critters, type CritterEnv } from '../src/sim/critters';
import { castOf, regionStyle } from '../src/world/styles';
import type { Terrain } from '../src/world/data';
import type { WalkWorld } from '../src/player/collision';

// Package #14 (docs/regional-life/models.md build order 14): the new plans — bear†, bovid†, armadillo†,
// swimmer† — as the American black bear, the bison, the nine-banded armadillo and the manatee
const has = (p: number[], k: CritterKind, month?: number) => {
  const st = regionStyle(p[0], p[1]);
  return Object.values(faunaMix(st.region, st.climate, castOf(st), month)).flat().some(([kk]) => kk === k);
};
const T = {
  ASHEVILLE: [35.6, -82.55], SEATTLE: [47.61, -122.33], DENVER: [39.74, -104.99], ORLANDO: [28.54, -81.38], LAKE_PLACID: [44.28, -73.98], BOSTON: [42.36, -71.06],
  WICHITA: [37.69, -97.34], OMAHA: [41.26, -95.93], CHICAGO: [41.88, -87.63], SACRAMENTO: [38.58, -121.49], PHOENIX: [33.45, -112.07], CHEYENNE: [41.14, -104.82],
  ATLANTA: [33.75, -84.39], DALLAS: [32.78, -96.8], HOUSTON: [29.76, -95.37], MIAMI: [25.76, -80.19], SPRINGFIELD_MO: [37.21, -93.29], SAVANNAH: [32.08, -81.09],
};
const box = (g: THREE.BufferGeometry, part?: number) => {
  const p = g.getAttribute('position'), a = g.getAttribute('aPart'), b = new THREE.Box3();
  for (let i = 0; i < p.count; i++) if (part === undefined || Math.abs(a.getX(i) - part) < 0.5) b.expandByPoint(new THREE.Vector3(p.getX(i), p.getY(i), p.getZ(i)));
  return b;
};
const lawn = { heightAt: () => 0, sdfAt: () => 40, coverAt: () => 10, oceanDistAt: () => 5000 } as unknown as Terrain;
const walk = { buildingAt: () => -1, blocked: () => false } as unknown as WalkWorld;
type Any = Record<string, unknown>;
const list = (c: Critters) => (c as unknown as { list: Any[] }).list;
const env = (o: Partial<CritterEnv> = {}): CritterEnv => ({ hour: 23, night: 0.9, month: 6, wind: 0.2, south: false, camFwd: new THREE.Vector3(0, 0, -1), trees: () => [], gardens: () => [], movers: [], ...o });
const animal = (kind: string, x: number, z: number, o: Any = {}): Any => ({ kind, x, y: 0, z, yaw: 0, pitch: 0, state: 'idle', t: 30, tx: x, tz: z, ty: 0, phase: 0, amt: 0, s: 1, c: new THREE.Color(), seed: 7, vig: 0.5, ...o });

describe('the new plans: bear, bison, armadillo, manatee', () => {
  it("each region's own (ranges.md): the bear in the forested mountains, the swamps and Florida, never the open Plains, the Corn Belt, the Central Valley or the low desert; the bison the western Plains' and the Rockies'; the armadillo the South's to Kansas; the manatee Florida's", () => {
    for (const p of [T.ASHEVILLE, T.SEATTLE, T.DENVER, T.ORLANDO, T.LAKE_PLACID]) expect(has(p, 'blackbear', 6), `${p}`).toBe(true);
    for (const p of [T.WICHITA, T.OMAHA, T.CHICAGO, T.SACRAMENTO, T.PHOENIX]) expect(has(p, 'blackbear', 6), `${p}`).toBe(false);
    expect(has(T.LAKE_PLACID, 'blackbear', 1)).toBe(false); // (denned up)
    expect(has(T.ORLANDO, 'blackbear', 1)).toBe(true);
    for (const p of [T.CHEYENNE, T.DENVER]) expect(has(p, 'bison'), `${p}`).toBe(true);
    for (const p of [T.BOSTON, T.ATLANTA, T.OMAHA]) expect(has(p, 'bison'), `${p}`).toBe(false);
    for (const p of [T.DALLAS, T.HOUSTON, T.MIAMI, T.ATLANTA, T.SPRINGFIELD_MO, T.WICHITA]) expect(has(p, 'armadillo'), `${p}`).toBe(true);
    for (const p of [T.BOSTON, T.CHICAGO, T.DENVER, T.OMAHA, T.SEATTLE]) expect(has(p, 'armadillo'), `${p}`).toBe(false);
    expect(has(T.MIAMI, 'manatee', 1)).toBe(true);
    expect(has(T.SAVANNAH, 'manatee', 7)).toBe(true);
    expect(has(T.SAVANNAH, 'manatee', 1)).toBe(false);
    for (const p of [T.BOSTON, T.SEATTLE, T.DALLAS]) expect(has(p, 'manatee', 7), `${p}`).toBe(false);
    expect([ROLE.blackbear, ROLE.bison, ROLE.armadillo, ROLE.manatee]).toEqual(['browser', 'herd', 'forager', 'waterfowl']);
  });
  it("each its own build: the bear's hump-less rounded bulk, the bison's hump the highest thing about it, over the shoulders, its horns; the armadillo's banded shell; the manatee legless, its paddle wider than its body is deep", () => {
    const bear = box(critterGeometry('blackbear'));
    expect(bear.max.z - bear.min.z).toBeGreaterThan(1.4); // (1.5–1.8 m long)
    expect(Math.abs(bear.min.y)).toBeLessThan(0.03);
    const bison = critterGeometry('bison'), bb = box(bison);
    expect(bb.max.y).toBeGreaterThan(1.8); // (1.8 m at the hump)
    expect(box(bison, 9).isEmpty()).toBe(false); // (its horns)
    const p = bison.getAttribute('position');
    let topZ = 0, topY = -1;
    for (let i = 0; i < p.count; i++) if (p.getY(i) > topY) (topY = p.getY(i)), (topZ = p.getZ(i));
    expect(topZ).toBeLessThan(0); // (the high point forward, over the shoulders)
    const arm = box(critterGeometry('armadillo'));
    expect(arm.max.z - arm.min.z).toBeGreaterThan(0.65); // (75 cm with its tail)
    const man = critterGeometry('manatee');
    expect(box(man, P.hind).isEmpty()).toBe(true);
    const tail = box(man, P.tail);
    expect(tail.max.x - tail.min.x).toBeGreaterThan(0.9);
    expect(swimSink('manatee')).toBeGreaterThan(0.7); // (only its back and snout at the surface)
  });
  it('a bear stands up to look before it goes; a sow keeps her cubs by her, and a cub goes up a tree; an armadillo jumps straight up; a manatee pays you no mind; a bison rolls in its wallow and wears its horns', () => {
    const asheville = castOf(regionStyle(T.ASHEVILLE[0], T.ASHEVILLE[1]));
    // the bear: 20 m off (inside its 28, outside its close bolt): stands up, then goes
    const c = new Critters(lawn, walk), bear = animal('blackbear', 0, -20);
    list(c).push(bear);
    const seen = new Set<string>();
    for (let i = 0; i < 100; i++) { c.update(0.05, 0, 0, env({ place: asheville })); seen.add(`${bear.state}:${!!bear.sit}`); }
    expect(seen.has('idle:true')).toBe(true);
    expect(seen.has('flee:false')).toBe(true);
    // a sow and her cubs: they keep by her; startled near a tree, a cub climbs it
    const c2 = new Critters(lawn, walk), sow = animal('blackbear', 0, -60), cubs = [animal('blackbear', 3, -62, { s: 0.42, lead: sow }), animal('blackbear', -2, -63, { s: 0.42, lead: sow })];
    list(c2).push(sow, ...cubs);
    for (let i = 0; i < 1200; i++) c2.update(0.05, 0, 0, env({ place: asheville, hour: 7, night: 0.1 }));
    for (const cub of cubs) expect(Math.hypot((cub.x as number) - (sow.x as number), (cub.z as number) - (sow.z as number))).toBeLessThan(9);
    const tree = { x: (cubs[0].x as number) + 2, z: (cubs[0].z as number) + 1, trunk: 5, r: 0.3 };
    for (let i = 0; i < 160; i++) c2.update(0.05, cubs[0].x as number, (cubs[0].z as number) + 12, env({ place: asheville, hour: 7, night: 0.1, trees: () => [tree] }));
    expect(['climb', 'perch']).toContain(cubs[0].state);
    // an armadillo: up in the air, then off
    const c3 = new Critters(lawn, walk), arm = animal('armadillo', 0, -4);
    list(c3).push(arm);
    c3.update(0.05, 0, 0, env());
    expect(arm.yip).toBeDefined();
    expect(arm.state).toBe('flee');
    // a manatee: you can stand at its side
    const c4 = new Critters(lawn, walk), man = animal('manatee', 0, -2, { wl: 0 });
    list(c4).push(man);
    for (let i = 0; i < 40; i++) c4.update(0.05, 0, 0, env());
    expect(['idle', 'move']).toContain(man.state);
    // bison: a wallow now and then; horns on every one (bulls and cows)
    const c5 = new Critters(lawn, walk), denver = castOf(regionStyle(T.DENVER[0], T.DENVER[1]));
    const herd = [0, 1, 2, 3].map((i) => animal('bison', i * 6, -70, { t: 0, seed: 100 + i * 37 }));
    list(c5).push(...herd);
    let wallowed = false;
    for (let i = 0; i < 2400; i++) { c5.update(0.05, 0, 0, env({ place: denver, hour: 12, night: 0, urban: 0, camFwd: new THREE.Vector3(0, -1, 0) })); if (herd.some((b) => b.state === 'wallow')) wallowed = true; }
    expect(wallowed).toBe(true);
    const anim = (c5 as unknown as { meshes: Map<string, { m: THREE.InstancedMesh; anim: THREE.InstancedBufferAttribute }> }).meshes.get('bison')!;
    for (let i = 0; i < anim.m.count; i++) expect(anim.anim.getZ(i)).toBeGreaterThanOrEqual(10);
  });
});
