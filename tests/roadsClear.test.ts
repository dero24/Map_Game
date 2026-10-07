// Robby, 2026-10-07: "going over sandy hook bridge and driving through main cities sometimes the roads
// have walls or buildings in them where they are not supposed to". What stood in the way, each kept
// out: a divided road's two one-way bridges each a two-way road's width (their parapets in each
// other's lanes); houses under a bridge's deck, and the survey's blocks that were the deck itself,
// standing up through it; every building's walls (and a post's, a tree's) reaching to the sky over a
// deck; a tree on the bank under a bridge; parked cars across a side street's mouth or a road's lanes.
import { describe, it, expect } from 'vitest';
import { Terrain, TerrainLayer, type GridHeader, type LayerLayout, type Road, type Building } from '../src/world/data';
import { WalkWorld } from '../src/player/collision';
import { RecWalk, replayOps } from '../src/world/pack';
import { buildStructures } from '../src/world/structures';
import { fitUnderDecks, dropStreetCrossers, chainBridges, bridgeProfile, crossingsUnder, nearestOn, profileAt } from '../src/world/bridges';
import { narrowOneWays, feetWidths, osmToTile } from '../src/world/realTile';
import { streetThrough, fitToFronts, NO_PARK } from '../src/world/kerbside';
import { wallTop } from '../src/world/buildings';
import { laneLayout } from '../src/world/groundCover';

function terrainOf(grid: GridHeader, h: ArrayLike<number>, sdf: ArrayLike<number>) {
  const n = grid.w * grid.h, buf = new ArrayBuffer(n * 7);
  new Int16Array(buf, 0, n).set(Array.from(h));
  new Int16Array(buf, 2 * n, n).set(Array.from(sdf));
  const L: LayerLayout = {
    grid,
    height: { offset: 0, length: n, type: 'Int16Array' }, sdf: { offset: 2 * n, length: n, type: 'Int16Array' },
    cover: { offset: 4 * n, length: n, type: 'Uint8Array' }, flags: { offset: 5 * n, length: n, type: 'Uint8Array' },
    oceanD: { offset: 6 * n, length: n, type: 'Uint8Array' },
  };
  const l = new TerrainLayer(buf, L);
  return new Terrain(l, l);
}
// a river 100 m wide, its banks 2 m up, its bed 2.6 m down
const river = (() => {
  const grid = { x0: -200, z0: -60, cell: 2, w: 200, h: 60 };
  const h: number[] = [], sdf: number[] = [];
  for (let j = 0; j < grid.h; j++)
    for (let i = 0; i < grid.w; i++) {
      const x = grid.x0 + (i + 0.5) * grid.cell, d = Math.abs(x) - 50;
      h.push(Math.round(100 * (d >= 10 ? 2 : d >= 0 ? -0.5 + (2.5 * d) / 10 : Math.max(-2.6, -0.5 + d * 0.2))));
      sdf.push(Math.round(d * 10));
    }
  return terrainOf(grid, h, sdf);
})();
const m = (v: number) => Math.round(v * 10);
const road = (pts: [number, number][], extra: Partial<Road> = {}): Road => ({ p: pts.flatMap(([x, z]) => [m(x), m(z)]), c: 'primary', w: 11, ...extra });
const world = (roads: Road[], terrain: Terrain = river) => ({ json: { roads, lines: [], areas: [], points: [], buildings: [] }, terrain }) as never;
const box = (cx: number, cz: number, hl: number, hw: number, yaw = 0): [number, number][] => {
  const c = Math.cos(yaw), s = Math.sin(yaw);
  return [[-hw, -hl], [hw, -hl], [hw, hl], [-hw, hl]].map(([u, v]) => [cx + u * c + v * s, cz - u * s + v * c] as [number, number]);
};

describe('roads kept clear', () => {
  it("a street's width tagged in feet is read as feet; the tile service's data (feet read as metres) mended", () => {
    const origin = { lat: 40.76, lon: -73.99 }, d = 0.0005;
    const way = (id: number, tags: Record<string, string>) => ({ type: 'way', id, tags, geometry: [{ lat: origin.lat, lon: origin.lon - d }, { lat: origin.lat, lon: origin.lon + d }] });
    const tj = osmToTile({ elements: [way(1, { highway: 'primary', name: 'A', width: `69'6"`, lanes: '3' }), way(2, { highway: 'residential', name: 'B', width: '10' })] } as never, { id: '0_0', box: { x0: -200, z0: -200, x1: 200, z1: 200 }, origin });
    expect(tj.roads.find((r) => r.n === 'A')!.w).toBeCloseTo(21.2, 1);
    expect(tj.roads.find((r) => r.n === 'B')!.w).toBe(10);
    const old = [road([[0, 0], [10, 0]], { c: 'primary', w: 69 }), road([[0, 5], [10, 5]], { c: 'residential', w: 33 }), road([[0, 9], [10, 9]], { c: 'residential', w: 10.9 }), road([[0, 12], [10, 12]], { c: 'motorway', w: 45 })];
    feetWidths(old);
    expect(old.map((r) => r.w)).toEqual([21, 10.1, 10.9, 45]);
  });

  it("a building under the ground isn't built: an underground station's halls, mapped as one outline over a dozen streets", () => {
    const origin = { lat: 40.76, lon: -73.99 }, d = 0.0008;
    const outline = (id: number, tags: Record<string, string>) => ({ type: 'way', id, tags, geometry: [[-d, -d], [-d, d], [d, d], [d, -d], [-d, -d]].map(([a, b]) => ({ lat: origin.lat + a, lon: origin.lon + b })) });
    const tj = osmToTile({ elements: [outline(1, { building: 'train_station', layer: '-1', location: 'underground', name: 'S' }), outline(2, { building: 'yes', layer: '-1', 'building:levels': '3', name: 'T' }), outline(3, { building: 'yes', name: 'U' })] } as never, { id: '0_0', box: { x0: -300, z0: -300, x1: 300, z1: 300 }, origin });
    expect(tj.buildings.map((b) => b.n).sort()).toEqual(['T', 'U']);
    // the tile service's data from before: a 400 m outline a street runs through, dropped; a block beside the street, a skybridge over it, kept
    const sq = (cx: number, cz: number, h: number) => [[cx - h, cz - h], [cx + h, cz - h], [cx + h, cz + h], [cx - h, cz + h]].flatMap(([x, z]) => [m(x), m(z)]);
    const street = road([[-300, 0], [300, 0]], { c: 'residential', w: 10 });
    const halls = { r: sq(0, 0, 200) }, block = { r: sq(0, 60, 40) }, sky = { r: sq(0, 0, 80), lf: 20 };
    expect(dropStreetCrossers([halls, block, sky], [street])).toEqual([block, sky]);
  });

  it("a divided road's one-way halves are their own lanes wide — a tagged width, a two-way road left alone", () => {
    const rs = [road([[0, 0], [10, 0]], { c: 'trunk', w: 12, ow: 1 }), road([[0, 5], [10, 5]], { c: 'trunk', w: 12 }), road([[0, 9], [10, 9]], { c: 'trunk', w: 9.5, ow: 1 }), road([[0, 12], [10, 12]], { c: 'motorway', w: 14, ow: 1 }), road([[0, 15], [10, 15]], { c: 'residential', w: 6.5, ow: 1 })];
    narrowOneWays(rs);
    expect(rs.map((r) => r.w)).toEqual([7.4, 12, 9.5, 10.6, 6.5]);
    narrowOneWays(rs); // (once narrowed, left alone)
    expect(rs[0].w).toBe(7.4);
  });

  it("two one-way bridges side by side are one deck: no parapet in the other's lanes, the outer parapets kept", () => {
    // Route 36 into Highlands: each one-way way on its own bridge, their centrelines 9 m apart
    const roads = [
      road([[-200, 0], [-120, 0]], { c: 'trunk', w: 7.4, ow: 1 }), road([[-120, 0], [120, 0]], { c: 'trunk', w: 7.4, ow: 1, br: 'yes', l: 1 }), road([[120, 0], [200, 0]], { c: 'trunk', w: 7.4, ow: 1 }),
      road([[200, 9], [120, 9]], { c: 'trunk', w: 7.4, ow: 1 }), road([[120, 9], [-120, 9]], { c: 'trunk', w: 7.4, ow: 1, br: 'yes', l: 1 }), road([[-120, 9], [-200, 9]], { c: 'trunk', w: 7.4, ow: 1 }),
    ];
    const w = new RecWalk(river, { x0: -400, z0: -400, x1: 400, z1: 400 });
    buildStructures(world(roads), w, { roads, lines: [] });
    const walk = new WalkWorld(river, { x0: -400, z0: -400, x1: 400, z1: 400 });
    replayOps(walk, w.ops);
    // a car anywhere across both carriageways, mid-river, on the deck: nothing walls it
    for (const z of [-2, 0, 2, 4.5, 7, 9, 11]) {
      const y = walk.surfaceAt(0, z);
      expect(y, `deck at z ${z}`).toBeGreaterThan(2);
      expect(walk.touching(0, z, 0.8, y + 0.3), `wall at z ${z}`).toBe(false);
    }
    // …and the outer edges are still walled (a car can't drive off the side)
    const y = walk.surfaceAt(0, 0);
    expect(walk.touching(0, -5.4, 0.8, y + 0.3) || walk.touching(0, -6, 0.8, y + 0.3)).toBe(true);
    expect(walk.touching(0, 14.4, 0.8, y + 0.3) || walk.touching(0, 15, 0.8, y + 0.3)).toBe(true);
  });

  it("an overpass's piers stand clear of the motorway under it: moved along the span, not in its lanes", () => {
    // (Asheville: the middle pier of a street's bridge over the freeway stood in its lanes) — the freeway
    // in a cutting 7 m down (24 m wide), dry ground either side,
    // a 60 m secondary street's bridge (two 30 m spans: its pier mid-span) over a 14 m motorway at x 0
    const flat = (() => { const grid = { x0: -200, z0: -100, cell: 2, w: 200, h: 100 }, n = grid.w * grid.h; return terrainOf(grid, Array.from({ length: n }, (_, k) => (Math.abs(grid.x0 + ((k % grid.w) + 0.5) * grid.cell) < 12 ? -500 : 200)), Array(n).fill(3000)); })();
    const roads = [
      road([[-120, 0], [-30, 0]], { c: 'secondary', w: 9 }), road([[-30, 0], [30, 0]], { c: 'secondary', w: 9, br: 'yes', l: 1 }), road([[30, 0], [120, 0]], { c: 'secondary', w: 9 }),
      road([[0, -90], [0, 90]], { c: 'motorway', w: 14 }),
    ];
    const w = new RecWalk(flat, { x0: -400, z0: -400, x1: 400, z1: 400 });
    buildStructures(world(roads, flat), w, { roads, lines: [] });
    const walk = new WalkWorld(flat, { x0: -400, z0: -400, x1: 400, z1: 400 });
    replayOps(walk, w.ops);
    // a car anywhere in the motorway's lanes under the deck: nothing walls it
    for (let x = -6; x <= 6; x += 1.5) for (let z = -6; z <= 6; z += 1.5) expect(walk.touching(x, z, 0.8, -4.7), `pier at ${x}, ${z}`).toBe(false);
    // …and the bridge still stands on a pier, just off the motorway's edge
    let piers = 0;
    for (let x = -11; x <= 11; x += 0.5) for (let z = -5; z <= 5; z += 0.5) if (Math.abs(x) > 8 && walk.touching(x, z, 0.6, -4.7)) piers++;
    expect(piers).toBeGreaterThan(0);
  });
  it("a house under a bridge's deck is held under it (or gone where no storey fits); the survey's block there is the deck, gone", () => {
    // (a street along the west bank under it: the deck stands 5 m over it there)
    const roads = [road([[-200, 0], [-190, 0]]), road([[-190, 0], [120, 0]], { br: 'yes', l: 1 }), road([[120, 0], [200, 0]]), road([[-100, -60], [-100, 60]], { c: 'residential', w: 6.5 })];
    const ch = chainBridges(roads)[0], pf = bridgeProfile(ch, river, crossingsUnder(ch, roads, [], river));
    const deckAt = (x: number) => profileAt(pf, nearestOn(ch, x, 0).S);
    // (on the west bank, 2 m up: where the deck stands highest over it, and where it comes down to it)
    let hi = -186, lo = -186;
    for (let x = -186; x <= -62; x += 2) { if (deckAt(x) > deckAt(hi)) hi = x; if (deckAt(x) < deckAt(lo)) lo = x; }
    expect(deckAt(hi) - 1.6 - 2).toBeGreaterThan(2.6 + 1); // (room for a storey there: the case under test)
    const ring = (cx: number, cz: number, s: number) => box(cx, cz, s, s).flatMap(([x, z]) => [m(x), m(z)]);
    const under = { r: ring(hi, 2, 2.5), h: 30, gen: undefined as string | undefined, hy: undefined as number | undefined };
    const low = { r: ring(lo, 2, 2.5), h: 9 };
    const phantom = { r: ring(hi, -2, 2.5), h: 12, gen: 'lidar' };
    const away = { r: ring(-90, 40, 4), h: 30 };
    const kept = fitUnderDecks([under, low, phantom, away], roads, river);
    expect(kept).toContain(under);
    expect(kept).toContain(away);
    expect(kept).not.toContain(phantom);
    expect(away.h).toBe(30);
    expect(under.hy!).toBeLessThanOrEqual(deckAt(hi) - 1.5);
    expect(under.h).toBeLessThan(deckAt(hi) - 1.5);
    if (deckAt(lo) - 1.6 - 2 < 2.6) expect(kept).not.toContain(low);
  });

  it("a building's walls stop at its ridge: a car on a deck over it passes; a walker at its foot doesn't", () => {
    const f = { ring: box(0, 0, 5, 4), top: 6, ridge: 9, pitched: true, kind: 'house' };
    const walk = new WalkWorld(river, { x0: -400, z0: -400, x1: 400, z1: 400 });
    walk.addPolygon(f.ring, null, null, -Infinity, wallTop(f));
    expect(walk.touching(0, -4.9, 0.6, 2)).toBe(true);
    expect(walk.touching(0, -4.9, 0.6, 12)).toBe(false);
    // a tower's tiers count
    expect(wallTop({ ...f, tiers: [{ ring: f.ring, lo: 9, top: 40 }] })).toBeGreaterThan(40);
  });

  it("a small thing's outline given no top walls only 8 m over the ground under it", () => {
    const w = new RecWalk(river, { x0: -400, z0: -400, x1: 400, z1: 400 });
    w.addLoop(box(-150, 0, 0.15, 0.15)); // a post on the 2 m bank
    w.addLoop(box(-150, 30, 12, 12)); // something big: as before
    const walk = new WalkWorld(river, { x0: -400, z0: -400, x1: 400, z1: 400 });
    replayOps(walk, w.ops, river);
    expect(walk.touching(-150, 0.3, 0.3, 3)).toBe(true);
    expect(walk.touching(-150, 0.3, 0.3, 11)).toBe(false);
    expect(walk.touching(-150, 30 - 12.2, 0.3, 50)).toBe(true);
  });

  it("a street's guessed parking given back where its shops stand: that stretch at its travel lanes' width, cut there, the rest as it was", () => {
    // (Asheville's Wall Street: 10.9 m — two parked lanes the tile service guessed — and its shops' fronts
    // 4.5 m off the centre line, inside the asphalt, their stoops in the lane)
    const box = { x0: 0, z0: -100, x1: 256, z1: 100 };
    const m = (v: number) => Math.round(v * 10);
    const street = (): Road => ({ p: [m(10), 0, m(110), 0, m(210), 0], c: 'residential', w: 10.9, pk: 5, n: 'Wall Street' });
    const shop = (x0: number, x1: number, z0: number, z1: number, more: Partial<Building> = {}): Building => ({ r: [m(x0), m(z0), m(x1), m(z0), m(x1), m(z1), m(x0), m(z1)], h: 8, k: 'commercial', roof: 'flat', s: 1, ...more });
    // a row of shops 4.5 m north of the centre line from x 70 to 150, an alley 4 m wide at 108
    const row = [shop(70, 108, -16, -4.5), shop(112, 150, -16, -4.5)];
    const out = fitToFronts([street()], row, box);
    expect(out.length).toBe(3);
    const [a, b, c] = out;
    expect([a.w, a.pk]).toEqual([10.9, 5]);
    expect([b.w, b.pk]).toEqual([6.5, NO_PARK]);
    expect([c.w, c.pk]).toEqual([10.9, 5]);
    // the narrowed stretch covers the row (an alley's gap doesn't break it) and no more than a few metres past
    const xs = (r: Road) => [r.p[0] / 10, r.p[r.p.length - 2] / 10];
    expect(xs(b)[0]).toBeLessThanOrEqual(70);
    expect(xs(b)[0]).toBeGreaterThan(60);
    expect(xs(b)[1]).toBeGreaterThanOrEqual(150);
    expect(xs(b)[1]).toBeLessThan(160);
    // one street still: each part starts where the last ended, ends at the way's own, a vertex kept between
    expect(xs(a)[0]).toBe(10);
    expect(xs(a)[1]).toBe(xs(b)[0]);
    expect(xs(b)[1]).toBe(xs(c)[0]);
    expect(xs(c)[1]).toBe(210);
    expect(b.p).toContain(m(110));
    expect(b.n).toBe('Wall Street');
    // …and settled: fitting again changes nothing
    expect(fitToFronts(out, row, box)).toBe(out);
    // a sidewalk's room between the kerb and the fronts (5.45 m half-width, fronts 7.5 m off): left alone
    const roads = [street()];
    expect(fitToFronts(roads, [shop(70, 150, -16, -7.5)], box)).toBe(roads);
    // a whole street of fronts: the one way, narrowed, not cut
    const whole = fitToFronts([street()], [shop(0, 220, -16, -4.5)], box);
    expect(whole.length).toBe(1);
    expect(whole[0].w).toBe(6.5);
    expect(whole[0].p).toEqual(street().p);
    // not a front: a skyway (lifted), a canopy, the survey's guess; not the tile's to fit: a neighbour's way
    for (const b of [shop(70, 150, -16, -4.5, { lf: 6 }), shop(70, 150, -16, -4.5, { cn: 1 }), shop(70, 150, -16, -4.5, { gen: 'lidar' })]) {
      const rs = [street()];
      expect(fitToFronts(rs, [b], box)).toBe(rs);
    }
    const ctx = [{ ...street(), own: 0 }];
    expect(fitToFronts(ctx, row, box)).toBe(ctx);
    // a wide one-way (four lanes, both kerbs parked: 18.2 m) given back its parking where its fronts stand,
    // and the paint lays none there of its own (a wide street parks both kerbs where the map says nothing)
    const wide = fitToFronts([{ ...street(), c: 'secondary', w: 18.2, ow: 1 }], [shop(0, 220, -16, -8.5)], box);
    expect(wide.map((r) => [r.w, r.pk])).toEqual([[13.8, NO_PARK]]);
    expect(laneLayout(wide[0], 13.2, true).park).toEqual([]);
    expect(laneLayout({}, 13.2, true).park.length).toBe(2);
    // a canyon: Lawyers Alley tagged 15 m wide (feet, read as metres), its buildings 4.3 m off both sides —
    // as wide as the room between them less a 1.5 m sidewalk each side; a one-way down to its one lane;
    // a street with the room left alone; a motorway's mapped lanes never
    const alley = (more: Partial<Road> = {}): Road => ({ p: [m(10), 0, m(210), 0], c: 'residential', w: 15, n: 'Lawyers Alley', ...more });
    const both = [shop(0, 220, -16, -4.3), shop(0, 220, 4.3, 16)];
    expect(fitToFronts([alley()], both, box).map((r) => r.w)).toEqual([5.6]);
    expect(fitToFronts([alley({ ow: 1 })], both, box).map((r) => r.w)).toEqual([5.6]);
    expect(fitToFronts([alley({ ow: 1 })], [shop(0, 220, -16, -3.2), shop(0, 220, 3.2, 16)], box).map((r) => r.w)).toEqual([3.6]);
    const roomy = [alley()];
    expect(fitToFronts(roomy, [shop(0, 220, -16, -9.5), shop(0, 220, 9.5, 16)], box)).toBe(roomy);
    const motorway = [alley({ c: 'motorway' })];
    expect(fitToFronts(motorway, both, box)).toBe(motorway);
    // a short front (a kiosk, 8 m) isn't a stretch
    const kiosk = [street()];
    expect(fitToFronts(kiosk, [shop(100, 108, -10, -4.5)], box)).toBe(kiosk);
  });
  it("a parked car isn't in a street's way: at its kerb, in a lot, an angled bay — yes; across a side street's mouth, across the lanes, on a centreline — no", () => {
    const main = road([[-100, 0], [100, 0]], { c: 'primary', w: 11 }); // east–west, its kerbs at z ±5.5
    const side = road([[20, 0], [20, 60]], { c: 'residential', w: 6.5 }); // a side street meeting it from the south
    const drive = road([[-40, 6], [-40, 20]], { c: 'service', w: 3 }); // a driveway
    const through = streetThrough([main, side, drive]);
    const hl = 2.35, hw = 1.0, kerbZ = 5.5 - 1.15;
    expect(through(box(-10, kerbZ, hl, hw, Math.PI / 2))).toBe(false); // along its kerb
    expect(through(box(-10, 20, hl, hw, 0))).toBe(false); // in a lot behind the kerb
    expect(through(box(-10, 5.5 - 2.4, hl, hw, Math.PI / 2 - 0.96))).toBe(false); // an angled bay (55°)
    expect(through(box(20 - 2, kerbZ, hl, hw, Math.PI / 2))).toBe(true); // across the side street's mouth
    expect(through(box(16.9, kerbZ, hl, hw, Math.PI / 2))).toBe(true); // …its end just short of the side street's line
    expect(through(box(-10, 3.2, hl, hw, 0))).toBe(true); // nose-in across the main road's lanes
    expect(through(box(-40, 8, hl, hw, 0))).toBe(true); // on the driveway's line (its own car is tested without it: props.ts)
    expect(streetThrough([main, side])(box(-40, 8, hl, hw, 0))).toBe(false);
    // a bridge's deck over it doesn't count
    expect(streetThrough([road([[-100, 50], [100, 50]], { br: 'yes', l: 1 })])(box(0, 50, hl, hw, Math.PI / 2))).toBe(false);
  });
});
