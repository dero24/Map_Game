import { describe, it, expect } from 'vitest';
import { makeProjector, osmToTile, type OsmDoc, type OsmElement } from '../src/world/realTile';
import type { Box } from '../src/world/data';

const ORIGIN = { lat: 40.362, lon: -73.9755 }; // Sea Bright — same anchor as the bake
const P = makeProjector(ORIGIN);
const BOX: Box = { x0: 0, z0: 0, x1: 1024, z1: 1024 };
const OPTS = { id: '0_0', box: BOX, origin: ORIGIN };

// Build OSM way/relation elements from local-metre rings (unproject -> lat/lon geometry).
const way = (id: number, tags: Record<string, string>, pts: [number, number][], close = false): OsmElement => {
  const ring = close ? [...pts, pts[0]] : pts;
  return { type: 'way', id, tags, geometry: ring.map(([x, z]) => { const [lat, lon] = P.unproject(x, z); return { lat, lon }; }) };
};
// Member ways arrive as open fragments in `out geom` — emit each ring closed by default, or
// pass `split` to cut the first outer into two fragments sharing endpoints (multipolygon join).
const rel = (id: number, tags: Record<string, string>, outers: [number, number][][], inners: [number, number][][] = []): OsmElement => ({
  type: 'relation',
  id,
  tags,
  members: [
    ...outers.map((ring) => ({ type: 'way', ref: 0, role: 'outer', geometry: [...ring, ring[0]].map(([x, z]) => { const [lat, lon] = P.unproject(x, z); return { lat, lon }; }) })),
    ...inners.map((ring) => ({ type: 'way', ref: 0, role: 'inner', geometry: [...ring, ring[0]].map(([x, z]) => { const [lat, lon] = P.unproject(x, z); return { lat, lon }; }) })),
  ],
});
// A relation whose first outer is split into two open fragments (joined by shared endpoints).
const relSplit = (id: number, tags: Record<string, string>, ring: [number, number][], mid = 2): OsmElement => ({
  type: 'relation',
  id,
  tags,
  members: [
    { type: 'way', ref: 0, role: 'outer', geometry: ring.slice(0, mid + 1).map(([x, z]) => { const [lat, lon] = P.unproject(x, z); return { lat, lon }; }) },
    { type: 'way', ref: 0, role: 'outer', geometry: [...ring.slice(mid), ring[0]].map(([x, z]) => { const [lat, lon] = P.unproject(x, z); return { lat, lon }; }) },
  ],
});
const sq = (x: number, z: number, w: number): [number, number][] => [[x, z], [x + w, z], [x + w, z + w], [x, z + w]];
const osm = (...elements: OsmElement[]): OsmDoc => ({ elements });

describe('makeProjector', () => {
  it('round-trips local <-> lat/lon', () => {
    const [lat, lon] = P.unproject(1500, -2200);
    const [x, z] = P.project(lat, lon);
    expect(x).toBeCloseTo(1500, 6);
    expect(z).toBeCloseTo(-2200, 6);
  });
  it('cell boxes become lat/lon bboxes', () => {
    const bb = P.localToBbox(BOX);
    expect(bb.s).toBeLessThan(bb.n);
    expect(bb.w).toBeLessThan(bb.e);
    expect(bb.n).toBeCloseTo(ORIGIN.lat, 5); // z0 = the north edge = origin latitude here
    const [sLat] = P.unproject(1024, 1024);
    expect(bb.s).toBeCloseTo(sLat, 5);
  });
});

describe('osmToTile — roads', () => {
  it('classifies highways, keeps tags, sets own/own:0 from the first vertex', () => {
    const t = osmToTile(
      osm(
        way(1, { highway: 'residential', name: 'Ocean Avenue', oneway: 'yes' }, [[10, 500], [300, 500], [700, 500]]), // starts inside -> owns
        way(2, { highway: 'service' }, [[2000, 500], [2500, 500]]), // entirely outside -> dropped
        way(3, { highway: 'secondary', bridge: 'yes', layer: '1' }, [[-500, 100], [-100, 100], [400, 100]]), // first vertex far outside -> context
        way(4, { highway: 'motorway' }, [[512, -30], [512, 300]]),
      ),
      OPTS,
    );
    expect(t.roads).toHaveLength(3);
    const ocean = t.roads.find((r) => r.n === 'Ocean Avenue')!;
    expect(ocean.c).toBe('residential');
    expect(ocean.w).toBe(6.5);
    expect(ocean.ow).toBe(1);
    expect(ocean.own).toBeUndefined();
    const bridge = t.roads.find((r) => r.c === 'secondary')!;
    expect(bridge.own).toBe(0);
    expect(bridge.br).toBe('yes');
    expect(bridge.l).toBe(1);
    expect(t.roads.find((r) => r.c === 'motorway')!.w).toBe(14);
  });
});

describe('osmToTile — buildings', () => {
  const t = osmToTile(
    osm(
      way(10, { building: 'yes' }, sq(100, 100, 14), true), // inside -> owned house
      way(11, { building: 'retail', height: '12', 'roof:shape': 'flat', name: 'Shop' }, sq(300, 300, 30), true),
      way(12, { building: 'yes', 'building:levels': '3', 'roof:shape': 'hipped' }, sq(600, 100, 10), true),
      way(13, { building: 'garage' }, sq(-30, 100, 6), true), // margin only -> context
      way(14, { building: 'yes' }, sq(2000, 2000, 12), true), // outside -> dropped
      rel(20, { building: 'apartments' }, [sq(700, 700, 20), sq(730, 700, 15)]),
      relSplit(21, { building: 'yes' }, sq(400, 700, 18)), // split outer -> joined by assembly
      rel(22, { natural: 'water' }, [sq(50, 800, 40)]),
    ),
    OPTS,
  );

  it('emits buildings with kinds, heights, roofs and seeds', () => {
    expect(t.buildings).toHaveLength(7); // 10,11,12,13 + two outers of rel 20 + joined rel 21
    const house = t.buildings.find((b) => b.own === undefined && b.h > 0)!;
    expect(house.k).toBe('house');
    expect(house.roof === 'gable' || house.roof === 'hip' || house.roof === 'flat').toBe(true);
    expect(typeof house.s).toBe('number');
    const shop = t.buildings.find((b) => b.n === 'Shop')!;
    expect(shop.k).toBe('commercial');
    expect(shop.h).toBe(12);
    expect(shop.roof).toBe('flat');
    const apt = t.buildings.filter((b) => b.k === 'large');
    expect(apt).toHaveLength(2); // each outer ring of the relation is its own building
    const lvl = t.buildings.find((b) => b.fl === 3)!;
    expect(lvl.h).toBeCloseTo(3 * 3.1 + 1.5, 3);
    expect(lvl.roof).toBe('hip');
    expect(t.buildings.find((b) => b.own === 0)).toBeTruthy(); // the garage is margin context
  });

  it('gives every building exactly one owner across neighbouring cells', () => {
    const east = osmToTile(osm(way(30, { building: 'yes' }, sq(1040, 100, 20), true)), OPTS);
    const west = osmToTile(osm(way(30, { building: 'yes' }, sq(1040, 100, 20), true)), { ...OPTS, id: '1_0', box: { x0: 1024, z0: 0, x1: 2048, z1: 1024 } });
    expect(east.buildings[0].own).toBe(0); // centroid outside cell 0_0 -> context only
    expect(west.buildings[0].own).toBeUndefined(); // owner
  });
});

describe('osmToTile — water', () => {
  it('emits natural=water and wetland as areas', () => {
    const t = osmToTile(
      osm(
        way(40, { natural: 'water' }, sq(100, 600, 80), true),
        rel(41, { natural: 'water' }, [sq(400, 800, 60)], [sq(410, 810, 10)]),
        way(42, { natural: 'wetland' }, sq(800, 100, 50), true),
      ),
      OPTS,
    );
    const kinds = t.areas.map((a) => a.c).sort();
    expect(kinds).toEqual(['water', 'water', 'wetland']);
    const rel_ = t.areas[1];
    expect(rel_.o).toHaveLength(1);
    expect(rel_.i).toHaveLength(1); // inner ring kept
    for (const a of t.areas) expect(a.own).toBeUndefined();
  });

  it('closes coastline ways into water polygons on the wet side', () => {
    // Coast running north-south at x=500, heading north (-z): land left = west, sea right = east.
    const coast = way(50, { natural: 'coastline' }, [[500, 1200], [500, 600], [520, 200], [520, -200]]);
    const t = osmToTile(osm(coast), OPTS);
    const water = t.areas.find((a) => a.c === 'water')!;
    expect(water).toBeTruthy();
    // Rebuild the ring in metres and probe both sides of the shore.
    const ring: [number, number][] = [];
    for (let i = 0; i + 1 < water.o[0].length; i += 2) ring.push([water.o[0][i] / 10, water.o[0][i + 1] / 10]);
    const inside = (x: number, z: number) => {
      let ins = false;
      for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
        const [xi, zi] = ring[i], [xj, zj] = ring[j];
        if (zi > z !== zj > z && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi) ins = !ins;
      }
      return ins;
    };
    expect(inside(900, 512)).toBe(true); // east of the shore = sea
    expect(inside(100, 512)).toBe(false); // west = land
  });
});

describe('osmToTile — determinism + provenance', () => {
  const els = osm(
    way(60, { highway: 'tertiary' }, [[0, 100], [500, 100]]),
    way(61, { building: 'yes' }, sq(200, 200, 12), true),
    way(62, { natural: 'water' }, sq(700, 500, 30), true),
  );
  it('identical input -> identical tile, order-independent', () => {
    const a = osmToTile(els, OPTS);
    const shuffled: OsmDoc = { elements: [els.elements![2], els.elements![0], els.elements![1]] };
    const b = osmToTile(shuffled, OPTS);
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });
  it('carries attribution and osm base timestamp', () => {
    const doc: OsmDoc = { elements: els.elements, osm3s: { timestamp_osm_base: '2026-09-01T00:00:00Z' } };
    const t = osmToTile(doc, OPTS);
    expect(t.attribution).toContain('OpenStreetMap');
    expect(t.osmBase).toBe('2026-09-01T00:00:00Z');
    expect(t.slice).toEqual({ x0: -48, z0: -48, x1: 1072, z1: 1072 });
    expect(t.backdrop).toEqual(t.slice);
  });
});
