import { describe, it, expect } from 'vitest';
import { makeProjector, osmToTile, parkSide, pointInRing, ringTester, type OsmDoc, type OsmElement } from '../src/world/realTile';
import { makeRng } from '../src/core/rng';
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
        way(3, { highway: 'secondary', bridge: 'yes', layer: '1', 'bridge:structure': 'Truss' }, [[-500, 100], [-100, 100], [400, 100]]), // first vertex far outside -> context
        way(4, { highway: 'motorway' }, [[512, -30], [512, 300]]),
        way(5, { highway: 'tertiary', bridge: 'movable', 'bridge:movable': 'swing' }, [[600, 700], [640, 700]]),
      ),
      OPTS,
    );
    expect(t.roads).toHaveLength(4);
    const swing = t.roads.find((r) => r.c === 'tertiary')!;
    expect(swing.br).toBe('movable');
    expect(swing.bm).toBe('swing'); // (how it opens: bridges.ts turns it on a pier mid-channel)
    const ocean = t.roads.find((r) => r.n === 'Ocean Avenue')!;
    expect(ocean.c).toBe('residential');
    expect(ocean.w).toBeCloseTo(6.5 + 4.4, 1); // a North American street parks both kerbs by default
    expect(ocean.pk).toBe(5);
    expect(ocean.ow).toBe(1);
    expect(ocean.own).toBeUndefined();
    const bridge = t.roads.find((r) => r.c === 'secondary')!;
    expect(bridge.own).toBe(0);
    expect(bridge.br).toBe('yes');
    expect(bridge.l).toBe(1);
    expect(bridge.bs).toBe('truss'); // (how it's built: bridges.ts draws its trusses)
    expect(ocean.bs).toBeUndefined();
    expect(t.roads.find((r) => r.c === 'motorway')!.w).toBe(14);
  });
  it("a motorway's and a trunk's ramps are streets: every interchange keeps its on- and off-ramps", () => {
    const t = osmToTile(
      osm(
        way(1, { highway: 'motorway_link', oneway: 'yes' }, [[100, 100], [400, 300]]),
        way(2, { highway: 'trunk_link', lanes: '2' }, [[100, 600], [400, 800]]),
      ),
      OPTS,
    );
    // (one lane and its shoulders; two mapped lanes are 3.2 m each and a metre of gutter — never kerb parking)
    expect(t.roads.map((r) => [r.c, r.w, r.pk])).toEqual([['motorway_link', 7, undefined], ['trunk_link', 7.4, undefined]]);
  });
  it('mapped street parking (either scheme) widens the carriageway and marks the kerbs', () => {
    expect(parkSide({ 'parking:both': 'lane' }, 'left')).toBe(1);
    expect(parkSide({ 'parking:right': 'lane', 'parking:right:orientation': 'diagonal' }, 'right')).toBe(2);
    expect(parkSide({ 'parking:both': 'no' }, 'right')).toBe(0);
    expect(parkSide({ 'parking:both': 'separate' }, 'right')).toBe(0);
    expect(parkSide({ 'parking:lane:both': 'parallel' }, 'left')).toBe(1);
    expect(parkSide({ 'parking:lane:left': 'perpendicular' }, 'left')).toBe(2);
    expect(parkSide({ 'parking:lane:left': 'no_stopping' }, 'left')).toBe(0);
    const t = osmToTile(
      osm(
        way(1, { highway: 'tertiary', lanes: '2', 'parking:both': 'lane' }, [[10, 500], [700, 500]]),
        way(2, { highway: 'residential', 'parking:lane:right': 'parallel', width: '9' }, [[10, 300], [700, 300]]),
        way(3, { highway: 'residential' }, [[10, 200], [700, 200]]),
      ),
      OPTS,
    );
    const [a, b, c] = [500, 300, 200].map((z) => t.roads.find((r) => r.p[1] === z * 10)!);
    expect(a.w).toBeCloseTo(8 + 4.4, 1); // a tertiary carriageway + a parked lane each side
    expect(a.pk).toBe(1 + 4);
    expect(b.w).toBe(9); // a tagged width already includes its parking
    expect(b.pk).toBe(4);
    expect(c.pk).toBe(5); // North America: both kerbs parked unless mapped otherwise
    // elsewhere only mapped parking counts
    const ROME = { lat: 41.9, lon: 12.5 }, PR = makeProjector(ROME);
    const g = (pts: [number, number][]) => pts.map(([x, z]) => { const [lat, lon] = PR.unproject(x, z); return { lat, lon }; });
    const eu = osmToTile(osm({ type: 'way', id: 9, tags: { highway: 'residential' }, geometry: g([[10, 200], [700, 200]]) }), { id: '0_0', box: BOX, origin: ROME });
    expect(eu.roads[0].pk).toBeUndefined();
    expect(eu.roads[0].w).toBe(6.5);
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

  it('street furniture nodes become points: signals, hydrants, subway entrances, bus stops', () => {
    const node = (id: number, x: number, tags: Record<string, string>): OsmElement => { const [lat, lon] = P.unproject(x, 400); return { type: 'node', id, lat, lon, tags }; };
    const t = osmToTile(osm(
      node(1, 100, { highway: 'traffic_signals' }),
      node(2, 200, { emergency: 'fire_hydrant' }),
      node(3, 300, { railway: 'subway_entrance' }),
      node(4, 400, { highway: 'bus_stop', shelter: 'yes' }),
      node(5, 500, { highway: 'bus_stop' }),
    ), OPTS);
    expect(t.points.map((p) => p.c).sort()).toEqual(['bus', 'bus_shelter', 'hydrant', 'signal', 'subway']);
  });
  it('and the small things, each where it is: crossings by their markings, lamps, bins, post boxes, racks, fountains, bollards, pay stations', () => {
    const node = (id: number, x: number, tags: Record<string, string>): OsmElement => { const [lat, lon] = P.unproject(x, 420); return { type: 'node', id, lat, lon, tags }; };
    const t = osmToTile(osm(
      node(11, 100, { highway: 'crossing', crossing: 'marked' }),
      node(12, 120, { highway: 'crossing', 'crossing:markings': 'lines' }),
      node(13, 140, { highway: 'crossing', crossing: 'unmarked' }),
      node(14, 160, { highway: 'crossing', crossing: 'traffic_signals', 'crossing:markings': 'no' }),
      node(15, 180, { highway: 'crossing' }),
      node(16, 200, { highway: 'street_lamp' }),
      node(17, 220, { amenity: 'waste_basket' }),
      node(18, 240, { amenity: 'post_box' }),
      node(19, 260, { amenity: 'bicycle_parking', bicycle_parking: 'stands' }),
      node(20, 280, { amenity: 'bicycle_parking', bicycle_parking: 'shed' }),
      node(21, 300, { amenity: 'drinking_water' }),
      node(22, 320, { barrier: 'bollard' }),
      node(23, 340, { amenity: 'vending_machine', vending: 'parking_tickets' }),
      node(24, 360, { amenity: 'vending_machine', vending: 'drinks' }),
    ), OPTS);
    const at = (x: number) => t.points.find((p) => Math.abs(p.x - x) < 1)?.c;
    expect([100, 120, 140, 160, 180].map(at)).toEqual(['xing', 'xing_l', 'xing_u', 'xing_u', 'xing']);
    // (a drinks machine is the micro layer's: world/micro.ts draws it where it stands in the open)
    expect([200, 220, 240, 260, 280, 300, 320, 340, 360].map(at)).toEqual(['lamp', 'bin', 'postbox', 'bikerack', undefined, 'drinking', 'bollard', 'meter', 'vending']);
  });

  it('a business node inside a building names it and says what it is used for', () => {
    const [lat, lon] = P.unproject(509, 509);
    const t = osmToTile(osm(
      way(301, { building: 'yes' }, sq(500, 500, 18), true),
      { type: 'node', id: 302, lat, lon, tags: { name: 'Café Luna', amenity: 'cafe' } },
      way(303, { building: 'retail', shop: 'bakery', name: 'Panadería Sol' }, sq(560, 500, 14), true),
      way(304, { building: 'yes' }, sq(620, 500, 14), true),
    ), OPTS);
    const at = (x: number) => t.buildings.find((b) => Math.abs(b.r[0] / 10 - x) < 20)!;
    expect(at(500).n).toBe('Café Luna');
    expect(at(500).u).toBe('cafe');
    expect(at(500).k).toBe('commercial'); // a café in a house-sized footprint is a storefront
    expect(at(560).u).toBe('bakery');
    expect(at(620).u).toBeUndefined();
  });

  it('a market is its whole building, whatever else is mapped inside it first', () => {
    const [la1, lo1] = P.unproject(505, 505), [la2, lo2] = P.unproject(512, 512);
    const t = osmToTile(osm(
      way(311, { building: 'yes' }, sq(500, 500, 30), true),
      { type: 'node', id: 312, lat: la1, lon: lo1, tags: { name: 'Market Diner', amenity: 'restaurant' } },
      { type: 'node', id: 313, lat: la2, lon: lo2, tags: { name: 'Sanitary Public Market', amenity: 'marketplace' } },
    ), OPTS);
    const b = t.buildings.find((q) => Math.abs(q.r[0] / 10 - 500) < 40)!;
    expect(b.u).toBe('marketplace');
    expect(b.n).toBe('Sanitary Public Market');
  });

  it('emits the linear structures a place is known by: seawalls, jetties, fences, power lines', () => {
    const t = osmToTile(osm(
      way(401, { barrier: 'wall', wall: 'seawall', name: 'Sea Bright–Monmouth Beach Seawall' }, [[100, 100], [100, 400]]),
      way(402, { man_made: 'groyne' }, [[120, 200], [180, 200]]),
      way(403, { barrier: 'fence' }, [[300, 300], [330, 300]]),
      way(404, { power: 'line' }, [[400, 100], [400, 900]]),
      way(405, { highway: 'residential' }, [[500, 100], [500, 900]]),
    ), OPTS);
    const cls = t.lines.map((l) => l.c).sort();
    expect(cls).toEqual(['fence', 'groyne', 'power', 'seawall']);
    expect(t.lines.find((l) => l.c === 'fence')!.ft).toBeUndefined(); // untyped: props decide by density
  });

  it('carries the fence type: iron railings, chain-link, timber', () => {
    const t = osmToTile(osm(
      way(411, { barrier: 'fence', fence_type: 'railing' }, [[300, 300], [330, 300]]),
      way(412, { barrier: 'fence', fence_type: 'chain_link' }, [[300, 320], [330, 320]]),
      way(413, { barrier: 'fence', fence_type: 'picket' }, [[300, 340], [330, 340]]),
    ), OPTS);
    expect(t.lines.map((l) => l.ft)).toEqual([1, 2, 3]);
  });
  it('the Overpass query asks for everything the transform reads', async () => {
    const { overpassQuery } = await import('../src/world/realTile');
    const q = overpassQuery({ s: 40.3, w: -74, n: 40.31, e: -73.99 });
    for (const k of ['"building"', '"highway"', '"shop"', 'seawall', 'groyne', '"power"', '"fence|wall|retaining_wall"', 'crossing|street_lamp', 'waste_basket|post_box|bicycle_parking', '"bollard"', 'out geom']) expect(q.includes(k.replace(/^"|"$/g, '')), k).toBe(true);
  });

  it('gives every building exactly one owner across neighbouring cells', () => {
    const east = osmToTile(osm(way(30, { building: 'yes' }, sq(1040, 100, 20), true)), OPTS);
    const west = osmToTile(osm(way(30, { building: 'yes' }, sq(1040, 100, 20), true)), { ...OPTS, id: '1_0', box: { x0: 1024, z0: 0, x1: 2048, z1: 1024 } });
    expect(east.buildings[0].own).toBe(0); // centroid outside cell 0_0 -> context only
    expect(west.buildings[0].own).toBeUndefined(); // owner
  });
});

describe('osmToTile — towers and building parts', () => {
  it('reads heights in any unit and keeps real towers tall, but not typos', async () => {
    const { parseLen, plausibleHeight } = await import('../src/world/realTile');
    expect(parseLen('120')).toBe(120);
    expect(parseLen('394 ft')).toBeCloseTo(120.09, 1);
    expect(parseLen('12\'6"')).toBeCloseTo(3.81, 2);
    expect(Number.isNaN(parseLen('tall'))).toBe(true);
    expect(plausibleHeight(381, 102, 7000)).toBe(381); // Empire State: its own height
    expect(plausibleHeight(1250, 102, 7000)).toBeCloseTo(102 * 3.7 + 1.5, 3); // feet typed as metres: the floors win
    expect(plausibleHeight(200, null, 60)).toBe(40); // a shed-sized footprint isn't a skyscraper
    expect(plausibleHeight(200, null, 60, true)).toBe(200); // …unless it's a spire part
    expect(Number.isNaN(plausibleHeight(NaN, null, 500))).toBe(true);
  });

  it('a mapped skyscraper keeps its height and loses its house-kind prior', () => {
    const t = osmToTile(osm(way(501, { building: 'yes', height: '180' }, sq(200, 200, 20), true)), OPTS);
    expect(t.buildings[0].h).toBe(180);
    expect(t.buildings[0].k).toBe('large'); // 400 m² footprint would read 'house' by area alone
    expect(t.buildings[0].roof).toBe('flat');
  });

  it('parts draw the tower: setbacks lift, share the outline seed; the outline keeps the door', () => {
    const t = osmToTile(osm(
      way(601, { building: 'office', height: '200', name: 'Tower One', start_date: '1931' }, sq(300, 300, 40), true),
      way(602, { 'building:part': 'yes', height: '60' }, sq(300, 300, 40), true), // podium, full cover
      way(603, { 'building:part': 'yes', height: '200', min_height: '60', 'building:material': 'glass' }, sq(310, 310, 20), true), // setback tier
    ), OPTS);
    const outline = t.buildings.find((b) => b.n === 'Tower One')!;
    const oi = t.buildings.indexOf(outline);
    const ps = t.buildings.filter((b) => b.pt);
    expect(ps).toHaveLength(2);
    expect(outline.hp).toBe(1); // drawn by its parts
    expect(outline.yr).toBe(1931);
    for (const p of ps) {
      expect(p.po).toBe(oi);
      expect(p.s).toBe(outline.s); // one look for the whole tower
      expect(p.k).toBe('commercial');
    }
    const tier = ps.find((p) => p.lf)!;
    expect(tier.lf).toBe(60);
    expect(tier.h).toBe(140);
    expect(tier.ma).toBe('glass');
    expect(ps.find((p) => !p.lf)!.h).toBe(60);
  });

  it('marks row buildings: party walls in a dense block, not a house on its lawn', () => {
    const els: OsmElement[] = [];
    let id = 800;
    for (let j = 0; j < 16; j++) for (let i = 0; i < 30; i++) els.push(way(id++, { building: 'yes' }, [[400 + i * 6, 400 + j * 15], [406 + i * 6, 400 + j * 15], [406 + i * 6, 412 + j * 15], [400 + i * 6, 412 + j * 15]], true));
    els.push(way(id++, { building: 'house' }, sq(60, 60, 12), true));
    els.push(way(id++, { highway: 'primary', name: 'Main Avenue' }, [[380, 394], [700, 394]]));
    const t = osmToTile(osm(...els), OPTS);
    // the row facing the avenue keeps shops on its street floor (most of it); rows behind don't
    const front = t.buildings.filter((b) => b.at && b.r[1] / 10 < 402), back = t.buildings.filter((b) => b.r[1] / 10 > 470 && b.r[1] / 10 < 600);
    expect(front.filter((b) => b.gf).length).toBeGreaterThan(front.length * 0.5);
    expect(back.some((b) => b.gf)).toBe(false);
    const mid = t.buildings.find((b) => Math.abs(b.r[0] / 10 - (400 + 15 * 6)) < 1 && Math.abs(b.r[1] / 10 - (400 + 8 * 15)) < 13)!;
    expect(mid.at).toBe(1);
    expect(t.buildings.find((b) => Math.abs(b.r[0] / 10 - 60) < 13 && Math.abs(b.r[1] / 10 - 60) < 13)!.at).toBeUndefined();
    expect(t.buildings.filter((b) => b.at).length).toBeGreaterThan(300);
  });

  it('a tower straddling a cell edge is drawn whole by the tile that owns its outline', () => {
    // outline centred 19 m inside cell 0_0's east edge; its shaft's centre is across the edge
    const els = [
      way(901, { building: 'office', height: '390', name: 'Edge Tower' }, sq(975, 500, 60), true),
      way(902, { 'building:part': 'yes', height: '40' }, sq(975, 500, 60), true), // podium, full cover
      way(903, { 'building:part': 'yes', height: '390', min_height: '40' }, sq(1018, 505, 14), true), // the shaft, centre in cell 1_0
    ];
    const own = osmToTile(osm(...els), OPTS);
    const next = osmToTile(osm(...els), { ...OPTS, id: '1_0', box: { x0: 1024, z0: 0, x1: 2048, z1: 1024 } });
    const shaft = (t: typeof own) => t.buildings.find((b) => b.pt && b.lf === 40)!;
    expect(own.buildings.find((b) => b.n === 'Edge Tower')!.own).toBeUndefined();
    expect(shaft(own).own).toBeUndefined(); // drawn here, with its outline
    expect(shaft(next).own).toBe(0); // the neighbour carries it as context only — never twice
  });

  it('a lone tower part on an unmapped podium leaves the outline as the podium, inset', () => {
    const t = osmToTile(osm(
      way(701, { building: 'yes', height: '150' }, sq(500, 500, 40), true),
      way(702, { 'building:part': 'yes', height: '150' }, sq(500, 500, 15), true),
    ), OPTS);
    const outline = t.buildings.find((b) => !b.pt)!;
    expect(outline.hp).toBeUndefined();
    expect(outline.h).toBe(15); // four storeys, not a 150 m block
    expect(outline.r[0]).toBeGreaterThan(5000); // pulled inside the shared walls (0.1 m units)
  });

  it('an outline a lifted part overhangs is drawn by its parts (the Space Needle: a saucer over its legs)', () => {
    // the outline is the saucer's shadow; a slim core stands on the ground, the saucer 140–158 m up
    const t = osmToTile(osm(
      way(711, { building: 'yes', man_made: 'tower', 'tower:type': 'observation', height: '184', name: 'Space Needle' }, sq(600, 600, 40), true),
      way(712, { 'building:part': 'yes', height: '184' }, sq(615, 615, 10), true), // core and spire
      way(713, { 'building:part': 'yes', height: '158', min_height: '140' }, sq(600, 600, 40), true), // the top house
    ), OPTS);
    const outline = t.buildings.find((b) => !b.pt)!;
    expect(outline.hp).toBe(1); // not a 40 m-wide column up to the saucer
    const parts = t.buildings.filter((b) => b.pt);
    expect(parts.length).toBe(2);
    expect(parts.find((b) => b.lf)!.lf).toBe(140);
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
  const waterAt = (t: ReturnType<typeof osmToTile>, x: number, z: number) =>
    t.areas.filter((a) => a.c === 'water').some((a) => {
      const ring: [number, number][] = [];
      for (let i = 0; i + 1 < a.o[0].length; i += 2) ring.push([a.o[0][i] / 10, a.o[0][i + 1] / 10]);
      let ins = false;
      for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
        const [xi, zi] = ring[i], [xj, zj] = ring[j];
        if (zi > z !== zj > z && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi) ins = !ins;
      }
      return ins;
    });
  it('a waterfront with a pier the coast wraps: one bay, the town and the pier dry (Seattle)', () => {
    // the shore runs south down x = 600 with the bay to the west (water right of the way when
    // heading south); a pier's outline dips into the cell from the north at x ≈ 200–260 and goes
    // back out — the coast around it (land = the pier, on the left)
    const shore = way(70, { natural: 'coastline' }, [[600, -300], [600, 400], [640, 800], [640, 1400]]);
    const pier = way(71, { natural: 'coastline' }, [[200, -300], [200, 120], [260, 120], [260, -300]]);
    const t = osmToTile(osm(shore, pier), OPTS);
    expect(waterAt(t, 400, 500)).toBe(true); // the bay
    expect(waterAt(t, 100, 800)).toBe(true);
    expect(waterAt(t, 800, 500)).toBe(false); // the town east of the shore
    expect(waterAt(t, 230, 50)).toBe(false); // the pier
  });
  it('a coast that turns inside the cell still closes on its wet side', () => {
    // in from the north edge, round a headland, out through the east edge; sea to the right
    const t = osmToTile(osm(way(72, { natural: 'coastline' }, [[300, -200], [300, 500], [500, 700], [1300, 700]])), OPTS);
    expect(waterAt(t, 150, 900)).toBe(true); // south-west: the sea side
    expect(waterAt(t, 700, 300)).toBe(false); // the headland
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

const ringHas = (x: number, z: number, r: [number, number][]) => {
  let ins = false;
  for (let i = 0, j = r.length - 1; i < r.length; j = i++) {
    const [xi, zi] = r[i], [xj, zj] = r[j];
    if (zi > z !== zj > z && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi) ins = !ins;
  }
  return ins;
};
const centroidM = (b: { r: number[] }): [number, number] => {
  let x = 0, z = 0, n = 0;
  for (let i = 0; i + 1 < b.r.length; i += 2) (x += b.r[i]), (z += b.r[i + 1]), n++;
  return [x / n / 10, z / n / 10];
};

describe('osmToTile — hybrid fill (H3)', () => {
  it('grows deterministic houses along sparse real streets', () => {
    const road = way(70, { highway: 'residential', name: 'Main Street' }, [[50, 300], [950, 300]]);
    const t1 = osmToTile(osm(road), OPTS);
    expect(t1.buildings.length).toBeGreaterThan(10); // ~900 m of street, ~25–32 m pitch, both sides
    for (const b of t1.buildings) {
      expect(b.k).toBe('house');
      expect(b.gen).toBe('fill');
      expect(b.own).toBeUndefined(); // the road owner emits every fill, even into the margin
    }
    const t2 = osmToTile(osm(road), OPTS);
    expect(JSON.stringify(t1.buildings)).toBe(JSON.stringify(t2.buildings)); // deterministic
  });

  it('leaves well-mapped cells alone', () => {
    const els = [way(71, { highway: 'residential' }, [[0, 300], [900, 300]])];
    for (let i = 0; i < 40; i++) els.push(way(100 + i, { building: 'yes' }, sq(20 + (i % 8) * 110, 500 + Math.floor(i / 8) * 90, 14), true));
    const t = osmToTile(osm(...els), OPTS);
    expect(t.buildings).toHaveLength(40); // the mapped ones — zero fills
    expect(t.buildings.every((b) => b.gen !== 'fill')).toBe(true);
  });

  it('never plants fill lots in water or on mapped footprints', () => {
    // Lake straddles the street's middle stretch; a mapped house sits on the north row.
    const lake = way(72, { natural: 'water' }, [[200, 280], [200, 420], [420, 420], [420, 280]], true);
    const house = way(73, { building: 'yes' }, sq(600, 332, 16), true);
    const road = way(74, { highway: 'residential' }, [[50, 350], [950, 350]]);
    const t = osmToTile(osm(road, lake, house), OPTS);
    const water: [number, number][] = [[200, 280], [200, 420], [420, 420], [420, 280]];
    const mapped: [number, number][] = sq(600, 332, 16);
    expect(t.buildings.length).toBeGreaterThan(4); // the mapped house + fills on land stretches
    let mappedCount = 0;
    for (const b of t.buildings) {
      const [cx, cz] = centroidM(b);
      expect(ringHas(cx, cz, water)).toBe(false); // never in the lake
      if (ringHas(cx, cz, mapped)) mappedCount++; // only the mapped house itself may sit here
    }
    expect(mappedCount).toBe(1);
  });

  it('spreads the fill cap across every street, not just the first-listed', () => {
    const a = way(80, { highway: 'residential' }, [[50, 200], [950, 200]]);
    const b = way(81, { highway: 'residential' }, [[50, 700], [950, 700]]);
    const t = osmToTile(osm(a, b), OPTS);
    const north = t.buildings.filter((x) => centroidM(x)[1] < 500).length;
    const south = t.buildings.filter((x) => centroidM(x)[1] >= 500).length;
    expect(north).toBeGreaterThan(10); // ~90-cap split across both streets, not stacked on road A
    expect(south).toBeGreaterThan(10);
  });
});

describe('what lies under the ground stays there', () => {
  it('a tunnel is marked underground, a building passage is not, indoor corridors and tunnelled rail drop out', () => {
    const t = osmToTile(osm(
      way(1, { highway: 'motorway', tunnel: 'yes', layer: '-8' }, [[10, 100], [900, 100]]),
      way(2, { highway: 'service', tunnel: 'building_passage' }, [[10, 300], [900, 300]]),
      way(3, { highway: 'footway', indoor: 'yes' }, [[10, 500], [900, 500]]),
      way(4, { railway: 'rail', tunnel: 'yes' }, [[10, 700], [900, 700]]),
      way(5, { railway: 'rail' }, [[10, 800], [900, 800]]),
    ), OPTS);
    const byClass = (c: string) => t.roads.filter((r) => r.c === c);
    expect(byClass('motorway')[0].tu).toBe(1);
    expect(byClass('service')[0].tu).toBeUndefined();
    expect(byClass('footway').length).toBe(0);
    expect(t.lines.filter((l) => l.c === 'rail').length).toBe(1);
  });
});

describe('canopies', () => {
  it('a building=roof is an open roof up on posts, not a shed in the street', () => {
    const t = osmToTile(osm(
      way(1, { building: 'roof' }, sq(100, 100, 20), true), // a filling station's: 400 m²
      way(2, { building: 'roof', height: '3.5' }, sq(300, 100, 4), true), // a covered walk, mapped height
      way(3, { building: 'carport' }, sq(500, 100, 6), true),
      way(4, { building: 'garage' }, sq(700, 100, 6), true),
    ), OPTS);
    const at = (x: number) => t.buildings.find((b) => Math.abs(b.r[0] / 10 - x) < 30)!;
    expect(at(100).cn).toBe(1);
    expect(at(100).lf).toBeGreaterThan(4); // a lorry's clearance under the big one
    expect(at(100).h).toBeLessThan(1);
    expect(at(300).lf).toBeCloseTo(2.9, 1); // just under its mapped height
    expect(at(500).cn).toBe(1);
    expect(at(700).cn).toBeUndefined(); // a garage is a garage
  });
});

describe('tall structures from the map', () => {
  const node = (id: number, tags: Record<string, string>, x: number, z: number): OsmElement => {
    const [lat, lon] = P.unproject(x, z);
    return { type: 'node', id, tags, lat, lon } as OsmElement;
  };
  it('masts, water towers, chimneys and flagpoles become points with their heights; lookouts stay buildings', () => {
    const t = osmToTile(osm(
      node(1, { man_made: 'mast', height: '182' }, 100, 100),
      node(2, { man_made: 'tower', 'tower:type': 'communication' }, 200, 100),
      way(3, { man_made: 'water_tower', building: 'yes' }, sq(300, 300, 12), true),
      node(4, { man_made: 'chimney', height: '60 m' }, 500, 100),
      node(5, { man_made: 'flagpole' }, 600, 100),
      way(6, { man_made: 'tower', 'tower:type': 'observation', building: 'yes' }, sq(700, 700, 8), true),
    ), OPTS);
    const pt = (c: string) => t.points.filter((p) => p.c === c);
    expect(pt('mast').length).toBe(2);
    expect(pt('mast').find((p) => Math.abs(p.x - 100) < 1)!.h).toBe(182);
    expect(pt('water_tower').length).toBe(1);
    expect(Math.abs(pt('water_tower')[0].x - 306)).toBeLessThan(1); // at the outline's centre
    expect(t.buildings.some((b) => Math.abs(b.r[0] / 10 - 300) < 15 && Math.abs(b.r[1] / 10 - 300) < 15)).toBe(false); // not extruded
    expect(pt('chimney')[0].h).toBe(60);
    expect(pt('flagpole').length).toBe(1);
    expect(t.buildings.some((b) => Math.abs(b.r[0] / 10 - 700) < 15)).toBe(true); // an observation tower is a building
  });
});


describe('street surfaces', () => {
  it('keeps a paved-stone or unpaved surface on the street, not asphalt', () => {
    const tj = osmToTile(osm(
      way(1, { highway: 'living_street', name: 'Pike Place', surface: 'paving_stones' }, [[100, 100], [400, 100]]),
      way(2, { highway: 'residential', surface: 'asphalt' }, [[100, 200], [400, 200]]),
      way(3, { highway: 'track', surface: 'gravel' }, [[100, 300], [400, 300]]),
    ), OPTS);
    const by = (n: number) => tj.roads.find((r) => Math.abs(r.p[1] / 10 - n) < 1)!;
    expect(by(100).sf).toBe('paving_stones');
    expect(by(200).sf).toBeUndefined();
    expect(by(300).sf).toBe('gravel');
  });
});

describe('mapped trees keep their species', () => {
  it('reads the genus, the Latin name or the common one; the bigleaf maple and palo verde are their own', async () => {
    const { treeKindOf } = await import('../src/world/realTile');
    expect(treeKindOf({ genus: 'Acer' })).toBe('maple');
    expect(treeKindOf({ species: 'Acer macrophyllum' })).toBe('maple:2');
    expect(treeKindOf({ species: 'Quercus rubra' })).toBe('oak');
    expect(treeKindOf({ taxon: 'Platanus x acerifolia' })).toBe('sycamore'); // (the London plane: the foundry's sycamore, its kin)
    expect(treeKindOf({ 'species:en': 'Kwanzan Flowering Cherry' })).toBe('cherry');
    expect(treeKindOf({ 'species:en': 'Douglas-fir' })).toBe('fir');
    // the foundry's own kinds: by species first, then genus, then the common name
    expect(treeKindOf({ species: 'Pseudotsuga menziesii' })).toBe('fir');
    expect(treeKindOf({ species: 'Tsuga canadensis' })).toBe('easthemlock');
    expect(treeKindOf({ species: 'Tsuga heterophylla' })).toBe('hemlock');
    expect(treeKindOf({ genus: 'Thuja' })).toBe('cedar');
    expect(treeKindOf({ species: 'Picea sitchensis' })).toBe('sitka');
    expect(treeKindOf({ species: 'Alnus rubra' })).toBe('alder');
    expect(treeKindOf({ species: 'Acer circinatum' })).toBe('vinemaple');
    expect(treeKindOf({ species: 'Quercus virginiana' })).toBe('liveoak');
    expect(treeKindOf({ species: 'Pinus ponderosa' })).toBe('ponderosa');
    expect(treeKindOf({ species: 'Liriodendron tulipifera' })).toBe('tuliptree');
    expect(treeKindOf({ species: 'Liquidambar styraciflua' })).toBe('sweetgum');
    expect(treeKindOf({ species: 'Taxodium distichum' })).toBe('baldcypress');
    expect(treeKindOf({ species: 'Sequoia sempervirens' })).toBe('redwood');
    expect(treeKindOf({ species: 'Sabal palmetto' })).toBe('sabal');
    expect(treeKindOf({ species: 'Carnegiea gigantea' })).toBe('saguaro');
    expect(treeKindOf({ 'species:en': 'Ashe juniper' })).toBe('ashejuniper'); // (not an "ash")
    expect(treeKindOf({ 'species:en': 'Green ash' })).toBe('round');
    // a mapped colour in either spelling (building:color, roof:color carry real ones too)
    const t = osmToTile(osm(way(1, { building: 'yes', 'building:color': '#aa3322', 'roof:color': 'green' }, sq(100, 100, 12), true), way(2, { building: 'yes', 'building:colour': '#112233' }, sq(200, 100, 12), true)), OPTS);
    expect(t.buildings.map((b) => b.fc)).toEqual([0xaa3322, 0x112233]);
    expect(t.buildings[0].rc).not.toBeUndefined();
    expect(treeKindOf({ genus: 'Parkinsonia' })).toBe('mesquite:2');
    expect(treeKindOf({ genus: 'Washingtonia' })).toBe('fanpalm');
    expect(treeKindOf({ leaf_type: 'needleleaved' })).toBe('conifer');
    expect(treeKindOf({ leaf_type: 'broadleaved' })).toBeNull();
    expect(treeKindOf({})).toBeNull();
  });
  it('a tree node carries its kind and its mapped height', () => {
    const [lat, lon] = P.unproject(300, 300);
    const t = osmToTile(osm({ type: 'node', id: 901, lat, lon, tags: { natural: 'tree', genus: 'Acer', height: '14 m' } }), OPTS);
    expect([t.points[0].c, t.points[0].sp, t.points[0].h]).toEqual(['tree', 'maple', 14]);
  });
});

describe('ringTester', () => {
  it('answers as pointInRing does, inside its window and out, for a big wiggly ring and points on its rows', () => {
    // (a lake's long shoreline: thousands of vertices, many on the window's band edges and the
    // points' own rows, and a vertex exactly at the window's edge)
    const R = makeRng(47464), rng = () => R.float();
    const ring: [number, number][] = [];
    const n = 3000;
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2, r = 900 + 300 * Math.sin(a * 17) + rng() * 120;
      const p: [number, number] = [Math.cos(a) * r, Math.sin(a) * r];
      if (i % 50 === 0) p[1] = Math.round(p[1] / 16) * 16; // on a band edge
      ring.push(p);
    }
    ring[10][1] = -512; // on the window's edge
    const at = ringTester(ring, -512, 512);
    let checked = 0, inside = 0;
    const wrong: string[] = [];
    for (let k = 0; k < 8000; k++) {
      const x = (rng() - 0.5) * 2600, z = k % 7 === 0 ? ring[Math.floor(rng() * n)][1] : k % 11 === 0 ? Math.round((rng() - 0.5) * 64) * 16 : (rng() - 0.5) * 2600;
      const want = pointInRing(x, z, ring);
      if (at(x, z) !== want) wrong.push(`(${x}, ${z})`);
      checked++;
      if (want) inside++;
    }
    // (the window's own edges, exactly)
    for (const z of [-512, 512]) for (let x = -1300; x <= 1300; x += 13) if (at(x, z) !== pointInRing(x, z, ring)) wrong.push(`(${x}, ${z})`);
    expect(wrong).toEqual([]);
    expect(checked).toBe(8000);
    expect(inside).toBeGreaterThan(800);
  }, 30000);

  it('is fast where the plain test is slow: a lake outline asked once a ground quad', () => {
    const ring: [number, number][] = [];
    for (let i = 0; i < 47000; i++) { const a = (i / 47000) * Math.PI * 2; ring.push([Math.cos(a) * 200000, Math.sin(a) * 200000 + 199500]); }
    const at = ringTester(ring, -64, 1088);
    const t0 = performance.now();
    let wet = 0;
    for (let x = 0; x < 1024; x += 8) for (let z = 0; z < 1024; z += 8) if (at(x, z)) wet++;
    expect(performance.now() - t0).toBeLessThan(1500);
    expect(wet).toBeGreaterThan(0);
  }, 30000);
});
