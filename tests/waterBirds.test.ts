import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { ROLE, critterGeometry, critterMaterial, faunaMix, swimSink, type CritterKind } from '../src/assets/fauna';
import { P } from '../src/assets/core';
import { ospreyNests } from '../src/assets/signs';
import { Critters, type CritterEnv } from '../src/sim/critters';
import { castOf, regionStyle } from '../src/world/styles';
import type { Terrain } from '../src/world/data';
import type { WalkWorld } from '../src/player/collision';

// Package #12 (docs/regional-life/models.md build order 12): the water and big birds — on the ponds and
// lakes, at their edges, on the beaches and lots, walking the fields, over our heads; each region's own,
// in its season
const at = (lat: number, lon: number, month?: number) => {
  const st = regionStyle(lat, lon);
  return faunaMix(st.region, st.climate, castOf(st), month);
};
const kinds = (lat: number, lon: number, month?: number) => new Set(Object.values(at(lat, lon, month)).flat().map(([k]) => k));
const BOSTON = [42.36, -71.06], MIAMI = [25.76, -80.19], ORLANDO = [28.54, -81.38], SEATTLE = [47.61, -122.33], LA = [34.05, -118.24], DENVER = [39.74, -104.99];
const SLC = [40.76, -111.89], CHICAGO = [41.88, -87.63], ATLANTA = [33.75, -84.39], OMAHA = [41.26, -95.93], DALLAS = [32.78, -96.8], PHOENIX = [33.45, -112.07], CAPE_MAY = [38.94, -74.9];
const has = (g: THREE.BufferGeometry, hex: number) => {
  const c = g.getAttribute('color'), t = new THREE.Color(hex);
  for (let i = 0; i < c.count; i++) if (Math.abs(c.getX(i) - t.r) < 0.004 && Math.abs(c.getY(i) - t.g) < 0.004 && Math.abs(c.getZ(i) - t.b) < 0.004) return true;
  return false;
};
const box = (g: THREE.BufferGeometry, part?: number) => {
  const p = g.getAttribute('position'), a = g.getAttribute('aPart'), b = new THREE.Box3();
  for (let i = 0; i < p.count; i++) if (part === undefined || Math.abs(a.getX(i) - part) < 0.5) b.expandByPoint(new THREE.Vector3(p.getX(i), p.getY(i), p.getZ(i)));
  return b;
};

// a lake to the north of z = 0 (the water's signed distance is z: negative on the water), lawn to the south
const lake = { heightAt: (_x: number, z: number) => (z > 0 ? 0.5 : -1.5), sdfAt: (_x: number, z: number) => z, coverAt: () => 30, oceanDistAt: () => 500 } as unknown as Terrain;
// the sea the same way: the beach along z = 0, the ocean north of it
const sea = { heightAt: (_x: number, z: number) => (z > 0 ? 0.4 : -2), sdfAt: (_x: number, z: number) => z, coverAt: () => 60, oceanDistAt: (_x: number, z: number) => Math.max(0, z) } as unknown as Terrain;
const walk = { buildingAt: () => -1, blocked: () => false } as unknown as WalkWorld;
type Any = Record<string, unknown>;
const list = (c: Critters) => (c as unknown as { list: Any[] }).list;
const env = (o: Partial<CritterEnv> = {}): CritterEnv => ({ hour: 9, night: 0, month: 7, wind: 0.2, south: false, camFwd: new THREE.Vector3(0, 0, -1), trees: () => [], gardens: () => [], movers: [], place: castOf(regionStyle(CAPE_MAY[0], CAPE_MAY[1])), ...o });
const animal = (kind: string, x: number, z: number, o: Any = {}): Any => ({ kind, x, y: 0, z, yaw: 0, pitch: 0, state: 'idle', t: 5, tx: x, tz: z, ty: 0, phase: 0, amt: 0, s: 1, c: new THREE.Color(), seed: 7, vig: 0.5, ...o });

describe('the water and big birds', () => {
  it("each region's own: the spoonbill in Florida, the laughing gull on the East and Gulf coasts and the California gull in the West, the California quail its own; the turkey everywhere", () => {
    for (const [lat, lon] of [MIAMI, ORLANDO]) expect(kinds(lat, lon), `${lat},${lon}`).toContain('spoonbill');
    for (const [lat, lon] of [BOSTON, SEATTLE, DENVER, CHICAGO, LA]) expect(kinds(lat, lon), `${lat},${lon}`).not.toContain('spoonbill');
    for (const [lat, lon] of [BOSTON, MIAMI, CAPE_MAY]) expect(kinds(lat, lon), `${lat},${lon}`).toContain('laughinggull');
    for (const [lat, lon] of [SEATTLE, LA, SLC]) {
      expect(kinds(lat, lon), `${lat},${lon}`).toContain('californiagull');
      expect(kinds(lat, lon), `${lat},${lon}`).not.toContain('laughinggull');
    }
    for (const [lat, lon] of [BOSTON, MIAMI, ATLANTA, CHICAGO]) expect(kinds(lat, lon), `${lat},${lon}`).not.toContain('californiagull');
    for (const [lat, lon] of [LA, SLC]) expect(kinds(lat, lon), `${lat},${lon}`).toContain('californiaquail');
    for (const [lat, lon] of [PHOENIX, BOSTON, ATLANTA]) expect(kinds(lat, lon), `${lat},${lon}`).not.toContain('californiaquail');
    expect(kinds(PHOENIX[0], PHOENIX[1])).toContain('quail'); // (the desert's own)
    for (const [lat, lon] of [BOSTON, ATLANTA, DENVER, LA, SEATTLE, DALLAS, CHICAGO]) {
      const k = kinds(lat, lon);
      for (const b of ['wildturkey', 'canadagoose', 'mallard', 'greatblueheron', 'turkeyvulture', 'baldeagle', 'osprey'] as CritterKind[]) expect(k, `${b} at ${lat},${lon}`).toContain(b);
    }
    expect(kinds(DENVER[0], DENVER[1])).not.toContain('greategret'); // (all but the Rockies)
    for (const [lat, lon] of [DENVER, CHICAGO, PHOENIX, SLC]) expect(kinds(lat, lon), `${lat},${lon}`).not.toContain('brownpelican');
    for (const b of ['canadagoose', 'mallard', 'loon']) expect(ROLE[b as CritterKind]).toBe('waterfowl');
  });
  it('each in its season: the loons on the northern lakes in summer and the southern coasts in winter, the vultures, ospreys and egrets gone south, the cranes passing through the Plains, the pelicans\' summer in New Jersey', () => {
    const k = (p: number[], m: number) => kinds(p[0], p[1], m);
    expect(k(CHICAGO, 7)).toContain('loon');
    expect(k(CHICAGO, 1)).not.toContain('loon');
    expect(k(MIAMI, 1)).toContain('loon');
    expect(k(MIAMI, 7)).not.toContain('loon');
    expect(k(BOSTON, 7)).toContain('loon');
    expect(k(BOSTON, 1)).toContain('loon'); // (on the ocean)
    expect(k(BOSTON, 7)).toContain('turkeyvulture');
    expect(k(BOSTON, 1)).not.toContain('turkeyvulture');
    expect(k(ATLANTA, 1)).toContain('turkeyvulture');
    expect(k(CHICAGO, 1)).not.toContain('osprey');
    expect(k(MIAMI, 1)).toContain('osprey');
    expect(k(ORLANDO, 7)).toContain('sandhillcrane');
    expect(k(OMAHA, 3)).toContain('sandhillcrane');
    expect(k(OMAHA, 7)).not.toContain('sandhillcrane');
    expect(k(CAPE_MAY, 7)).toContain('brownpelican');
    expect(k(CAPE_MAY, 1)).not.toContain('brownpelican');
    expect(k(CAPE_MAY, 1)).not.toContain('laughinggull');
    expect(k(CHICAGO, 1)).not.toContain('greategret');
    // the year-round birds stay; a role emptied by the season goes (no empty lists)
    expect(k(CHICAGO, 1)).toContain('canadagoose');
    for (const list of Object.values(at(BOSTON[0], BOSTON[1], 1))) expect(list!.length).toBeGreaterThan(0);
  });
  it('the bird plan: long necks, the bills (flat, dagger, spoon, pouch, hook), a goose\'s chinstrap, a vulture\'s bare red head and silver flight feathers, a gull\'s black wingtips; a loon without legs', () => {
    const g = (k: CritterKind) => critterGeometry(k);
    // the heron stands a metre high, its head well above its back on the neck
    const heron = g('greatblueheron');
    expect(box(heron).max.y).toBeGreaterThan(0.85);
    expect(box(heron, P.skull).max.y - box(heron, P.body).max.y).toBeGreaterThan(0.3);
    expect(box(g('sandhillcrane')).max.y).toBeGreaterThan(box(heron).max.y * 0.95);
    // the goose's black neck and white chinstrap; the drake's green head and white collar
    expect(has(g('canadagoose'), 0x1a1a1c) && has(g('canadagoose'), 0xf2f0ea)).toBe(true);
    expect(has(g('mallard'), 0x2a6a40) && has(g('mallard'), 0xf2f2ee)).toBe(true);
    expect(has(g('mallardhen'), 0x3a50a0)).toBe(true); // (the hen's blue speculum)
    // the bills: the spoonbill's spoon and the pelican's pouch reach well out in front of the face
    expect(box(g('spoonbill'), P.skull).min.z).toBeLessThan(box(g('spoonbill'), P.body).min.z - 0.25);
    expect(has(g('brownpelican'), 0x6a6458)).toBe(true); // (the pouch)
    expect(has(g('turkeyvulture'), 0xb84030) && has(g('turkeyvulture'), 0x8a8884)).toBe(true);
    expect(has(g('baldeagle'), 0xf2f2ee)).toBe(true);
    for (const k of ['laughinggull', 'californiagull'] as CritterKind[]) expect(has(g(k), 0x1a1a1c), k).toBe(true);
    expect(has(g('wildturkey'), 0xc03030) && has(g('wildturkey'), 0x8aa4cc)).toBe(true); // (the wattle, the blue head)
    expect(box(g('loon'), P.fore).isEmpty()).toBe(true);
    expect(box(g('canadagoose'), P.fore).isEmpty()).toBe(false); // (a goose walks the lawns too)
    // the wings held out: a vulture's V, a hawk's shallow dihedral, an eagle's flat plank; the waders and gulls glide
    const flap = (k: CritterKind) => (critterMaterial(k).uniforms.uFlap.value as THREE.Vector3);
    expect(flap('turkeyvulture').z).toBeGreaterThan(flap('hawk').z);
    expect(flap('hawk').z).toBeGreaterThan(flap('baldeagle').z);
    for (const k of ['greatblueheron', 'laughinggull', 'brownpelican'] as CritterKind[]) expect(flap(k).y, k).toBe(3);
    expect(flap('turkeyvulture').y).toBe(1);
    expect(flap('butterfly').y).toBe(2);
    expect(swimSink('canadagoose')).toBeGreaterThan(0.1);
  });
  it('on the lake: the geese and ducks swim on its water at its level (and stay on it), some geese graze the lawn by it, the herons stand at its edge', () => {
    const c = new Critters(lake, walk);
    const seen = new Map<string, Any[]>();
    // (walking the shore path, 30 m back from the water, the birds coming and going)
    for (let t = 0; t < 3000; t++) {
      c.update(0.05, t * 0.05 * 1.4, 30, env({ hour: 8 }));
      if (t % 100 === 99) for (const o of list(c)) seen.set(o.kind as string, [...(seen.get(o.kind as string) ?? []), { ...o }]);
    }
    const swimmers = [...seen.entries()].filter(([k]) => ROLE[k as CritterKind] === 'waterfowl').flatMap(([, l]) => l);
    const onWater = swimmers.filter((o) => o.wl !== undefined), onLawn = swimmers.filter((o) => o.wl === undefined);
    expect(onWater.length).toBeGreaterThan(5);
    for (const o of onWater) {
      expect(o.z as number).toBeLessThan(-1.2); // (on the water)
      expect(o.wl as number).toBeCloseTo(0.5, 1); // (the lake's level: its shore's ground)
      expect(o.y as number).toBeLessThan(0.56); // (sitting in it)
    }
    for (const o of onLawn) expect(o.z as number).toBeGreaterThan(2);
    expect(onLawn.some((o) => o.kind === 'canadagoose')).toBe(true);
    const waders = [...seen.entries()].filter(([k]) => ROLE[k as CritterKind] === 'wader').flatMap(([, l]) => l);
    expect(waders.length).toBeGreaterThan(0);
    for (const o of waders) expect(Math.abs(o.z as number)).toBeLessThan(2.5);
    // turkeys come in flocks
    const turkeys = list(c).filter((o) => o.kind === 'wildturkey' && (o.state === 'idle' || o.state === 'move'));
    if (turkeys.length >= 3) {
      let near = 0;
      for (const a of turkeys) if (turkeys.some((b) => b !== a && Math.hypot((a.x as number) - (b.x as number), (a.z as number) - (b.z as number)) < 9)) near++;
      expect(near / turkeys.length).toBeGreaterThan(0.6);
    }
  });
  it('the loon slips under when you come close and comes up well away; the heron flies off heavy; a goose on the water only paddles off', () => {
    const c = new Critters(lake, walk);
    const loon = animal('loon', 0, -30, { wl: 0.5 }), heron = animal('greatblueheron', 20, -0.5, { wl: 0.5 }), goose = animal('canadagoose', -20, -20, { wl: 0.5 });
    list(c).push(loon, heron, goose);
    c.update(0.05, 0, -15, env()); // (15 m from the loon: inside its 20)
    expect(loon.state).toBe('dive');
    for (let t = 0; t < 40; t++) c.update(0.05, 0, -15, env());
    expect(c.stats.loon ?? 0).toBe(1); // (still there, under the water)
    for (let t = 0; t < 240; t++) c.update(0.05, 0, -15, env());
    expect(loon.state).not.toBe('dive');
    expect(Math.hypot((loon.x as number) - 0, (loon.z as number) + 15)).toBeGreaterThan(18); // (up again farther off)
    c.update(0.05, 20, -10, env());
    expect(heron.state).toBe('fly');
    // (a goose 7 m off: inside its 9, outside its flush — at night, with nothing else coming down)
    const c3 = new Critters(lake, walk), g3 = animal('canadagoose', -20, -20, { wl: 0.5 });
    list(c3).push(g3);
    c3.update(0.05, -20, -13, env({ hour: 23, night: 0.9 }));
    expect(g3.state).toBe('flee');
    for (let t = 0; t < 40; t++) c3.update(0.05, -20, -13, env({ hour: 23, night: 0.9 }));
    expect(g3.wl).toBe(0.5);
    expect(g3.z as number).toBeLessThan(-1.2); // (paddling off, on the water still)
  });
  it('the beach: gulls on the sand and wheeling over it, pelicans skimming the waves; the vulture circles but never stoops, the osprey hovers and plunges for fish', () => {
    const c = new Critters(sea, walk);
    const seen: Any[] = [];
    for (let t = 0; t < 1600; t++) { c.update(0.05, 0, 30, env({ hour: 10 })); if (t % 80 === 79) seen.push(...list(c).map((o) => ({ ...o }))); }
    const gulls = seen.filter((o) => o.kind === 'laughinggull');
    expect(gulls.length).toBeGreaterThan(5);
    expect(gulls.some((o) => o.state === 'glide')).toBe(true);
    for (const o of gulls.filter((g) => g.state === 'idle' || g.state === 'move')) expect(o.z as number).toBeGreaterThan(0.4);
    const pelicans = seen.filter((o) => o.kind === 'brownpelican' && o.state === 'skim');
    for (const o of pelicans) {
      expect(o.z as number).toBeLessThan(0);
      expect(o.y as number).toBeGreaterThan(1);
      expect(o.y as number).toBeLessThan(3);
    }
    // a vulture over songbirds never stoops; an osprey over the water hovers, then plunges
    const c2 = new Critters(sea, walk);
    const v = animal('turkeyvulture', 0, 24, { state: 'soar', y: 60, ty: 60, t: 0, home: { x: 0, z: 24 } });
    const o = animal('osprey', 0, -40, { state: 'soar', y: 22, ty: 22, t: 0, home: { x: 0, z: -40 } });
    list(c2).push(v, o, animal('songbird', 3, 25), animal('songbird', -2, 22));
    const states = new Set<string>();
    for (let t = 0; t < 2400; t++) { c2.update(0.05, 0, 5, env({ hour: 11, climate: 'temperate', place: undefined })); states.add(o.state as string); }
    expect(c2.eco.hunts).toBe(0);
    expect(states.has('hover')).toBe(true);
    expect(states.has('plunge')).toBe(true);
    expect(c2.eco.caught).toBeGreaterThan(0); // (fish)
  });
  it('a turkey tom struts in the spring, his fan stood up (the display pose); not in July, and never a hen', () => {
    const poses = (month: number, seed: number) => {
      // (by day, the tom 60 m off — well past his 20 — the others coming and going round him)
      const c = new Critters(lake, walk), t = animal('wildturkey', 0, 60, { seed, t: 0 });
      list(c).push(t);
      const seen = new Set<number>();
      const mesh = (c as unknown as { meshes: Map<string, { m: THREE.InstancedMesh; anim: THREE.InstancedBufferAttribute }> }).meshes.get('wildturkey')!;
      for (let i = 0; i < 1200; i++) {
        c.update(0.05, 0, 0, env({ month, hour: 12, camFwd: new THREE.Vector3(0, 0, 1) })); // (looking his way: one behind isn't drawn)
        const mine = list(c).filter((o) => o.kind === 'wildturkey').indexOf(t);
        if (mine >= 0) seen.add(mesh.anim.getZ(mine));
      }
      return seen;
    };
    expect(poses(4, 9)).toContain(4);
    expect(poses(7, 9)).not.toContain(4);
    expect(poses(4, 10)).not.toContain(4);
  });
  it("the osprey's nests: at the water's edge, never two to a 700 m cell, the same whichever way the land is cut into tiles", () => {
    // a winding shore: the water north of z = 40·sin(x/150)
    const sdf = (x: number, z: number) => z - 40 * Math.sin(x / 150), h = (x: number, z: number) => (sdf(x, z) > 0 ? 0.5 : -1.2);
    const all = ospreyNests({ x0: 0, z0: -2800, x1: 5600, z1: 2800 }, sdf, h);
    expect(all.length).toBeGreaterThan(2);
    for (const n of all) {
      expect(sdf(n.x, n.z)).toBeLessThan(-1);
      expect(sdf(n.x, n.z)).toBeGreaterThan(-6);
      expect(n.y).toBe(-1.2); // (the pole's foot on the bed)
    }
    const cells = new Set(all.map((n) => `${Math.floor(n.x / 700)},${Math.floor(n.z / 700)}`));
    expect(cells.size).toBe(all.length);
    // cut into tiles of 1 km, the same nests
    const tiled = [];
    for (let x = 0; x < 5600; x += 1000) for (let z = -2800; z < 2800; z += 1000) tiled.push(...ospreyNests({ x0: x, z0: z, x1: Math.min(5600, x + 1000), z1: Math.min(2800, z + 1000) }, sdf, h));
    const key = (n: { x: number; z: number }) => `${n.x.toFixed(2)},${n.z.toFixed(2)}`;
    expect(tiled.map(key).sort()).toEqual(all.map(key).sort());
    // no water, no nests
    expect(ospreyNests({ x0: 0, z0: 0, x1: 3000, z1: 3000 }, () => 50, () => 1)).toEqual([]);
  });
});
