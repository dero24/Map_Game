import { describe, expect, it } from 'vitest';
import { tileX, tileY, tilesFor, tileBox, blockKey, segmentMeets, selects, assemble, lineOf, splitLine, canonical, TILE_PER_DEG, type BBox, type TileSource } from '../src/world/osmTiles';
import type { OsmElement } from '../src/world/realTile';

// Our own extract, as the tile service reads it (osmTiles.ts): the grid, the pack's lines, Overpass's
// rule for what a box selects, and assembling a cell's answer from the tiles under it.
const bb: BBox = { s: 40.35, w: -73.98, n: 40.36, e: -73.97 };
const way = (id: number, pts: [number, number][], tags: Record<string, string> = { highway: 'residential' }): OsmElement => ({ type: 'way', id, geometry: pts.map(([lat, lon]) => ({ lat, lon })), tags });

describe('the extract grid (osmTiles.ts)', () => {
  it('tiles are 1/128°, keyed from 180°W and 90°S; blocks are 1°', () => {
    expect(tileX(-180)).toBe(0);
    expect(tileY(-90)).toBe(0);
    expect(tileX(-73.975)).toBe(Math.floor(106.025 * 128));
    const tb = tileBox(tileX(-73.975), tileY(40.36));
    expect(tb.e - tb.w).toBeCloseTo(1 / TILE_PER_DEG, 12);
    expect(-73.975).toBeGreaterThanOrEqual(tb.w);
    expect(-73.975).toBeLessThan(tb.e);
    expect(blockKey(tileX(-73.975), tileY(40.36))).toBe('106_130');
  });
  it('a box covers every tile it touches, edges included', () => {
    const ts = tilesFor(bb);
    const xs = new Set(ts.map(([x]) => x)), ys = new Set(ts.map(([, y]) => y));
    expect(xs.size).toBe(tileX(bb.e) - tileX(bb.w) + 1);
    expect(ys.size).toBe(tileY(bb.n) - tileY(bb.s) + 1);
    // a box whose edge lies exactly on a tile edge takes the tile beyond it too
    const edge = tileBox(30000, 16000);
    expect(tilesFor({ s: edge.s, w: edge.w, n: edge.n, e: edge.e }).length).toBe(9);
  });
});

describe("Overpass's rule: what a box selects", () => {
  it('a node inside; not one just outside', () => {
    expect(selects({ type: 'node', id: 1, lat: 40.355, lon: -73.975 }, bb)).toBe(true);
    expect(selects({ type: 'node', id: 1, lat: 40.361, lon: -73.975 }, bb)).toBe(false);
  });
  it('a way with a node inside, or only a segment crossing (no node inside)', () => {
    expect(selects(way(1, [[40.355, -73.975], [40.37, -73.975]]), bb)).toBe(true);
    expect(selects(way(2, [[40.34, -73.975], [40.37, -73.975]]), bb)).toBe(true); // straight through
    expect(selects(way(3, [[40.34, -73.99], [40.34, -73.96], [40.37, -73.96]]), bb)).toBe(false); // round the corner
    expect(selects(way(4, [[40.34, -73.99], [40.37, -73.96]]), bb)).toBe(true); // the diagonal crosses
  });
  it('a big polygon round the box whose edges never enter it is not selected', () => {
    expect(selects(way(5, [[40.3, -74.1], [40.3, -73.9], [40.4, -73.9], [40.4, -74.1], [40.3, -74.1]], { natural: 'water' }), bb)).toBe(false);
  });
  it('a relation by any member: a node inside, a way by the way rule', () => {
    const rel = (members: object[]): OsmElement => ({ type: 'relation', id: 9, members: members as never, tags: { type: 'multipolygon', building: 'yes' } });
    expect(selects(rel([{ type: 'way', ref: 1, role: 'outer', geometry: [{ lat: 40.34, lon: -73.975 }, { lat: 40.37, lon: -73.975 }] }]), bb)).toBe(true);
    expect(selects(rel([{ type: 'node', ref: 2, role: 'label', lat: 40.355, lon: -73.975 }]), bb)).toBe(true);
    expect(selects(rel([{ type: 'way', ref: 1, role: 'outer', geometry: [{ lat: 40.1, lon: -73.975 }, { lat: 40.2, lon: -73.975 }] }]), bb)).toBe(false);
    expect(selects(rel([{ type: 'relation', ref: 3, role: '' }]), bb)).toBe(false);
  });
  it('segments: Liang–Barsky against the box, touching counts', () => {
    expect(segmentMeets(bb, 40.36, -73.99, 40.36, -73.96)).toBe(true); // along the top edge
    expect(segmentMeets(bb, 40.3601, -73.99, 40.3601, -73.96)).toBe(false);
    expect(segmentMeets(bb, 40.355, -73.975, 40.355, -73.975)).toBe(true); // a point inside
  });
});

describe('assembling a box from its tiles', () => {
  // three tiles' worth of lines: an element repeated in two tiles, a big relation stored once
  const inside = way(10, [[40.355, -73.975], [40.356, -73.974]]);
  const across = way(11, [[40.34, -73.975], [40.37, -73.975]]);
  const outside = way(12, [[40.30, -73.975], [40.31, -73.974]]);
  const tree: OsmElement = { type: 'node', id: 20, lat: 40.3555, lon: -73.9755, tags: { natural: 'tree' } };
  const big: OsmElement = { type: 'relation', id: 30, members: [{ type: 'way', ref: 11, role: 'outer', geometry: across.geometry }], tags: { type: 'multipolygon', landuse: 'forest' } };
  const bounds = (e: OsmElement): BBox => {
    const pts = e.type === 'node' ? [{ lat: e.lat!, lon: e.lon! }] : e.type === 'way' ? e.geometry!.filter(Boolean) as { lat: number; lon: number }[] : e.members!.flatMap((m) => (m.geometry ?? []).filter(Boolean) as { lat: number; lon: number }[]);
    return { s: Math.min(...pts.map((p) => p.lat)), w: Math.min(...pts.map((p) => p.lon)), n: Math.max(...pts.map((p) => p.lat)), e: Math.max(...pts.map((p) => p.lon)) };
  };
  const L = (e: OsmElement) => lineOf(e.type[0], e.id, bounds(e), JSON.stringify(e));
  const ts = tilesFor(bb);
  const tiles = new Map<string, string>();
  const put = (i: number, ...ls: string[]) => { const [tx, ty] = ts[i % ts.length]; tiles.set(`${tx}_${ty}`, (tiles.get(`${tx}_${ty}`) ?? '') + ls.join('\n') + '\n'); };
  put(0, L(inside), L(across), L(tree), lineOf('R', 30, bounds(big), '106_130'));
  put(1, L(across), L(outside));
  const reads: string[] = [];
  const src: TileSource = {
    tile: async (b, t) => { reads.push(`${b}/${t}`); return tiles.get(t) ?? null; },
    big: async (b, id) => (b === '106_130' && id === 30 ? JSON.stringify(big) : null),
  };
  it('every selected element once, by id; what its bounds put outside is never parsed', async () => {
    const doc = await assemble(src, bb, '2026-10-02T20:21:34Z');
    expect(doc.elements!.map((e) => `${e.type[0]}${e.id}`)).toEqual(['n20', 'r30', 'w10', 'w11']);
    expect(doc.osm3s?.timestamp_osm_base).toBe('2026-10-02T20:21:34Z');
    expect(doc.stats.parsed).toBe(4); // w12's bounds miss the box: skipped unparsed
    expect(reads).toHaveLength(ts.length); // one read a tile under the box
  });
  it('lines round-trip; canonical() reads only what osmToTile reads', () => {
    const l = splitLine(L(inside))!;
    expect(l).toMatchObject({ k: 'w', id: 10, s: 40.355, n: 40.356 });
    expect(JSON.parse(l.payload)).toEqual(inside);
    expect(canonical({ ...inside, bounds: { minlat: 0 }, nodes: [1, 2] } as OsmElement)).toBe(canonical(inside));
    expect(canonical({ ...inside, tags: { b: '2', a: '1' } })).toBe(canonical({ ...inside, tags: { a: '1', b: '2' } }));
  });
});
