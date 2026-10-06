import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { critterGeometry, faunaMix, ROLE, type CritterKind } from '../src/assets/fauna';
import { baskingLogs } from '../src/assets/signs';
import { Critters, type CritterEnv } from '../src/sim/critters';
import { castOf, regionStyle } from '../src/world/styles';
import type { Terrain } from '../src/world/data';
import type { WalkWorld } from '../src/player/collision';

// Package #15 (docs/regional-life/models.md build order 15): the reptiles — the sprawler† and turtle†
// plans — and how they bask and slide into the water
const has = (p: number[], k: CritterKind, month?: number) => {
  const st = regionStyle(p[0], p[1]);
  return Object.values(faunaMix(st.region, st.climate, castOf(st), month)).flat().some(([kk]) => kk === k);
};
const T = {
  MIAMI: [25.76, -80.19], SAVANNAH: [32.08, -81.09], NEW_ORLEANS: [29.95, -90.07], HOUSTON: [29.76, -95.37], ATLANTA: [33.75, -84.39], LUBBOCK: [33.58, -101.86],
  BOSTON: [42.36, -71.06], DENVER: [39.74, -104.99], PHOENIX: [33.45, -112.07], SEATTLE: [47.61, -122.33], CHICAGO: [41.88, -87.63],
};
const box = (g: THREE.BufferGeometry, part?: number) => {
  const p = g.getAttribute('position'), a = g.getAttribute('aPart'), b = new THREE.Box3();
  for (let i = 0; i < p.count; i++) if (part === undefined || Math.abs(a.getX(i) - part) < 0.5) b.expandByPoint(new THREE.Vector3(p.getX(i), p.getY(i), p.getZ(i)));
  return b;
};
// a pond north of a winding shore (the water's distance: z − 137 − 6·sin(x/40)), its bank at 0.5 m, its bed below
const shore = (x: number, z: number) => z - 137 - 6 * Math.sin(x / 40);
const pond = { heightAt: (x: number, z: number) => (shore(x, z) > 0 ? 0.5 : -1), sdfAt: shore, coverAt: () => 30, oceanDistAt: () => 5000 } as unknown as Terrain;
const walk = { buildingAt: () => -1, blocked: () => false } as unknown as WalkWorld;
type Any = Record<string, unknown>;
const list = (c: Critters) => (c as unknown as { list: Any[] }).list;
const env = (o: Partial<CritterEnv> = {}): CritterEnv => ({ hour: 12, night: 0, month: 6, wind: 0.2, south: false, camFwd: new THREE.Vector3(0, -1, 0), trees: () => [], gardens: () => [], movers: [], ...o });
const animal = (kind: string, x: number, z: number, o: Any = {}): Any => ({ kind, x, y: 0, z, yaw: 0, pitch: 0, state: 'perch', t: 1e6, tx: x, tz: z, ty: 0, phase: 0, amt: 0, s: 1, c: new THREE.Color(), seed: 7, vig: 0.5, ...o });

describe('the reptiles', () => {
  it("each region's own (ranges.md): the alligator on the Southeast's coastal plain, Florida, the Gulf and East Texas; the sliders and the painted turtle; the green anole across the South, the brown anole on its coasts", () => {
    for (const p of [T.MIAMI, T.SAVANNAH, T.NEW_ORLEANS, T.HOUSTON]) expect(has(p, 'alligator'), `${p}`).toBe(true);
    for (const p of [T.ATLANTA, T.LUBBOCK, T.BOSTON, T.DENVER]) expect(has(p, 'alligator'), `${p}`).toBe(false);
    for (const p of [T.MIAMI, T.SAVANNAH]) expect(has(p, 'yellowslider'), `${p}`).toBe(true);
    expect(has(T.BOSTON, 'yellowslider')).toBe(false);
    for (const p of [T.BOSTON, T.CHICAGO, T.SEATTLE]) expect(has(p, 'paintedturtle', 7), `${p}`).toBe(true);
    for (const p of [T.MIAMI, T.PHOENIX]) expect(has(p, 'paintedturtle', 7), `${p}`).toBe(false);
    expect(has(T.BOSTON, 'paintedturtle', 1)).toBe(false); // (under the ice)
    for (const p of [T.PHOENIX, T.SEATTLE, T.BOSTON]) expect(has(p, 'redslider', 7), `${p}`).toBe(true);
    for (const p of [T.ATLANTA, T.MIAMI, T.HOUSTON]) expect(has(p, 'greenanole', 7), `${p}`).toBe(true);
    for (const p of [T.BOSTON, T.CHICAGO, T.DENVER]) expect(has(p, 'greenanole', 7), `${p}`).toBe(false);
    expect(has(T.MIAMI, 'brownanole')).toBe(true);
    expect(has(T.ATLANTA, 'brownanole')).toBe(false);
    expect(ROLE.alligator).toBe('basker');
    expect(ROLE.greenanole).toBe('climber');
  });
  it('the plans: an alligator three metres long and low; an anole a hand long with its throat fan on the display part; a turtle\'s shell riding low', () => {
    const g = box(critterGeometry('alligator'));
    expect(g.max.z - g.min.z).toBeGreaterThan(2.8);
    expect(g.max.y).toBeLessThan(0.5);
    const a = critterGeometry('greenanole');
    expect(box(a).max.z - box(a).min.z).toBeLessThan(0.25);
    expect(box(a, 9).isEmpty()).toBe(false); // (the dewlap)
    const t = box(critterGeometry('redslider'));
    expect(t.max.y).toBeLessThan((t.max.z - t.min.z) * 0.45);
  });
  it("the logs: at a pond's edge, lying out into the water, the same however the land is tiled", () => {
    const sdf = (x: number, z: number) => z - 40 * Math.sin(x / 150), h = (x: number, z: number) => (sdf(x, z) > 0 ? 0.5 : -1);
    const logs = baskingLogs({ x0: 0, z0: -900, x1: 3000, z1: 900 }, sdf, () => 5000, h);
    expect(logs.length).toBeGreaterThan(3);
    for (const l of logs) {
      expect(Math.abs(sdf(l.x, l.z))).toBeLessThanOrEqual(0.6);
      expect(sdf(l.x + Math.sin(l.yaw) * 2, l.z + Math.cos(l.yaw) * 2)).toBeLessThan(sdf(l.x - Math.sin(l.yaw) * 2, l.z - Math.cos(l.yaw) * 2)); // (its +z end out in the water)
    }
    expect(baskingLogs({ x0: 0, z0: -900, x1: 3000, z1: 900 }, sdf, () => 0, h)).toEqual([]); // (not the sea)
    const tiled = [];
    for (let x = 0; x < 3000; x += 1000) tiled.push(...baskingLogs({ x0: x, z0: -900, x1: x + 1000, z1: 900 }, sdf, () => 5000, h));
    expect(tiled.length).toBe(logs.length);
  });
  it('turtles in a row on a log slide off into the water when you come; an alligator on the bank slides in and sinks; an anole goes up its trunk and flashes its throat fan', () => {
    const florida = castOf(regionStyle(T.MIAMI[0], T.MIAMI[1]));
    // turtles come to the pond's logs
    const c = new Critters(pond, walk);
    let onLogs: Any[] = [];
    for (let i = 0; i < 1600 && !onLogs.length; i++) {
      c.update(0.05, i * 0.05 * 3, 177, env({ place: florida })); // (walking the shore path)
      onLogs = list(c).filter((o) => ['yellowslider', 'redslider'].includes(o.kind as string) && o.state === 'perch');
    }
    expect(onLogs.length).toBeGreaterThan(0);
    for (const o of onLogs) expect(Math.abs(shore(o.x as number, o.z as number))).toBeLessThan(3); // (on a log at the edge)
    // walk up to one: it slides off and goes under, and comes up on the water
    const tt = onLogs[0];
    const seen = new Set<string>();
    for (let i = 0; i < 400; i++) { c.update(0.05, tt.x as number, (tt.z as number) + 6, env({ place: florida })); seen.add(tt.state as string); }
    expect(seen.has('slide') || seen.has('dive')).toBe(true);
    // an alligator basking on the bank
    const c2 = new Critters(pond, walk), gator = animal('alligator', 0, 140, { yaw: 0 });
    list(c2).push(gator);
    const g2 = new Set<string>();
    for (let i = 0; i < 300; i++) { c2.update(0.05, 0, 150, env({ place: florida })); g2.add(gator.state as string); }
    expect(g2.has('slide')).toBe(true);
    expect(g2.has('dive')).toBe(true);
    expect(gator.wl).toBeDefined();
    expect(shore(gator.x as number, gator.z as number)).toBeLessThan(0); // (in the water)
    // an anole on a trunk: up it when you come close; its throat fan flashes now and then
    const tree = { x: 0, z: 200, trunk: 4, r: 0.3 };
    const c3 = new Critters(pond, walk), an = animal('greenanole', 0, 200.4, { y: 1.2, ty: 1.2, home: tree, pitch: 1.47 });
    list(c3).push(an);
    const mesh = (c3 as unknown as { meshes: Map<string, { anim: THREE.InstancedBufferAttribute }> }).meshes.get('greenanole')!;
    let flashed = false;
    for (let i = 0; i < 400; i++) { c3.update(0.05, 0, 230, env({ place: florida, trees: () => [tree] })); if (mesh.anim.getZ(0) >= 10) flashed = true; }
    expect(flashed).toBe(true);
    for (let i = 0; i < 40; i++) c3.update(0.05, 0, 202.5, env({ place: florida, trees: () => [tree] }));
    expect(an.y as number).toBeGreaterThan(1.3);
  });
});
