import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { P } from '../src/assets/core';
import { critterGeometry, faunaMix, ROLE, chimneyCountry, type CritterKind } from '../src/assets/fauna';
import { crawfishChimneys } from '../src/assets/signs';
import { Critters, type CritterEnv } from '../src/sim/critters';
import { castOf, regionStyle } from '../src/world/styles';
import type { Terrain } from '../src/world/data';
import type { WalkWorld } from '../src/player/collision';

// Package #16 (docs/regional-life/models.md build order 16): the small life — the monarch (the butterfly
// row), the common green darner (dragonfly†), the annual cicada and its shell (bug†), the Pacific banana
// slug (slug†), the Atlantic marsh fiddler crab and the crawfish (crab†), the crawfish's chimneys (sign†)
const cast = (p: number[]) => castOf(regionStyle(p[0], p[1]));
const has = (p: number[], k: CritterKind, month?: number) => {
  const st = regionStyle(p[0], p[1]);
  return Object.values(faunaMix(st.region, st.climate, castOf(st), month)).flat().some(([kk]) => kk === k);
};
const T = {
  BOSTON: [42.36, -71.06], SEATTLE: [47.61, -122.33], DENVER: [39.74, -104.99], PHOENIX: [33.45, -112.07], MIAMI: [25.76, -80.19], ATLANTA: [33.75, -84.39],
  CHICAGO: [41.88, -87.63], DALLAS: [32.78, -96.8], SAVANNAH: [32.08, -81.09], HOUSTON: [29.76, -95.37], NEW_ORLEANS: [29.95, -90.07], LUBBOCK: [33.58, -101.86],
  EUREKA: [40.8, -124.16], LOS_ANGELES: [34.05, -118.24], SAN_FRANCISCO: [37.77, -122.42],
};
const box = (g: THREE.BufferGeometry, part?: number) => {
  const p = g.getAttribute('position'), a = g.getAttribute('aPart'), b = new THREE.Box3();
  for (let i = 0; i < p.count; i++) if (part === undefined || Math.abs(a.getX(i) - part) < 0.5) b.expandByPoint(new THREE.Vector3(p.getX(i), p.getY(i), p.getZ(i)));
  return b;
};
const walk = { buildingAt: () => -1, blocked: () => false } as unknown as WalkWorld;
type Any = Record<string, unknown>;
const list = (c: Critters) => (c as unknown as { list: Any[] }).list;
const anim = (c: Critters, k: CritterKind) => (c as unknown as { meshes: Map<string, { m: THREE.InstancedMesh; anim: THREE.InstancedBufferAttribute }> }).meshes.get(k)!;
const env = (o: Partial<CritterEnv> = {}): CritterEnv => ({ hour: 12, night: 0, month: 7, wind: 0.2, south: false, camFwd: new THREE.Vector3(0, -1, 0), trees: () => [], gardens: () => [], movers: [], ...o });
const animal = (kind: string, x: number, z: number, o: Any = {}): Any => ({ kind, x, y: 0, z, yaw: 0, pitch: 0, state: 'idle', t: 30, tx: x, tz: z, ty: 0, phase: 0, amt: 0, s: 1, c: new THREE.Color(), seed: 7, vig: 0.5, ...o });

describe('the small life', () => {
  it("each region's own (ranges.md), in its season: the monarch everywhere in summer and on California's coast in winter; the darner everywhere; the annual cicada the East's, the Plains', Texas's and the desert's; the banana slug the wet Northwest's and the redwood coast's; the fiddlers on the Atlantic and Gulf coasts; the crawfish the South's and the Midwest's", () => {
    for (const p of [T.BOSTON, T.SEATTLE, T.DENVER, T.PHOENIX, T.MIAMI]) expect(has(p, 'monarch', 7), `${p}`).toBe(true);
    expect(has(T.BOSTON, 'monarch', 1)).toBe(false);
    expect(has(T.LOS_ANGELES, 'monarch', 1)).toBe(true); // (the winter roosts)
    for (const p of [T.BOSTON, T.SEATTLE, T.PHOENIX, T.CHICAGO]) expect(has(p, 'greendarner', 7), `${p}`).toBe(true);
    expect(has(T.CHICAGO, 'greendarner', 1)).toBe(false);
    for (const p of [T.ATLANTA, T.CHICAGO, T.DALLAS, T.PHOENIX, T.BOSTON]) expect(has(p, 'annualcicada', 7), `${p}`).toBe(true);
    for (const p of [T.SEATTLE, T.SAN_FRANCISCO, T.DENVER]) expect(has(p, 'annualcicada', 7), `${p}`).toBe(false);
    expect(has(T.ATLANTA, 'annualcicada', 1)).toBe(false);
    expect(has(T.SEATTLE, 'bananaslug', 11)).toBe(true);
    expect(has(T.EUREKA, 'bananaslug', 11)).toBe(true);
    expect(has(T.SEATTLE, 'bananaslug', 8)).toBe(false); // (the dry end of summer: down under the duff)
    for (const p of [T.LOS_ANGELES, T.PHOENIX, T.BOSTON]) expect(has(p, 'bananaslug', 11), `${p}`).toBe(false);
    for (const p of [T.SAVANNAH, T.MIAMI, T.HOUSTON, T.BOSTON]) expect(has(p, 'fiddlercrab', 7), `${p}`).toBe(true);
    for (const p of [T.CHICAGO, T.SEATTLE, T.DENVER]) expect(has(p, 'fiddlercrab', 7), `${p}`).toBe(false);
    for (const p of [T.NEW_ORLEANS, T.ATLANTA, T.CHICAGO, T.HOUSTON]) expect(has(p, 'crawfish', 6), `${p}`).toBe(true);
    for (const p of [T.LUBBOCK, T.MIAMI, T.SEATTLE, T.BOSTON]) expect(has(p, 'crawfish', 6), `${p}`).toBe(false);
    expect(chimneyCountry(cast(T.NEW_ORLEANS))).toBe(true);
    expect(chimneyCountry(cast(T.CHICAGO))).toBe(false);
    expect([ROLE.monarch, ROLE.greendarner, ROLE.annualcicada, ROLE.bananaslug, ROLE.fiddlercrab, ROLE.crawfish]).toEqual(['butterfly', 'dragonfly', 'bug', 'crawler', 'crab', 'crab']);
  });

  it("each its own build: the monarch's ten-centimetre wings; the darner's long abdomen and four wings; the cicada's wings a roof over its back, its shell wingless; the slug's tentacles on the display part; a fiddler's great claw longer than he is wide; a crawfish's two claws ahead and its tail behind", () => {
    const mon = critterGeometry('monarch'), w = box(mon, P.wing);
    expect(w.max.x - w.min.x).toBeGreaterThan(0.09);
    const col = mon.getAttribute('color');
    let orange = 0;
    for (let i = 0; i < col.count; i++) if (col.getX(i) > 0.8 && col.getY(i) > 0.35 && col.getY(i) < 0.6 && col.getZ(i) < 0.2) orange++;
    expect(orange).toBeGreaterThan(50);
    const dar = critterGeometry('greendarner'), db = box(dar);
    expect(db.max.z - db.min.z).toBeGreaterThan(0.07);
    expect(box(dar, P.wing).max.x).toBeGreaterThan(0.04);
    const cic = critterGeometry('annualcicada');
    expect(box(cic, P.wing).max.y).toBeGreaterThan(box(cic, P.body).max.y - 0.001);
    expect(box(critterGeometry('cicadashell'), P.wing).isEmpty()).toBe(true);
    const slug = critterGeometry('bananaslug');
    expect(box(slug, 9).isEmpty()).toBe(false);
    expect(box(slug).max.z - box(slug).min.z).toBeGreaterThan(0.18);
    const fid = critterGeometry('fiddlercrab'), claw = box(fid, 9);
    expect(claw.max.x - claw.min.x).toBeGreaterThan(0.03);
    const cra = critterGeometry('crawfish'), cc = box(cra, 9);
    expect(cc.min.x).toBeLessThan(0);
    expect(cc.max.x).toBeGreaterThan(0);
    expect(cc.min.z).toBeLessThan(-0.05);
    expect(box(cra).max.z).toBeGreaterThan(0.04); // (the tail fan)
  });

  it("the crawfish's chimneys: in clusters, where the ground asks, the same however the land is tiled", () => {
    const ok = (x: number, z: number) => Math.sin(x / 90) + Math.cos(z / 70) > 0.4;
    const all = crawfishChimneys({ x0: 0, z0: 0, x1: 1200, z1: 1200 }, ok, () => 0);
    expect(all.length).toBeGreaterThan(10);
    for (const c of all) expect(ok(c.x, c.z)).toBe(true);
    const tiled = [];
    for (let x = 0; x < 1200; x += 400) for (let z = 0; z < 1200; z += 400) tiled.push(...crawfishChimneys({ x0: x, z0: z, x1: x + 400, z1: z + 400 }, ok, () => 0));
    expect(tiled.length).toBe(all.length);
  });

  it('a darner patrols its beat and back, hovering at the ends; a cicada on the bark sings and buzzes off when you come; a slug draws its tentacles in', () => {
    // a pond south of z 20: the darner's beat at its edge, over the water's level
    const pond = { heightAt: (_x: number, z: number) => (z > 20 ? -1 : 0.5), sdfAt: (_x: number, z: number) => 20 - z, coverAt: () => 30, oceanDistAt: () => 5000 } as unknown as Terrain;
    const c = new Critters(pond, walk), dar = animal('greendarner', 0, 20, { state: 'patrol', t: 0, y: 1.5, ty: 1.5, home: { x: 0, z: 20 }, beat: Math.PI / 2, amt: 1 });
    list(c).push(dar);
    let turns = 0, still = 0, lastV = 0, xs: number[] = [];
    const boston = cast(T.BOSTON);
    for (let i = 0; i < 600; i++) {
      const x0 = dar.x as number;
      c.update(0.05, 0, -30, env({ place: boston }));
      const v = (dar.x as number) - x0;
      if (Math.abs(v) < 0.01) still++;
      else { if (lastV && Math.sign(v) !== Math.sign(lastV)) turns++; lastV = v; }
      xs.push(dar.x as number);
      expect(dar.y as number).toBeGreaterThan(0.5);
      expect(dar.y as number).toBeLessThan(3.5);
    }
    expect(Math.max(...xs) - Math.min(...xs)).toBeGreaterThan(5); // (up and down its beat along the edge)
    expect(turns).toBeGreaterThan(2);
    expect(still).toBeGreaterThan(20); // (hanging still a moment at each end)
    xs = [];
    // a cicada on a trunk: the chorus while it's there; off when you come within a couple of metres
    const tree = { x: 0, z: -10, trunk: 6, r: 0.3 };
    const c2 = new Critters(pond, walk), cic = animal('annualcicada', 0, -9.5, { state: 'perch', t: 1e6, y: 3, ty: 3, home: tree, pitch: 1.47 });
    list(c2).push(cic);
    c2.update(0.05, 0, -30, env({ place: boston, trees: () => [tree] }));
    expect(c2.chorus).toBeGreaterThan(0);
    for (let i = 0; i < 20; i++) c2.update(0.05, 0, -8, env({ place: boston, trees: () => [tree] }));
    expect(cic.state).toBe('fly');
    // a slug: tentacles out while you're off; in when you're over it
    const c3 = new Critters(pond, walk), slug = animal('bananaslug', 0, -40, { t: 100 }), seattle = cast(T.SEATTLE);
    list(c3).push(slug);
    c3.update(0.05, 0, -30, env({ place: seattle, month: 11 }));
    expect(anim(c3, 'bananaslug').anim.getZ(0)).toBeGreaterThanOrEqual(10);
    c3.update(0.05, 0.5, -40, env({ place: seattle, month: 11 }));
    expect(anim(c3, 'bananaslug').anim.getZ(0)).toBeLessThan(10);
  });

  it('a flat of fiddlers goes down its burrows all at once when you come, and comes up once you have gone; the males wave their great claws; a crawfish stands its ground, claws up, backing off', () => {
    const mud = { heightAt: () => 0, sdfAt: () => 6, coverAt: () => 90, oceanDistAt: () => 600 } as unknown as Terrain; // (the salt marsh's mud)
    const c = new Critters(mud, walk), sav = cast(T.SAVANNAH);
    const flat = Array.from({ length: 12 }, (_, i) => animal('fiddlercrab', (i % 4) * 1.5 - 2, -6 - Math.floor(i / 4) * 1.5, { seed: 11 + i * 97, t: 5 }));
    list(c).push(...flat);
    for (let i = 0; i < 10; i++) c.update(0.05, 0, 20, env({ place: sav }));
    const M = anim(c, 'fiddlercrab');
    const flags = Array.from({ length: M.m.count }, (_, i) => M.anim.getZ(i) >= 10);
    expect(flags.some((f) => f)).toBe(true); // (the males, their great claws)
    expect(flags.some((f) => !f)).toBe(true); // (the females)
    for (let i = 0; i < 100; i++) c.update(0.05, 0, -2, env({ place: sav })); // (walk up to the flat)
    expect(flat.filter((f) => f.state === 'dive').length).toBe(12); // (all down: none to be seen)
    for (let i = 0; i < 400; i++) c.update(0.05, 0, 30, env({ place: sav })); // (and away)
    expect(flat.filter((f) => f.state !== 'dive').length).toBe(12);
    // a crawfish on the bank: claws up and backing off
    const bank = { heightAt: () => 0, sdfAt: () => 2, coverAt: () => 30, oceanDistAt: () => 5000 } as unknown as Terrain;
    const c2 = new Critters(bank, walk), cf = animal('crawfish', 0, -2.5);
    list(c2).push(cf);
    c2.update(0.05, 0, 0, env());
    expect(cf.state).toBe('warn');
    expect(anim(c2, 'crawfish').anim.getZ(0)).toBe(14); // (the warning pose, its claws worn: raised)
    for (let i = 0; i < 20; i++) c2.update(0.05, 0, 0, env());
    expect(Math.hypot(cf.x as number, cf.z as number)).toBeGreaterThan(2.5);
  });

  it("the monarchs: hanging in clusters in a coast grove's tallest tree through the winter, bursting into flight on a warm afternoon and settling again; streaming south in the fall", () => {
    const coast = { heightAt: () => 0, sdfAt: () => 40, coverAt: () => 30, oceanDistAt: () => 900 } as unknown as Terrain;
    const la = cast(T.LOS_ANGELES), tree = { x: 0, z: -30, trunk: 9, r: 0.5 }, small = { x: 6, z: -20, trunk: 3, r: 0.2 };
    const c = new Critters(coast, walk);
    const e = (hour: number) => env({ place: la, month: 12, hour, night: 0, trees: () => [tree, small] });
    for (let i = 0; i < 600; i++) c.update(0.05, 0, -20, e(9));
    const roost = list(c).filter((o) => o.kind === 'monarch');
    expect(roost.length).toBeGreaterThan(15);
    expect(list(c).some((o) => o.kind === 'butterfly')).toBe(false); // (a winter roost's butterflies all monarchs)
    for (const m of roost) {
      expect(m.state).toBe('perch');
      expect(m.roll).toBeCloseTo(Math.PI); // (hanging)
      expect(Math.hypot((m.x as number) - tree.x, (m.z as number) - tree.z)).toBeLessThan(2.5); // (the big tree's, not the small one's)
      expect(m.y as number).toBeGreaterThan(7.5);
    }
    const seen = new Set<string>();
    for (let i = 0; i < 1600; i++) { c.update(0.05, 0, -20, e(13)); for (const m of roost) seen.add(m.state as string); }
    expect(seen.has('drift')).toBe(true);
    for (let i = 0; i < 1600; i++) c.update(0.05, 0, -20, e(17));
    expect(roost.filter((m) => m.state === 'perch').length).toBeGreaterThan(roost.length * 0.8); // (settled again by evening)
    // the fall: in over the walker from the north, high, heading south
    const field = { heightAt: () => 0, sdfAt: () => 40, coverAt: () => 30, oceanDistAt: () => 5000 } as unknown as Terrain;
    const c2 = new Critters(field, walk), boston = cast(T.BOSTON);
    for (let i = 0; i < 200; i++) c2.update(0.05, 0, 0, env({ place: boston, month: 9, hour: 12 }));
    const mons = list(c2).filter((o) => o.kind === 'monarch');
    expect(mons.length).toBeGreaterThan(0);
    const z0 = mons.map((m) => m.z as number);
    for (let i = 0; i < 60; i++) c2.update(0.05, 0, 0, env({ place: boston, month: 9, hour: 12 }));
    mons.forEach((m, i) => expect(m.z as number).toBeGreaterThan(z0[i] + 2)); // (south is +z)
    for (const m of mons) expect(m.y as number).toBeGreaterThan(1.2);
  }, 30000); // (4,000 steps of the whole cast: seconds under the full suite's load)
});
