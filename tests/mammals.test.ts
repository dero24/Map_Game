import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { ROLE, critterGeometry, faunaMix, sitPivot, type CritterKind } from '../src/assets/fauna';
import { Critters, type CritterEnv } from '../src/sim/critters';
import { beaverLodges, prairieMounds, prairieTown } from '../src/assets/signs';
import { castOf, regionStyle } from '../src/world/styles';
import type { Terrain } from '../src/world/data';
import type { WalkWorld } from '../src/player/collision';

// Package #13 (docs/regional-life/models.md build order 13): the mammals on the existing bases — each
// region's own (docs/regional-life/ranges.md), each known by its marks, each moving as its row says
const kinds = (lat: number, lon: number, month?: number) => {
  const st = regionStyle(lat, lon);
  return new Set(Object.values(faunaMix(st.region, st.climate, castOf(st), month)).flat().map(([k]) => k));
};
const T = {
  BOSTON: [42.36, -71.06], PITTSBURGH: [40.44, -80.0], CHICAGO: [41.88, -87.63], MIAMI: [25.76, -80.19], HOUSTON: [29.76, -95.37], DALLAS: [32.78, -96.8],
  WICHITA: [37.69, -97.34], OMAHA: [41.26, -95.93], CHEYENNE: [41.14, -104.82], DENVER: [39.74, -104.99], SEATTLE: [47.61, -122.33], LA: [34.05, -118.24],
  SLC: [40.76, -111.89], PHOENIX: [33.45, -112.07], ATLANTA: [33.75, -84.39], LAKE_PLACID: [44.28, -73.98], BAR_HARBOR: [44.39, -68.2], EUREKA: [40.8, -124.16],
};
const has = (place: number[], k: CritterKind, month?: number) => kinds(place[0], place[1], month).has(k);
const ANTLER = 9;
const box = (g: THREE.BufferGeometry, part?: number) => {
  const p = g.getAttribute('position'), a = g.getAttribute('aPart'), b = new THREE.Box3();
  for (let i = 0; i < p.count; i++) if (part === undefined || Math.abs(a.getX(i) - part) < 0.5) b.expandByPoint(new THREE.Vector3(p.getX(i), p.getY(i), p.getZ(i)));
  return b;
};
const colour = (g: THREE.BufferGeometry, hex: number) => {
  const c = g.getAttribute('color'), t = new THREE.Color(hex);
  for (let i = 0; i < c.count; i++) if (Math.abs(c.getX(i) - t.r) < 0.004 && Math.abs(c.getY(i) - t.g) < 0.004 && Math.abs(c.getZ(i) - t.b) < 0.004) return true;
  return false;
};
const lawn = { heightAt: () => 0, sdfAt: () => 40, coverAt: () => 30, oceanDistAt: () => 5000 } as unknown as Terrain;
const walk = { buildingAt: () => -1, blocked: () => false } as unknown as WalkWorld;
type Any = Record<string, unknown>;
const list = (c: Critters) => (c as unknown as { list: Any[] }).list;
const mesh = (c: Critters, k: string) => (c as unknown as { meshes: Map<string, { m: THREE.InstancedMesh; anim: THREE.InstancedBufferAttribute }> }).meshes.get(k)!;
const env = (o: Partial<CritterEnv> = {}): CritterEnv => ({ hour: 12, night: 0, month: 6, wind: 0.2, south: false, camFwd: new THREE.Vector3(0, 0, -1), trees: () => [], gardens: () => [], movers: [], ...o });
const animal = (kind: string, x: number, z: number, o: Any = {}): Any => ({ kind, x, y: 0, z, yaw: 0, pitch: 0, state: 'idle', t: 5, tx: x, tz: z, ty: 0, phase: 0, amt: 0, s: 1, c: new THREE.Color(), seed: 7, vig: 0.5, ...o });

describe('the mammals on the existing bases', () => {
  it("each region's own (ranges.md): the fox squirrel west of the East, the chipmunk and woodchuck the East's, the prairie dog and pronghorn west of the 100th meridian, the elk and the bighorn the West's, the moose the north woods'", () => {
    for (const p of [T.CHICAGO, T.WICHITA, T.DALLAS]) expect(has(p, 'foxsquirrel'), `${p}`).toBe(true);
    expect(has(T.BOSTON, 'foxsquirrel')).toBe(false);
    for (const p of [T.BOSTON, T.PITTSBURGH, T.CHICAGO]) for (const k of ['chipmunk', 'woodchuck'] as CritterKind[]) expect(has(p, k, 6), `${k} ${p}`).toBe(true);
    for (const p of [T.MIAMI, T.HOUSTON, T.DENVER, T.SEATTLE, T.LA]) for (const k of ['chipmunk', 'woodchuck'] as CritterKind[]) expect(has(p, k, 6), `${k} ${p}`).toBe(false);
    expect(has(T.BOSTON, 'woodchuck', 1)).toBe(false); // (asleep in January)
    for (const p of [T.CHEYENNE, T.DENVER]) expect(has(p, 'prairiedog'), `${p}`).toBe(true);
    for (const p of [T.WICHITA, T.OMAHA, T.BOSTON, T.LA, T.SEATTLE]) expect(has(p, 'prairiedog'), `${p}`).toBe(false);
    expect(has(T.CHEYENNE, 'pronghorn')).toBe(true);
    for (const p of [T.WICHITA, T.OMAHA, T.BOSTON, T.ATLANTA]) expect(has(p, 'pronghorn'), `${p}`).toBe(false);
    for (const p of [T.DENVER, T.SEATTLE, T.EUREKA]) expect(has(p, 'elk'), `${p}`).toBe(true);
    for (const p of [T.BOSTON, T.MIAMI, T.CHICAGO, T.LA]) expect(has(p, 'elk'), `${p}`).toBe(false);
    for (const p of [T.LAKE_PLACID, T.BAR_HARBOR, T.DENVER]) expect(has(p, 'moose'), `${p}`).toBe(true);
    for (const p of [T.ATLANTA, T.DALLAS, T.LA, T.MIAMI]) expect(has(p, 'moose'), `${p}`).toBe(false);
    expect(has(T.DENVER, 'bighorn')).toBe(true);
    expect(has(T.BOSTON, 'bighorn')).toBe(false);
    for (const p of [T.ATLANTA, T.SEATTLE]) expect(has(p, 'opossum'), `${p}`).toBe(true);
    for (const p of [T.SLC, T.PHOENIX]) expect(has(p, 'opossum'), `${p}`).toBe(false);
    for (const p of [T.BOSTON, T.SEATTLE, T.DENVER, T.ATLANTA]) for (const k of ['raccoon', 'skunk', 'beaver'] as CritterKind[]) expect(has(p, k), `${k} ${p}`).toBe(true);
    expect(ROLE.raccoon).toBe('forager');
    expect(ROLE.elk).toBe('herd');
  });
  it("each known by its marks: the raccoon's mask and ringed tail, the skunk's white V, the chipmunk's stripes, the beaver's paddle, the opossum's white face and naked tail", () => {
    expect(colour(critterGeometry('raccoon'), 0x1e1c1a) && colour(critterGeometry('raccoon'), 0x2a2624)).toBe(true);
    expect(colour(critterGeometry('skunk'), 0xf2f2ee)).toBe(true);
    expect(colour(critterGeometry('chipmunk'), 0x2a2220) && colour(critterGeometry('chipmunk'), 0xe8dcc8)).toBe(true);
    expect(colour(critterGeometry('beaver'), 0x2a2420)).toBe(true);
    expect(colour(critterGeometry('opossum'), 0xeeeae2) && colour(critterGeometry('opossum'), 0xd8a8a0)).toBe(true);
    // the beaver's paddle: broad and flat, behind it
    const bv = box(critterGeometry('beaver'), 5);
    expect(bv.max.x - bv.min.x).toBeGreaterThan((bv.max.y - bv.min.y) * 2.5);
    // the woodchuck stouter than the fox squirrel, the beaver the biggest of the squirrel plan
    const w = (k: CritterKind) => { const b = box(critterGeometry(k)); return b.max.x - b.min.x; };
    expect(w('woodchuck')).toBeGreaterThan(w('foxsquirrel'));
    expect(w('beaver')).toBeGreaterThan(w('woodchuck'));
  });
  it('antlers and horns: the deer family carries them on the head (its own part, hidden on the cows and does); an elk\'s rack towers, a moose\'s palms spread wide, a ram\'s curl stays low by the ear', () => {
    for (const k of ['deer', 'muleDeer', 'elk', 'moose', 'pronghorn', 'bighorn'] as CritterKind[]) expect(box(critterGeometry(k), ANTLER).isEmpty(), k).toBe(false);
    for (const k of ['fox', 'raccoon', 'rabbit', 'squirrel'] as CritterKind[]) expect(box(critterGeometry(k), ANTLER).isEmpty(), k).toBe(true);
    const head = (k: CritterKind) => box(critterGeometry(k), 6).max.y, ant = (k: CritterKind) => box(critterGeometry(k), ANTLER);
    expect(ant('elk').max.y - head('elk')).toBeGreaterThan(0.6);
    expect(ant('moose').max.x - ant('moose').min.x).toBeGreaterThan(1);
    expect(ant('bighorn').max.y - head('bighorn')).toBeLessThan(0.15);
    expect(box(critterGeometry('moose')).max.y).toBeGreaterThan(box(critterGeometry('elk')).max.y * 0.9); // (the tallest deer)
  });
  it('the sim: a bull wears his rack in the fall, not in May, and a cow never; a raccoon goes up a tree; an opossum plays dead; a skunk warns with its tail up', () => {
    const pose = (month: number, seed: number) => {
      const c = new Critters(lawn, walk), e = animal('elk', 0, -25, { seed, t: 30 }); // (inside the night's 30 m)
      list(c).push(e);
      c.update(0.05, 0, 0, env({ month, hour: 23, night: 0.9 }));
      return mesh(c, 'elk').anim.getZ(0);
    };
    expect(pose(10, 1)).toBeGreaterThanOrEqual(10); // (seed 1: a bull)
    expect(pose(5, 1)).toBeLessThan(10);
    expect(pose(10, 900)).toBeLessThan(10); // (a cow)
    // a raccoon near a tree, startled: up it
    const c = new Critters(lawn, walk), r = animal('raccoon', 0, -6, { t: 30 });
    list(c).push(r);
    const tree = { x: 2, z: -8, trunk: 4, r: 0.3 };
    for (let i = 0; i < 80; i++) c.update(0.05, 0, 0, env({ hour: 23, night: 0.9, trees: () => [tree] }));
    expect(['climb', 'perch']).toContain(r.state);
    // an opossum, come upon close: plays dead on its side, then gets up and ambles off
    const c2 = new Critters(lawn, walk), o = animal('opossum', 0, -4, { t: 30 });
    list(c2).push(o);
    c2.update(0.05, 0, 0, env({ hour: 23, night: 0.9 }));
    expect(o.state).toBe('possum');
    for (let i = 0; i < 20; i++) c2.update(0.05, 0, 0, env({ hour: 23, night: 0.9 }));
    expect(o.roll as number).toBeGreaterThan(1.3);
    // (it lies there while you stand over it; once you've walked off a way, it gets up)
    for (let i = 0; i < 400; i++) c2.update(0.05, 0, 18, env({ hour: 23, night: 0.9 }));
    expect(o.state).not.toBe('possum');
    // a skunk: faces you, tail up (the display pose), then waddles off
    const c3 = new Critters(lawn, walk), sk = animal('skunk', 0, -6, { t: 30 });
    list(c3).push(sk);
    c3.update(0.05, 0, 0, env({ hour: 23, night: 0.9 }));
    expect(sk.state).toBe('warn');
    expect(mesh(c3, 'skunk').anim.getZ(0) % 10).toBe(4);
  });
  it('a prairie dog town: the dogs only in it, sitting up as sentries; a herd keeps together and runs together; an animal well behind the walker is not drawn', () => {
    // find a town and stand in it
    let town: { x: number; z: number; r: number } | null = null;
    for (let x = 0; x < 20000 && !town; x += 50) town = prairieTown(x, 400) ?? prairieTown(x, 1200);
    expect(town).not.toBeNull();
    const c = new Critters(lawn, walk), place = castOf(regionStyle(T.CHEYENNE[0], T.CHEYENNE[1]));
    let sat = false;
    for (let i = 0; i < 2400; i++) {
      c.update(0.05, town!.x, town!.z, env({ place, hour: 11, camFwd: new THREE.Vector3(0, -1, 0) }));
      for (const o of list(c)) if (o.kind === 'prairiedog') { expect(prairieTown(o.x as number, o.z as number), 'in its town').not.toBeNull(); if (o.sit) sat = true; }
    }
    expect(list(c).filter((o) => o.kind === 'prairiedog').length).toBeGreaterThan(3);
    expect(sat).toBe(true);
    expect(sitPivot('prairiedog')).toBeGreaterThan(0);
    // a herd: startle one elk and the rest go with it
    const c2 = new Critters(lawn, walk);
    const herd = [animal('elk', 0, -60, { t: 30 }), animal('elk', 6, -64, { t: 30 }), animal('elk', -8, -70, { t: 30 }), animal('elk', 12, -75, { t: 30 })];
    list(c2).push(...herd);
    const denver = castOf(regionStyle(T.DENVER[0], T.DENVER[1]));
    for (let i = 0; i < 40; i++) c2.update(0.05, 0, -20, env({ hour: 7, place: denver })); // (40 m off: inside an elk's 45)
    expect(herd.filter((e) => e.state === 'flee').length).toBeGreaterThanOrEqual(3);
    // drawing: walking north, a deer 30 m behind isn't drawn, one ahead is
    const c3 = new Critters(lawn, walk);
    list(c3).push(animal('deer', 0, 30, { t: 30 }), animal('deer', 0, -30, { t: 30 }));
    c3.update(0.05, 0, 0, env({ hour: 23, night: 0.9 }));
    expect(mesh(c3, 'deer').m.count).toBe(1); // (two deer, one drawn)
    expect(c3.drawn.behind).toBeGreaterThanOrEqual(1);
    // looking down from the air, all of them are
    const c4 = new Critters(lawn, walk);
    list(c4).push(animal('deer', 0, 30, { t: 30 }), animal('deer', 0, -30, { t: 30 }));
    c4.update(0.05, 0, 0, env({ hour: 23, night: 0.9, camFwd: new THREE.Vector3(0, -1, 0) }));
    expect(mesh(c4, 'deer').m.count).toBe(2);
  });
  it("the signs: a beaver's lodge out in a pond, never the sea; a prairie dog town's mounds only in the town, the same however the land is tiled", () => {
    const sdf = (x: number, z: number) => z - 40 * Math.sin(x / 150), h = (x: number, z: number) => (sdf(x, z) > 0 ? 0.5 : -1.2);
    const lodges = beaverLodges({ x0: 0, z0: -2700, x1: 5400, z1: 2700 }, sdf, () => 5000, h);
    expect(lodges.length).toBeGreaterThan(2);
    for (const l of lodges) { expect(sdf(l.x, l.z)).toBeLessThanOrEqual(-2); expect(sdf(l.x, l.z)).toBeGreaterThanOrEqual(-9); }
    expect(beaverLodges({ x0: 0, z0: -2700, x1: 5400, z1: 2700 }, sdf, () => 0, h)).toEqual([]); // (the sea)
    const zone = { x0: 0, z0: 0, x1: 4000, z1: 4000 };
    const all = prairieMounds(zone, () => true, () => 0);
    expect(all.length).toBeGreaterThan(20);
    for (const m of all) expect(prairieTown(m.x, m.z)).not.toBeNull();
    const tiled = [];
    for (let x = 0; x < 4000; x += 1000) for (let z = 0; z < 4000; z += 1000) tiled.push(...prairieMounds({ x0: x, z0: z, x1: x + 1000, z1: z + 1000 }, () => true, () => 0));
    expect(tiled.length).toBe(all.length);
  });
});
