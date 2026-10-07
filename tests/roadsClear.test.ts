// Robby, 2026-10-07: "going over sandy hook bridge and driving through main cities sometimes the roads
// have walls or buildings in them where they are not supposed to". What stood in the way, each kept
// out: a divided road's two one-way bridges each a two-way road's width (their parapets in each
// other's lanes); houses under a bridge's deck, and the survey's blocks that were the deck itself,
// standing up through it; every building's walls (and a post's, a tree's) reaching to the sky over a
// deck; a tree on the bank under a bridge; parked cars across a side street's mouth or a road's lanes.
import { describe, it, expect } from 'vitest';
import { Terrain, TerrainLayer, type GridHeader, type LayerLayout, type Road } from '../src/world/data';
import { WalkWorld } from '../src/player/collision';
import { RecWalk, replayOps } from '../src/world/pack';
import { buildStructures } from '../src/world/structures';
import { fitUnderDecks, chainBridges, bridgeProfile, crossingsUnder, nearestOn, profileAt } from '../src/world/bridges';
import { narrowOneWays } from '../src/world/realTile';
import { streetThrough } from '../src/world/kerbside';
import { wallTop } from '../src/world/buildings';

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
const world = (roads: Road[]) => ({ json: { roads, lines: [], areas: [], points: [], buildings: [] }, terrain: river }) as never;
const box = (cx: number, cz: number, hl: number, hw: number, yaw = 0): [number, number][] => {
  const c = Math.cos(yaw), s = Math.sin(yaw);
  return [[-hw, -hl], [hw, -hl], [hw, hl], [-hw, hl]].map(([u, v]) => [cx + u * c + v * s, cz - u * s + v * c] as [number, number]);
};

describe('roads kept clear', () => {
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
