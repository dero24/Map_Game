import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { Terrain, TerrainLayer, type GridHeader, type LayerLayout, type Road } from '../src/world/data';
import { WalkWorld } from '../src/player/collision';
import { RecWalk, packDeck, unpackDeck, replayOps, type WalkOp } from '../src/world/pack';
import { buildStructures } from '../src/world/structures';
import { chainBridges, bridgeProfile, crossingsUnder, profileAt, chainAt, CLEAR_MOVABLE, LIFT, type Profile } from '../src/world/bridges';
import rumson from './fixtures/rumson-bridge.json';

// ---------------- fixtures ----------------
/** A terrain from a lattice of heights (cm) and shore distances (dm, negative in the water). */
function terrainOf(grid: GridHeader, h: ArrayLike<number>, sdf: ArrayLike<number>) {
  const n = grid.w * grid.h, buf = new ArrayBuffer(n * 7);
  new Int16Array(buf, 0, n).set(Array.from(h));
  new Int16Array(buf, 2 * n, n).set(Array.from(sdf));
  const flags = new Uint8Array(buf, 5 * n, n);
  for (let i = 0; i < n; i++) flags[i] = sdf[i] < 0 ? 1 : 0;
  const L: LayerLayout = {
    grid,
    height: { offset: 0, length: n, type: 'Int16Array' }, sdf: { offset: 2 * n, length: n, type: 'Int16Array' },
    cover: { offset: 4 * n, length: n, type: 'Uint8Array' }, flags: { offset: 5 * n, length: n, type: 'Uint8Array' },
    oceanD: { offset: 6 * n, length: n, type: 'Uint8Array' },
  };
  const l = new TerrainLayer(buf, L);
  return new Terrain(l, l);
}

// A river 100 m wide between a 4.2 m bank (west) and a 1.2 m one (east), its bed 2.6 m down; a
// primary road crossing it on three bridge ways — a fixed approach span each side and a bascule
// over the channel — with a sidewalk mapped as a way of its own along the south side.
const river = (() => {
  const grid = { x0: -200, z0: -60, cell: 2, w: 200, h: 60 };
  const h: number[] = [], sdf: number[] = [];
  for (let j = 0; j < grid.h; j++)
    for (let i = 0; i < grid.w; i++) {
      const x = grid.x0 + (i + 0.5) * grid.cell, d = Math.abs(x) - 50;
      const bank = x < 0 ? 4.2 : 1.2;
      h.push(Math.round(100 * (d >= 10 ? bank : d >= 0 ? -0.5 + ((bank + 0.5) * d) / 10 : Math.max(-2.6, -0.5 + d * 0.2))));
      sdf.push(Math.round(d * 10));
    }
  return terrainOf(grid, h, sdf);
})();
const m = (v: number) => Math.round(v * 10);
const road = (pts: [number, number][], extra: Partial<Road> = {}): Road => ({ p: pts.flatMap(([x, z]) => [m(x), m(z)]), c: 'primary', w: 11, n: 'River Road', ...extra });
const riverRoads = (ownWest: boolean, ownEast: boolean): Road[] => [
  road([[-200, 0], [-120, 0]]),
  road([[-120, 0], [-15, 0]], { br: 'yes', l: 1, ...(ownWest ? {} : { own: 0 }) }),
  road([[-15, 0], [15, 0]], { br: 'movable', l: 1, ...(ownWest ? {} : { own: 0 }) }),
  road([[15, 0], [120, 0]], { br: 'yes', l: 1, ...(ownEast ? {} : { own: 0 }) }),
  road([[120, 0], [200, 0]]),
  road([[-121, 8.5], [121, 8.5]], { c: 'footway', w: 1.6, n: undefined, br: 'yes', l: 1, ...(ownEast ? {} : { own: 0 }) }),
];
const world = (t: Terrain, roads: Road[]) => ({ json: { roads: roads.filter((r) => r.own !== 0), lines: [], areas: [], points: [], buildings: [] }, terrain: t }) as never;

/** The heights the straight line between a profile's landed ends asks for, station by station. */
const line = (pf: Profile, L: number) => pf.S.map((s) => pf.ends[0].h + ((pf.ends[1].h - pf.ends[0].h) * s) / L);
const roadwayDecks = (ops: WalkOp[]) => ops.flatMap((o) => (o.o === 'd' && o.d.p?.k === 'table' && o.d.hw > 4 ? [unpackDeck(o.d)] : []));
const near = (a: number, b: number, tol: number) => Math.abs(a - b) <= tol;

// ---------------- the long section ----------------
describe('a bridge’s long section', () => {
  const roads = riverRoads(true, true);
  const [ch] = chainBridges(roads);
  const pf = bridgeProfile(ch, river, crossingsUnder(ch, roads, [], river));

  it('chains the ways into one bridge, from its west end', () => {
    expect(chainBridges(roads)).toHaveLength(1);
    expect(ch.ways.map((w) => w.movable)).toEqual([false, true, false]);
    expect(ch.pts[0]).toEqual([-120, 0]);
    expect(ch.L).toBeCloseTo(240, 6);
    expect(ch.ends.every((e) => e.approach)).toBe(true);
  });

  it('lands on its approach streets at their own height', () => {
    expect(pf.ends.every((e) => e.land)).toBe(true);
    expect(pf.y[0]).toBeCloseTo(river.heightAt(-120, 0) + LIFT, 3);
    expect(pf.y[pf.y.length - 1]).toBeCloseTo(river.heightAt(120, 0) + LIFT, 3);
  });

  it('never sags below the straight line between its ends', () => {
    const ln = line(pf, ch.L);
    for (let i = 0; i < pf.y.length; i++) expect(pf.y[i], `station ${pf.S[i].toFixed(1)}`).toBeGreaterThanOrEqual(ln[i] - 0.02);
  });

  it('stands its clearance over the water: a bascule’s closed clearance over the channel', () => {
    let channel = 0;
    for (let i = 0; i < pf.S.length; i++) {
      const s = pf.S[i], soffit = pf.y[i] - pf.depth[i];
      if (s >= 105 && s <= 135) (channel++, expect(soffit, `channel at ${s.toFixed(1)}`).toBeGreaterThanOrEqual(CLEAR_MOVABLE - 0.05));
      // (clear of the water everywhere off the end spans' last few metres to the bank)
      if (pf.level[i] > -Infinity && s > 25 && s < ch.L - 25) expect(soffit - pf.level[i], `over the water at ${s.toFixed(1)}`).toBeGreaterThan(1);
    }
    expect(channel).toBeGreaterThan(10);
  });

  it('climbs at a road’s grade, and its leaves run straight from heel to heel', () => {
    for (let i = 1; i < pf.S.length; i++) expect(Math.abs(pf.y[i] - pf.y[i - 1]) / (pf.S[i] - pf.S[i - 1])).toBeLessThan(0.07);
    const leaf = pf.S.map((s, i) => [s, pf.y[i]]).filter(([s]) => s >= 105 && s <= 135);
    for (let i = 1; i + 1 < leaf.length; i++) {
      const [s0, y0] = leaf[i - 1], [s1, y1] = leaf[i], [s2, y2] = leaf[i + 1];
      expect(y1).toBeCloseTo(y0 + ((y2 - y0) * (s1 - s0)) / (s2 - s0), 6);
    }
  });

  it('is the same section every time', () => {
    const again = bridgeProfile(chainBridges(riverRoads(true, true))[0], river);
    expect(again.y).toEqual(pf.y);
  });
});

// ---------------- the deck as built ----------------
describe('a bridge as built', () => {
  const buildFor = (t: Terrain, roads: Road[]) => {
    const w = new RecWalk(t, { x0: -400, z0: -400, x1: 400, z1: 400 });
    const out = buildStructures(world(t, roads), w, { roads, lines: [] });
    return { w, out, mesh: out.group.children.find((c) => (c as THREE.Mesh).isMesh && !(c as THREE.InstancedMesh).isInstancedMesh) as THREE.Mesh };
  };

  it('two tiles that each own part of it profile the whole of it: their pieces meet, high over the river', () => {
    const a = buildFor(river, riverRoads(true, false)), b = buildFor(river, riverRoads(false, true));
    const da = roadwayDecks(a.w.ops), db = roadwayDecks(b.w.ops);
    expect(da).toHaveLength(2); // (the west approach and the bascule: tile A's)
    expect(db).toHaveLength(1);
    const end = da.find((d) => near(d.pts[d.pts.length - 1][0], 15, 1e-6))!, start = db[0];
    expect(start.pts[0]).toEqual([15, 0]);
    const ya = end.heightAt(end.cum[end.cum.length - 1]), yb = start.heightAt(0);
    expect(Math.abs(ya - yb)).toBeLessThan(0.001);
    expect(ya).toBeGreaterThan(CLEAR_MOVABLE + 1.5); // (it used to come down to the bank's height here, mid-river)
  });

  it('collision is the deck as drawn: the roadway, the sidewalks over their kerb, walls at the parapets', () => {
    const roads = riverRoads(true, true);
    const { w, mesh } = buildFor(river, roads);
    const walk = new WalkWorld(river, { x0: -400, z0: -400, x1: 400, z1: 400 });
    replayOps(walk, w.ops);
    const ch = chainBridges(roads)[0];
    const pos = mesh.geometry.attributes.position, nrm = mesh.geometry.attributes.normal, col = mesh.geometry.attributes.color;
    const asphalt = new THREE.Color(0x74767a), grid = new THREE.Color(0x5f6266), walkway = new THREE.Color(0xcfc9bc);
    const is = (i: number, c: THREE.Color) => near(col.getX(i), c.r, 1e-4) && near(col.getY(i), c.g, 1e-4) && near(col.getZ(i), c.b, 1e-4);
    let road = 0, side = 0;
    for (let i = 0; i < pos.count; i++) {
      if (nrm.getY(i) < 0.99) continue;
      const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
      if (Math.abs(x) > 119.5) continue; // (the ends: the street's own ground runs on past them)
      // (a roadway vertex is on its kerb line, where the sidewalk's deck begins: read it a little in)
      if ((is(i, asphalt) || is(i, grid)) && Math.abs(z) > 5) (road++, expect(walk.deckAt(x, z - Math.sign(z) * 0.3)!, `roadway at ${x.toFixed(1)},${z.toFixed(1)}`).toBeCloseTo(y, 2));
      if (is(i, walkway) && Math.abs(z) > 5.6) (side++, expect(walk.deckAt(x, z)!, `sidewalk at ${x.toFixed(1)},${z.toFixed(1)}`).toBeCloseTo(y, 2));
    }
    expect(road).toBeGreaterThan(50);
    expect(side).toBeGreaterThan(50);
    // the south sidewalk carries the mapped footway out to its far edge (8.5 m out, 0.8 m wide)
    const mid = chainAt(ch, 120);
    expect(walk.deckAt(mid.x, 9.1)).not.toBeNull();
    // the parapets stop a walker on the deck; a boat under it passes
    const deckY = walk.deckAt(-60, 0)!;
    expect(walk.touching(-60, 9.3, 0.3, deckY + 0.15)).toBe(true);
    expect(walk.touching(-60, -7.1, 0.3, deckY + 0.15)).toBe(true);
    expect(walk.touching(-60, 9.3, 0.3, 0)).toBe(false);
    // square ends: past the deck's end the street's own ground, not the deck hanging on
    expect(walk.deckAt(-121.5, 0)).toBeNull();
    expect(walk.deckAt(121.5, 0)).toBeNull();
  });

  it('a bascule stands on its piers with a tender house at each corner, fenders off them', () => {
    const { out } = buildFor(river, riverRoads(true, true));
    expect(out.towers).toHaveLength(4);
    for (const t of out.towers) expect(t.y).toBeGreaterThan(CLEAR_MOVABLE + 4);
    const piles = out.group.children.find((c) => (c as THREE.InstancedMesh).isInstancedMesh && (c as THREE.InstancedMesh).count > 10 && c.name === '') as THREE.InstancedMesh;
    expect(piles).toBeDefined();
  });

  it('is built the same every time', () => {
    const a = buildFor(river, riverRoads(true, true)), b = buildFor(river, riverRoads(true, true));
    expect(JSON.stringify(b.w.ops)).toBe(JSON.stringify(a.w.ops));
    expect(Array.from(b.mesh.geometry.attributes.position.array)).toEqual(Array.from(a.mesh.geometry.attributes.position.array));
  });
});

// ---------------- what carries the deck (OSM bridge:structure) ----------------
describe('a bridge the map says how it’s built', () => {
  // a gorge 40 m deep, a creek at its foot; and a sound 700 m wide
  const gorge = (() => {
    const grid = { x0: -200, z0: -40, cell: 2, w: 200, h: 40 }, h: number[] = [], sdf: number[] = [];
    for (let j = 0; j < grid.h; j++)
      for (let i = 0; i < grid.w; i++) {
        const x = Math.abs(grid.x0 + (i + 0.5) * grid.cell);
        h.push(Math.round(100 * (x > 60 ? 40 : 40 * (x / 60) ** 2)));
        sdf.push(Math.round((x - 4) * 10));
      }
    return terrainOf(grid, h, sdf);
  })();
  const wide = (() => {
    const grid = { x0: -500, z0: -40, cell: 4, w: 250, h: 20 }, h: number[] = [], sdf: number[] = [];
    for (let j = 0; j < grid.h; j++)
      for (let i = 0; i < grid.w; i++) {
        const d = Math.abs(grid.x0 + (i + 0.5) * grid.cell) - 350;
        h.push(d >= 0 ? 150 : -800);
        sdf.push(Math.round(d * 10));
      }
    return terrainOf(grid, h, sdf);
  })();
  const span = (t: Terrain, x0: number, x1: number, bs?: string, c = 'secondary') => {
    const roads = [road([[x0 - 50, 0], [x0, 0]], { c }), road([[x0, 0], [x1, 0]], { c, w: 9, br: 'yes', l: 1, ...(bs ? { bs } : {}) }), road([[x1, 0], [x1 + 50, 0]], { c })];
    const w = new RecWalk(t, { x0: -600, z0: -600, x1: 600, z1: 600 });
    const out = buildStructures(world(t, roads), w, { roads, lines: [] });
    const mesh = out.group.children.find((o) => o.name === 'structures') as THREE.Mesh;
    return { w, out, verts: mesh.geometry.attributes.position.count, pos: mesh.geometry.attributes.position.array as Float32Array };
  };
  const finite = (a: Float32Array) => a.every((v) => Number.isFinite(v));

  it('a truss, an arch over the river, an arch under a deck over a gorge: more than girders, and sound', () => {
    for (const [t, x0, x1, bs] of [[river, -120, 120, 'truss'], [river, -60, 60, 'arch'], [gorge, -70, 70, 'arch']] as const) {
      const plain = span(t, x0, x1), built = span(t, x0, x1, bs);
      expect(built.verts, `${bs} over ${x1 - x0} m`).toBeGreaterThan(plain.verts + 300);
      expect(built.verts).toBeLessThan(40000);
      expect(finite(built.pos)).toBe(true);
      expect(roadwayDecks(built.w.ops).length).toBeGreaterThan(0);
    }
  });

  it('a suspension bridge hangs from two towers, a cable-stayed one from its pylons; both stand in the water', () => {
    for (const [bs, n] of [['suspension', 2], ['cable-stayed', 2]] as const) {
      const b = span(wide, -400, 400, bs, 'motorway');
      expect(b.out.towers, bs).toHaveLength(n);
      for (const tw of b.out.towers) expect(tw.y).toBeGreaterThan(20);
      expect(b.verts).toBeLessThan(80000);
      expect(finite(b.pos)).toBe(true);
      const walk = new WalkWorld(wide, { x0: -600, z0: -600, x1: 600, z1: 600 });
      replayOps(walk, b.w.ops);
      const tw = b.out.towers[0];
      // (a tower's legs stand either side of the deck: a swimmer at the water meets them)
      let hit = false;
      for (let dz = -20; dz <= 20 && !hit; dz += 0.5) hit = walk.touching(tw.x, tw.z + dz, 0.4, 0);
      expect(hit, bs).toBe(true);
    }
  });
});

// ---------------- bridges over bridges ----------------
describe('a flyover', () => {
  it('clears the bridge under it by a road’s clearance (its OSM layer says which is over)', () => {
    const flat = terrainOf({ x0: -200, z0: -200, cell: 4, w: 100, h: 100 }, new Array(10000).fill(100), new Array(10000).fill(500));
    const roads = [
      road([[-200, 0], [-150, 0]], { c: 'secondary', w: 9 }), road([[-150, 0], [150, 0]], { c: 'secondary', w: 9, br: 'yes', l: 1 }), road([[150, 0], [200, 0]], { c: 'secondary', w: 9 }),
      road([[0, -200], [0, -160]], { c: 'motorway', w: 12 }), road([[0, -160], [0, 160]], { c: 'motorway', w: 12, br: 'yes', l: 2 }), road([[0, 160], [0, 200]], { c: 'motorway', w: 12 }),
    ];
    const w = new RecWalk(flat, { x0: -300, z0: -300, x1: 300, z1: 300 });
    buildStructures(world(flat, roads), w, { roads, lines: [] });
    const walk = new WalkWorld(flat, { x0: -300, z0: -300, x1: 300, z1: 300 });
    replayOps(walk, w.ops);
    const [lo, hi] = walk.decksAt(0, 0).sort((a, b) => a - b);
    expect(lo).toBeGreaterThan(1);
    expect(hi - lo).toBeGreaterThan(5 + 1); // (5 m to its soffit, and its girders)
  });
});

// ---------------- a ramp onto a bridge ----------------
describe('a ramp that runs onto a bridge’s deck', () => {
  it('meets it at its height, and neither parapet stands across the other’s roadway', () => {
    // the river crossing, and a ramp up from the east bank that joins its deck over the water
    const roads = [...riverRoads(true, true), road([[60, 40], [30, 0]], { c: 'primary_link', w: 6, n: undefined, br: 'yes', l: 1, ow: 1 }), road([[90, 80], [60, 40]], { c: 'primary_link', w: 6, n: undefined, ow: 1 })];
    // (the ramp meets the east approach at a vertex of its own)
    roads[3] = road([[15, 0], [30, 0], [120, 0]], { br: 'yes', l: 1 });
    const w = new RecWalk(river, { x0: -400, z0: -400, x1: 400, z1: 400 });
    buildStructures(world(river, roads), w, { roads, lines: [] });
    const walk = new WalkWorld(river, { x0: -400, z0: -400, x1: 400, z1: 400 });
    replayOps(walk, w.ops);
    const tables = w.ops.flatMap((o) => (o.o === 'd' && o.d.p?.k === 'table' ? [unpackDeck(o.d)] : []));
    const ramp = tables.filter((d) => d.pts.some(([, z]) => z > 30)).sort((a, b) => b.halfWidth - a.halfWidth)[0];
    expect(ramp).toBeDefined();
    const main = roadwayDecks(w.ops).find((d) => d.pts.some(([x, z]) => near(x, 30, 1e-6) && near(z, 0, 1e-6)))!;
    const at30 = main.heightAt(main.cum[main.pts.findIndex(([x]) => near(x, 30, 1e-6))]);
    const rampEnd = ramp.pts.findIndex(([x, z]) => near(x, 30, 1e-6) && near(z, 0, 1e-6));
    expect(Math.abs(ramp.heightAt(ramp.cum[rampEnd]) - at30)).toBeLessThan(0.001);
    // a car coming up the ramp crosses the main deck's south parapet line where the ramp joins…
    const y = walk.deckAt(37, 9.3)!;
    expect(y).toBeGreaterThan(3);
    expect(walk.touching(37, 9.3, 0.3, y)).toBe(false);
    // …which still stands away from it
    expect(walk.touching(80, 9.3, 0.3, walk.deckAt(80, 8)! + 0.15)).toBe(true);
  });
});

// ---------------- a long bridge, seen a piece at a time ----------------
describe('a long bridge no tile sees whole', () => {
  // 400 m of water, a trunk road over it on three ways; each tile sees its own way and the next
  // one in, never the far one (a tile carries only the ways within 48 m of its cell)
  const grid = { x0: -520, z0: -20, cell: 2, w: 520, h: 20 };
  const h: number[] = [], sdf: number[] = [];
  for (let j = 0; j < grid.h; j++)
    for (let i = 0; i < grid.w; i++) {
      const d = Math.abs(grid.x0 + (i + 0.5) * grid.cell) - 200;
      h.push(d >= 0 ? 100 : -600);
      sdf.push(Math.round(d * 10));
    }
  const sound = terrainOf(grid, h, sdf);
  const way = (x0: number, x1: number, br = true): Road => road([[x0, 0], [x1, 0]], { c: 'trunk', w: 12, n: 'Causeway', ...(br ? { br: 'yes' as const, l: 1 } : {}) });
  const [aW, w1, w2, w3, aE] = [way(-500, -420, false), way(-420, -40), way(-40, 40), way(40, 420), way(420, 500, false)];
  const at = (roads: Road[], x: number) => {
    const ch = chainBridges(roads)[0];
    return profileAt(bridgeProfile(ch, sound), x - ch.pts[0][0]);
  };
  it('every tile gives the crossing its full width, so the pieces meet at its full clearance', () => {
    const A = [aW, w1, w2], B = [w1, w2, w3], C = [w2, w3, aE];
    expect(Math.abs(at(A, -40) - at(B, -40))).toBeLessThan(0.001);
    expect(Math.abs(at(C, 40) - at(B, 40))).toBeLessThan(0.001);
    expect(at(B, -40)).toBeGreaterThan(17.5); // (400 m of water under a highway: 17.5 m to its soffit)
  });
});

// ---------------- the Rumson–Sea Bright bridge (the baked shore pack) ----------------
describe('the Rumson–Sea Bright bascule, as the shore pack maps it', () => {
  const fx = rumson as unknown as { grid: GridHeader; height: number[]; sdf: number[]; tiles: Record<string, { box: { x0: number; z0: number; x1: number; z1: number }; roads: Road[] }> };
  const t = terrainOf(fx.grid, fx.height, fx.sdf);
  const seaBright = (id: string) => {
    const roads = fx.tiles[id].roads;
    const ch = chainBridges(roads).find((c) => c.movable)!;
    return { ch, pf: bridgeProfile(ch, t, crossingsUnder(ch, roads, [], t)), roads };
  };
  const W = seaBright('-1_-1'), E = seaBright('0_-1');

  it('both its tiles see the whole bridge and profile it alike (it sagged to the water at their seam)', () => {
    for (const { ch } of [W, E]) {
      expect(ch.ways).toHaveLength(3);
      expect(ch.L).toBeGreaterThan(195);
    }
    expect(W.ch.ways.map((w) => w.own)).toEqual([true, true, false]);
    expect(E.ch.ways.map((w) => w.own)).toEqual([false, false, true]);
    expect(E.pf.y).toEqual(W.pf.y);
    const seam = W.ch.ways[2].s0; // (the bascule's east heel: where the tiles' pieces meet)
    expect(profileAt(W.pf, seam)).toBeGreaterThan(4.5);
  });

  it('meets Rumson Road at both ends, and never sags below the line between them', () => {
    const { ch, pf } = W;
    const [a, b] = [ch.pts[0], ch.pts[ch.pts.length - 1]];
    expect(Math.abs(pf.y[0] - (t.heightAt(a[0], a[1]) + LIFT))).toBeLessThan(0.01);
    expect(Math.abs(pf.y[pf.y.length - 1] - (t.heightAt(b[0], b[1]) + LIFT))).toBeLessThan(0.01);
    const ln = line(pf, ch.L);
    for (let i = 0; i < pf.y.length; i++) expect(pf.y[i]).toBeGreaterThanOrEqual(ln[i] - 0.02);
  });

  it('stands clear of the Shrewsbury: three metres under its leaves, clear of the water off its end spans', () => {
    const { ch, pf } = W;
    const leaf = ch.ways[1];
    for (let i = 0; i < pf.S.length; i++) {
      const s = pf.S[i], soffit = pf.y[i] - pf.depth[i];
      if (s >= leaf.s0 && s <= leaf.s1) expect(soffit, `under the leaves at ${s.toFixed(1)}`).toBeGreaterThan(3);
      if (pf.level[i] > -Infinity && s > 30 && s < ch.L - 30) expect(soffit - pf.level[i], `over the water at ${s.toFixed(1)}`).toBeGreaterThan(0.75);
    }
  });

  it('its collision is its deck as drawn, both tiles’ pieces of it', () => {
    // (both tiles mounted, as the stream mounts them: each one's collision in the one walk world)
    const walk = new WalkWorld(t, { x0: -400, z0: -600, x1: 400, z1: -200 });
    const built = ['-1_-1', '0_-1'].map((id) => {
      const roads = fx.tiles[id].roads, w = new RecWalk(t, { x0: -400, z0: -600, x1: 400, z1: -200 });
      const out = buildStructures({ json: { roads: roads.filter((r) => r.own !== 0), lines: [], areas: [], points: [], buildings: [] }, terrain: t } as never, w, { roads, lines: [] });
      replayOps(walk, w.ops);
      return { id, out };
    });
    let n = 0;
    for (const { id, out } of built) {
      const { ch } = seaBright(id);
      const mesh = out.group.children.find((o) => o.name === 'structures') as THREE.Mesh;
      const pos = mesh.geometry.attributes.position, nrm = mesh.geometry.attributes.normal, col = mesh.geometry.attributes.color;
      const roadway = [new THREE.Color(0x74767a), new THREE.Color(0x5f6266)];
      for (let i = 0; i < pos.count; i++) {
        if (nrm.getY(i) < 0.99 || !roadway.some((c) => near(col.getX(i), c.r, 1e-4) && near(col.getY(i), c.g, 1e-4) && near(col.getZ(i), c.b, 1e-4))) continue;
        // (a roadway vertex sits on its kerb line: read the deck a little in from it, toward the
        // centreline; and not at the bridge's very ends, where the street's ground runs on)
        const x = pos.getX(i), z = pos.getZ(i);
        let best = Infinity, cx = 0, cz = 0, sAt = 0;
        for (let k = 0; k + 1 < ch.pts.length; k++) {
          const [ax, az] = ch.pts[k], [bx, bz] = ch.pts[k + 1], dx = bx - ax, dz = bz - az, l2 = dx * dx + dz * dz;
          const u = Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / l2)), d = Math.hypot(ax + dx * u - x, az + dz * u - z);
          if (d < best) (best = d), (cx = ax + dx * u), (cz = az + dz * u), (sAt = ch.cum[k] + u * Math.sqrt(l2));
        }
        if (sAt < 0.5 || sAt > ch.L - 0.5) continue;
        const f = Math.max(0, best - 0.4) / Math.max(best, 1e-9);
        const yy = walk.deckAt(cx + (x - cx) * f, cz + (z - cz) * f);
        expect(yy, `deck at ${x.toFixed(1)},${z.toFixed(1)}`).not.toBeNull();
        expect(Math.abs(yy! - pos.getY(i)), `deck at ${x.toFixed(1)},${z.toFixed(1)}`).toBeLessThan(0.02);
        n++;
      }
    }
    expect(n).toBeGreaterThan(40);
  });

  it('each tile draws its own spans, and their decks meet to the millimetre', () => {
    const decks = (id: string) => {
      const roads = fx.tiles[id].roads, w = new RecWalk(t, { x0: -400, z0: -600, x1: 400, z1: -200 });
      buildStructures({ json: { roads: roads.filter((r) => r.own !== 0), lines: [], areas: [], points: [], buildings: [] }, terrain: t } as never, w, { roads, lines: [] });
      return roadwayDecks(w.ops);
    };
    const dw = decks('-1_-1'), de = decks('0_-1');
    expect(dw).toHaveLength(2);
    expect(de).toHaveLength(1);
    const heel = dw.find((d) => d.pts[d.pts.length - 1][0] > 0)!, east = de[0];
    expect(heel.pts[heel.pts.length - 1]).toEqual(east.pts[0]);
    expect(Math.abs(heel.heightAt(heel.cum[heel.cum.length - 1]) - east.heightAt(0))).toBeLessThan(0.001);
  });
});

// ---------------- decks ----------------
describe('a bridge’s deck in the walk world', () => {
  it('ships its drawn heights exactly, square at its ends', () => {
    const d = { pts: [[0, 0], [10, 0], [30, 5]] as [number, number][], cum: [0, 10, 10 + Math.hypot(20, 5)], halfWidth: 3, heightAt: () => 0, profile: { k: 'table' as const, y: [1, 2.5, 2] }, cut: 1 as const };
    const u = unpackDeck(packDeck(d));
    expect(u.cut).toBe(1);
    expect(u.heightAt(0)).toBeCloseTo(1, 9);
    expect(u.heightAt(5)).toBeCloseTo(1.75, 9);
    expect(u.heightAt(10)).toBeCloseTo(2.5, 9);
    expect(u.heightAt(d.cum[2])).toBeCloseTo(2, 9);
    const w = new WalkWorld(river, { x0: -100, z0: -100, x1: 100, z1: 100 });
    w.addDeck(u);
    expect(w.deckAt(5, 1)).toBeCloseTo(1.75, 6);
    expect(w.deckAt(-0.5, 0)).toBeNull(); // (past its first point)
    expect(w.deckAt(30.5, 5.2)).toBeNull(); // (past its last)
    const round = unpackDeck(packDeck({ ...d, cut: undefined }));
    w.addDeck({ ...round, pts: round.pts.map(([x, z]) => [x, z + 50] as [number, number]) });
    expect(w.deckAt(-0.5, 50)).toBeCloseTo(1, 6); // (an uncut deck reaches on round its ends, as stairs and piers always have)
  });
});

