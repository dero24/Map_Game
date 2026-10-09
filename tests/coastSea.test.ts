import { describe, it, expect, beforeAll } from 'vitest';
import { coastSea, osmToTile, makeProjector, pointInRing } from '../src/world/realTile';
import type { TileJson } from '../src/world/data';

// The sea a cell's coastline makes (realTile.ts coastSea). Robby, 2026-10-07 (_water_bug.png,
// _water_bug2.png): from Ellis Island and Liberty State Park the bay north of the Statue of Liberty was
// grey ground with straight edges — its cells hold no coast but an island's, or none at all, and their
// sea was never made (bug-harbour-water). OSM's coastline keeps the water on its right; +x east, +z south.

type P2 = [number, number];
const BOX = { x0: 0, z0: 0, x1: 100, z1: 100 };
const inSea = (seas: { o: P2[]; i: P2[][] }[], x: number, z: number) => seas.some((s) => pointInRing(x, z, s.o) && !s.i.some((h) => pointInRing(x, z, h)));

describe('coastSea', () => {
  it('a long straight shore through the box with no vertex in it still makes its sea', () => {
    // west to east along z = 40, kilometres either side: the water on its right, the south
    const seas = coastSea([[[-5000, 40], [5000, 40]]], BOX);
    expect(inSea(seas, 50, 70)).toBe(true);
    expect(inSea(seas, 50, 10)).toBe(false);
    // (before: a stretch began only at a vertex inside the box, and there was none — no sea at all)
  });
  it('an island in the box is a hole in its sea; a box holding only the island is the sea round it', () => {
    // an island 20 m across, its water outside it (anticlockwise on a north-up map: a negative area here)
    const island: P2[] = [[40, 40], [40, 60], [60, 60], [60, 40], [40, 40]];
    const only = coastSea([island], BOX);
    expect(inSea(only, 10, 10)).toBe(true); expect(inSea(only, 90, 90)).toBe(true);
    expect(inSea(only, 50, 50)).toBe(false);
    // with a shore across the box too: the island a hole in the sea south of it
    const both = coastSea([[[-500, 20], [500, 20]], island], BOX);
    expect(inSea(both, 50, 50)).toBe(false); expect(inSea(both, 30, 80)).toBe(true); expect(inSea(both, 30, 10)).toBe(false);
  });
  it('an island the box edge cuts: walked from outside, it bites into the sea (it was flooded whole)', () => {
    // a ring starting inside the box and running out over its west edge and back (anticlockwise on a
    // north-up map: the land on its left)
    const island: P2[] = [[30, 40], [-30, 40], [-30, 60], [30, 60], [30, 40]];
    const seas = coastSea([island], BOX);
    expect(inSea(seas, 20, 50)).toBe(false); // (the island's end in the box)
    expect(inSea(seas, 60, 50)).toBe(true); expect(inSea(seas, 50, 90)).toBe(true);
  });
  it('a box no coast crosses is the side of the nearest coast it lies on: the sea off a shore, nothing inland', () => {
    const shore: P2[][] = [[[-5000, -300], [5000, -300]]]; // 300 m north of the box, its water to the south
    expect(inSea(coastSea([], BOX, shore), 50, 50)).toBe(true);
    const inland: P2[][] = [[[5000, -300], [-5000, -300]]]; // the same shore walked the other way: the box is land
    expect(coastSea([], BOX, inland)).toEqual([]);
    expect(coastSea([], BOX)).toEqual([]); // (no coast known: nothing said)
    // off a headland's tip: the nearest point a corner of the coast, its two pieces' sides added
    const cape: P2[][] = [[[-2000, -100], [-200, -100], [-200, -2000]]]; // land to the north-west (on the left), its tip at (-200, -100)
    expect(inSea(coastSea([], BOX, cape), 50, 50)).toBe(true);
  });
});

// The bay round Ellis Island, built as the tile service builds it (a cell's coastline as its own doc
// holds it, and the coast round it where the land cover calls it water): tests/fixtures/
// harbour-coast.json.gz, the extract's coastline ways round Upper New York Bay.
type Fix = { origin: { lat: number; lon: number }; ways: { type: 'way'; id: number; tags: Record<string, string>; geometry: { lat: number; lon: number }[] }[] };
describe('Upper New York Bay', () => {
  let fx: Fix, P: ReturnType<typeof makeProjector>, ways: (Fix['ways'][number] & { pts: P2[] })[];
  const M = 48;
  beforeAll(async () => {
    // (node's fs and zlib, as mustLoad.test.ts reads its fixtures: the typecheck has no node types)
    const fs = (await import(/* @vite-ignore */ `node:${'fs'}`)) as { readFileSync(p: URL): Uint8Array };
    const zlib = (await import(/* @vite-ignore */ `node:${'zlib'}`)) as { gunzipSync(b: Uint8Array): Uint8Array };
    fx = JSON.parse(new TextDecoder().decode(zlib.gunzipSync(fs.readFileSync(new URL('./fixtures/harbour-coast.json.gz', import.meta.url))))) as Fix;
    P = makeProjector(fx.origin);
    ways = fx.ways.map((w) => ({ ...w, pts: w.geometry.map((g) => P.project(g.lat, g.lon)) }));
  });
  const crosses = (pts: P2[], b: { x0: number; z0: number; x1: number; z1: number }) => pts.some((p, i) => {
    const q = pts[i + 1] ?? p;
    return Math.max(p[0], q[0]) >= b.x0 && Math.min(p[0], q[0]) <= b.x1 && Math.max(p[1], q[1]) >= b.z0 && Math.min(p[1], q[1]) <= b.z1;
  });
  const cells = new Map<string, TileJson>();
  const cell = (cx: number, cz: number, wide = true) => {
    const k = `${cx}_${cz}_${wide}`;
    if (!cells.has(k)) {
      const box = { x0: cx * 1024, z0: cz * 1024, x1: cx * 1024 + 1024, z1: cz * 1024 + 1024 };
      const cb = { x0: box.x0 - M, z0: box.z0 - M, x1: box.x1 + M, z1: box.z1 + M };
      const own = ways.filter((w) => crosses(w.pts, cb)).map(({ pts: _, ...w }) => w);
      let tj = osmToTile({ elements: own }, { id: `${cx}_${cz}`, box, origin: fx.origin });
      // (the service: no sea of its own in a cell the land cover calls water — the coast round it)
      if (wide && !tj.areas.some((a) => a.k === 'sea')) tj = osmToTile({ elements: own }, { id: `${cx}_${cz}`, box, origin: fx.origin, coast: fx.ways });
      cells.set(k, tj);
    }
    return cells.get(k)!;
  };
  const isSea = (lat: number, lon: number, wide = true) => {
    const [x, z] = P.project(lat, lon), cx = Math.floor(x / 1024), cz = Math.floor(z / 1024);
    const un = (f: number[]): P2[] => { const r: P2[] = []; for (let i = 0; i + 1 < f.length; i += 2) r.push([f[i] / 10, f[i + 1] / 10]); return r; };
    return cell(cx, cz, wide).areas.some((a) => a.k === 'sea' && a.o.some((o) => pointInRing(x, z, un(o))) && !a.i.some((h) => pointInRing(x, z, un(h))));
  };
  it('the bay is water from Ellis Island to the Battery and round the Statue of Liberty', () => {
    for (const [lat, lon, name] of [
      [40.7005, -74.0300, 'between Ellis Island and the Battery (cell 1_0: no coast through it)'],
      [40.6920, -74.0300, 'south-east of Ellis Island'],
      [40.6870, -74.0480, 'west of Liberty Island (cell 0_1: only the island in it)'],
      [40.6840, -74.0400, 'south of Liberty Island'],
      [40.6780, -74.0550, 'the bay south-west of the statue (cell 0_2)'],
    ] as const) expect(isSea(lat, lon), name).toBe(true);
  });
  it('…and its islands and shores stand: Liberty, Ellis and Governors Islands, the Battery, Liberty State Park', () => {
    for (const [lat, lon, name] of [
      [40.6892, -74.0445, 'Liberty Island'],
      [40.6995, -74.0396, 'Ellis Island'],
      [40.6895, -74.0168, 'Governors Island'],
      [40.7033, -74.0170, 'the Battery'],
      [40.7040, -74.0560, 'Liberty State Park'],
    ] as const) expect(isSea(lat, lon), name).toBe(false);
  });
  it('before: the island-only cell had no sea, and the open cell needs the coast round it', () => {
    // (cell 0_1 now makes its sea from Liberty Island alone; cell 1_0 has no coast of its own)
    expect(isSea(40.6870, -74.0480, false)).toBe(true);
    expect(isSea(40.7005, -74.0300, false)).toBe(false);
  });
});
