import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { P } from '../src/assets/core';
import { critterGeometry, faunaMix, ROLE, type CritterKind } from '../src/assets/fauna';
import { broadMix, coniferMix, DECIDUOUS, fallHueOf, NEEDLED, picsOf, treeGeometry } from '../src/assets/flora';
import { Critters, type CritterEnv } from '../src/sim/critters';
import { castOf, regionStyle } from '../src/world/styles';
import type { Terrain } from '../src/world/data';
import type { WalkWorld } from '../src/player/collision';

// The regional-life leftovers (docs/ROADMAP.md track D): the inland gulls (ring-billed, herring), the
// Sierra's black oak and the foothills' gray pine
const at = (lat: number, lon: number) => castOf(regionStyle(lat, lon));
const has = (p: [number, number], k: CritterKind, month?: number) => {
  const st = regionStyle(p[0], p[1]);
  return Object.values(faunaMix(st.region, st.climate, castOf(st), month)).flat().some(([kk]) => kk === k);
};
const T: Record<string, [number, number]> = {
  CHICAGO: [41.88, -87.63], DETROIT: [42.33, -83.05], DENVER: [39.74, -104.99], OMAHA: [41.26, -95.93], MIAMI: [25.76, -80.19], BOSTON: [42.36, -71.06], BUFFALO: [42.89, -78.88],
  YOSEMITE: [37.745, -119.59], AUBURN: [38.9, -121.08], SACRAMENTO: [38.58, -121.49], LOS_ANGELES: [34.05, -118.24], SEATTLE: [47.6, -122.33], ATLANTA: [33.75, -84.39],
};
const colourCount = (g: THREE.BufferGeometry, hex: number, part?: number) => {
  const c = g.getAttribute('color'), a = g.getAttribute('aPart'), want = new THREE.Color(hex);
  let n = 0;
  for (let i = 0; i < c.count; i++) if ((part === undefined || Math.abs(a.getX(i) - part) < 0.5) && Math.abs(c.getX(i) - want.r) + Math.abs(c.getY(i) - want.g) + Math.abs(c.getZ(i) - want.b) < 0.02) n++;
  return n;
};

describe('the inland gulls', () => {
  it("the ring-billed gull in every region (the South's in winter), the herring gull on the Great Lakes and the North's coasts — the Midwest's gulls at last", () => {
    for (const p of [T.CHICAGO, T.DETROIT, T.DENVER, T.OMAHA, T.BUFFALO]) expect(has(p, 'ringbilledgull', 7), `${p}`).toBe(true);
    expect(has(T.MIAMI, 'ringbilledgull', 1)).toBe(true);
    expect(has(T.MIAMI, 'ringbilledgull', 7)).toBe(false);
    for (const p of [T.CHICAGO, T.BOSTON, T.BUFFALO]) expect(has(p, 'herringgull', 7), `${p}`).toBe(true);
    for (const p of [T.DENVER, T.MIAMI]) expect(has(p, 'herringgull', 7), `${p}`).toBe(false);
    expect([ROLE.ringbilledgull, ROLE.herringgull]).toEqual(['gull', 'gull']);
  });
  it("each its own: the ring-billed's black ring on its bill, the herring gull's red spot (and the California gull's both); the herring gull the bigger", () => {
    const ring = critterGeometry('ringbilledgull'), herring = critterGeometry('herringgull');
    expect(colourCount(ring, 0x1a1a1c, P.skull)).toBeGreaterThan(colourCount(herring, 0x1a1a1c, P.skull));
    expect(colourCount(herring, 0xc8302a, P.skull)).toBeGreaterThan(0);
    expect(colourCount(ring, 0xc8302a, P.skull)).toBe(0);
    expect(colourCount(critterGeometry('californiagull'), 0xc8302a, P.skull)).toBeGreaterThan(0);
    const h = (g: THREE.BufferGeometry) => (g.computeBoundingBox(), g.boundingBox!.max.y);
    expect(h(herring)).toBeGreaterThan(h(ring));
  });
  it("they come down on a Midwest town's fields and lots, a thousand kilometres from the sea", () => {
    const inland = { heightAt: () => 0, sdfAt: () => 60, coverAt: () => 30, oceanDistAt: () => 900_000 } as unknown as Terrain;
    const walk = { buildingAt: () => -1, blocked: () => false, deckAt: () => null } as unknown as WalkWorld;
    const c = new Critters(inland, walk);
    const env: CritterEnv = { hour: 12, night: 0, month: 7, wind: 0.2, south: false, camFwd: new THREE.Vector3(0, -1, 0), trees: () => [], gardens: () => [], movers: [], place: at(...T.CHICAGO) };
    for (let i = 0; i < 400; i++) c.update(0.05, 0, 0, env);
    const list = (c as unknown as { list: { kind: string }[] }).list;
    expect(list.some((o) => o.kind === 'ringbilledgull' || o.kind === 'herringgull')).toBe(true);
  });
});

describe("California's black oak and gray pine", () => {
  it('the black oak in the Sierra, gold in the fall; the gray pine among the foothills\' blue oaks and on the Sierra\'s lowest slopes; neither out of California', () => {
    const w = (p: [number, number], k: string) => broadMix(at(...p)).find(([kk]) => kk === k)?.[1] ?? 0;
    expect(w(T.YOSEMITE, 'blackoak')).toBeGreaterThan(0);
    for (const p of [T.SACRAMENTO, T.LOS_ANGELES, T.SEATTLE, T.ATLANTA, T.DENVER]) expect(w(p, 'blackoak'), `${p}`).toBe(0);
    expect(w(T.AUBURN, 'graypine')).toBeGreaterThan(0);
    for (const p of [T.LOS_ANGELES, T.SEATTLE, T.ATLANTA, T.DENVER]) expect(w(p, 'graypine'), `${p}`).toBe(0);
    expect(coniferMix(at(...T.YOSEMITE), 'pine', 800, T.YOSEMITE[0]).map(([k]) => k)).toContain('graypine');
    expect(coniferMix(at(...T.YOSEMITE), 'pine', 1800, T.YOSEMITE[0]).map(([k]) => k)).not.toContain('graypine');
    expect(DECIDUOUS.has('blackoak')).toBe(true);
    expect(fallHueOf('blackoak', 0)).toBe(2); // (gold: Yosemite Valley's in October)
    expect(NEEDLED.has('graypine')).toBe(true);
    expect(picsOf('graypine', 0, false)).toEqual([22, 23]); // (its long needles hang in brushes)
  });
  it('the gray pine leans out over its slope; the black oak stands taller than the blue oak', () => {
    for (let v = 1; v < 3; v++) {
      const g = treeGeometry('graypine', v).geo;
      g.computeBoundingBox();
      const b = g.boundingBox!;
      expect(Math.max(Math.abs(b.max.x), Math.abs(b.min.x), Math.abs(b.max.z), Math.abs(b.min.z)), `v${v}`).toBeGreaterThan(2.5);
    }
    expect(treeGeometry('blackoak', 0).meta.h).toBeGreaterThan(treeGeometry('blueoak', 0).meta.h);
  });
});

describe('the salt marsh and the swamp water', () => {
  it("smooth cordgrass on the Atlantic's and the Gulf's salt marsh — the land cover's wetland by the sea — right down to the water, tall at the creeks' edges and short on the high marsh", async () => {
    const { cordgrassCoast } = await import('../src/assets/flora');
    const { saltMarsh, cordgrassHeight } = await import('../src/world/grass');
    for (const p of [T.BOSTON, T.MIAMI, [29.95, -90.07] as [number, number], [32.08, -81.09] as [number, number]]) expect(cordgrassCoast(at(...p)), `${p}`).toBe(true);
    for (const p of [T.SEATTLE, T.LOS_ANGELES, T.CHICAGO]) expect(cordgrassCoast(at(...p)), `${p}`).toBe(false);
    expect(saltMarsh(90, 1, 400)).toBe(true);
    expect(saltMarsh(90, 1, 9000)).toBe(false); // (an inland marsh: no cordgrass)
    expect(saltMarsh(30, 1, 400)).toBe(false); // (a lawn by the sea)
    expect(saltMarsh(90, -2, 400)).toBe(false); // (in the water)
    expect(cordgrassHeight(2, 5, 5)).toBeGreaterThan(0.95);
    expect(cordgrassHeight(20, 5, 5)).toBeLessThan(0.75);
  });
  it("duckweed on the South's still water in the warm months — a pond, not a river — gone in a northern winter and nowhere north", async () => {
    const { duckweedCover } = await import('../src/assets/flora');
    const { stillWater } = await import('../src/world/synth');
    const nola = at(29.95, -90.07);
    expect(duckweedCover(nola, 7)).toBeGreaterThan(0.6);
    expect(duckweedCover(nola, 1)).toBe(0);
    expect(duckweedCover(at(...T.MIAMI), 1)).toBeGreaterThan(0); // (Florida's mild winter: thinner, not gone)
    for (const p of [T.BOSTON, T.CHICAGO, T.SEATTLE]) expect(duckweedCover(at(...p), 7), `${p}`).toBe(0);
    const circle = (r: number) => Array.from({ length: 24 }, (_, i) => [Math.cos((i / 24) * 6.283) * r, Math.sin((i / 24) * 6.283) * r] as [number, number]);
    expect(stillWater(circle(60))).toBe(true); // (a pond)
    expect(stillWater(circle(400))).toBe(false); // (a lake's open water, 50 ha)
    expect(stillWater([[0, 0], [2000, 0], [2000, 40], [0, 40]])).toBe(false); // (a river's ribbon)
  });
});
