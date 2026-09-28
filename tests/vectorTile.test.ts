import { describe, it, expect } from 'vitest';
import { vectorToOsm, wayTags, areaTags, poiTags, stitch, node, name, clipLine, clipPoly } from '../src/world/vectorTile';
import { osmToTile } from '../src/world/realTile';
import { encodeTile } from './helpers/mvtEncode';

// The vector-tile twin: OpenMapTiles z14 tiles translated back into the Overpass JSON osmToTile
// reads — tags, streets stitched across tile edges, junctions re-noded, edge buildings kept once.

describe('OpenMapTiles → OSM tags', () => {
  it('maps street classes, links, services, bridges; drops ferries', () => {
    expect(wayTags({ class: 'minor' })?.highway).toBe('residential');
    expect(wayTags({ class: 'primary', ramp: 1 })?.highway).toBe('primary_link');
    expect(wayTags({ class: 'path', subclass: 'steps' })?.highway).toBe('steps');
    const sv = wayTags({ class: 'service', service: 'driveway' })!;
    expect(sv.highway).toBe('service');
    expect(sv.service).toBe('driveway');
    const br = wayTags({ class: 'secondary', brunnel: 'bridge', layer: 1, oneway: 1 })!;
    expect(br.bridge).toBe('yes');
    expect(br.layer).toBe('1');
    expect(br.oneway).toBe('yes');
    expect(wayTags({ class: 'motorway', brunnel: 'tunnel' })?.tunnel).toBe('yes');
    expect(wayTags({ class: 'rail', subclass: 'rail' })?.railway).toBe('rail');
    expect(wayTags({ class: 'ferry' })).toBeNull();
  });
  it('maps land cover and use to what the ground paints; the ocean is the sea layer\'s', () => {
    expect(areaTags('landcover', { class: 'grass', subclass: 'park' })).toEqual({ leisure: 'park' });
    expect(areaTags('landcover', { class: 'wood', subclass: 'forest' })).toEqual({ natural: 'wood' });
    expect(areaTags('landuse', { class: 'pitch' })).toEqual({ leisure: 'pitch' });
    expect(areaTags('water', { class: 'lake' })?.natural).toBe('water');
    expect(areaTags('water', { class: 'ocean' })).toBeNull();
    expect(areaTags('water', { class: 'pond', intermittent: 1 })).toBeNull();
  });
  it('maps points of interest to their OSM key', () => {
    expect(poiTags({ class: 'cafe', subclass: 'cafe', name: 'Moka' })).toEqual({ amenity: 'cafe', name: 'Moka' });
    expect(poiTags({ class: 'shop', subclass: 'bakery' })).toEqual({ shop: 'bakery' });
    expect(poiTags({ class: 'lodging', subclass: 'hotel' })).toEqual({ tourism: 'hotel' });
    expect(poiTags({ class: 'office', subclass: 'company' })).toEqual({ office: 'company' });
  });
});

describe('streets across tile edges', () => {
  it('stitches a street cut at a tile edge back into one way', () => {
    const tags = { highway: 'residential', name: 'Queen Anne Ave N' }, sig = JSON.stringify(tags);
    const lines = stitch([
      { tags, sig, p: [[3000, 2000], [4096, 2000.4]], cut0: false, cut1: true },
      { tags, sig, p: [[4096, 2000.2], [5000, 2000]], cut0: true, cut1: false },
    ]);
    expect(lines.length).toBe(1);
    expect(lines[0].p[0]).toEqual([3000, 2000]);
    expect(lines[0].p[lines[0].p.length - 1]).toEqual([5000, 2000]);
  });
  it('re-nodes a crossing and a T the simplifier took the junction node off', () => {
    const t = { highway: 'residential' }, s = JSON.stringify(t);
    const lines = [
      { tags: t, sig: s, p: [[0, 100], [400, 100]] as [number, number][], cut0: false, cut1: false },
      { tags: t, sig: s, p: [[200, 0], [200, 300]] as [number, number][], cut0: false, cut1: false },
      { tags: t, sig: s, p: [[300, 0], [300, 99.4]] as [number, number][], cut0: false, cut1: false }, // a T ending a hair short
    ];
    node(lines);
    const has = (l: { p: [number, number][] }, x: number, y: number) => l.p.some(([a, b]) => Math.abs(a - x) < 0.01 && Math.abs(b - y) < 0.01);
    expect(has(lines[0], 200, 100)).toBe(true);
    expect(has(lines[1], 200, 100)).toBe(true);
    // the T's end is moved onto the street, and the street gets the vertex (no stub, no gap)
    expect(has(lines[2], 300, 100)).toBe(true);
    expect(has(lines[0], 300, 100)).toBe(true);
  });
  it('a bridge crossing a street is not joined to it', () => {
    const a = { highway: 'residential' }, b = { highway: 'primary', bridge: 'yes', layer: '1' };
    const lines = [
      { tags: a, sig: JSON.stringify(a), p: [[0, 100], [400, 100]] as [number, number][], cut0: false, cut1: false },
      { tags: b, sig: JSON.stringify(b), p: [[200, 0], [200, 300]] as [number, number][], cut0: false, cut1: false },
    ];
    node(lines);
    expect(lines[0].p.length).toBe(2);
    expect(lines[1].p.length).toBe(2);
  });
});

describe('a cell from two vector tiles', () => {
  // Seattle's z14 tiles 2623 and 2624 (row 5720): a street named in the name layer runs across the
  // edge between them; a cross street in the east tile; a building on the edge (in both tiles'
  // buffers, its centre in the west one)
  const west = encodeTile([
    { name: 'transportation', features: [{ type: 2, tags: { class: 'minor' }, geom: [[[3000, 2000], [4160, 2000]]] }] },
    { name: 'transportation_name', features: [{ type: 2, tags: { class: 'minor', name: 'West Galer Street' }, geom: [[[2900, 2000], [4160, 2000]]] }] },
    { name: 'building', features: [{ type: 3, tags: { render_height: 5, render_min_height: 0 }, geom: [[[4050, 1480], [4110, 1480], [4110, 1520], [4050, 1520]]] }] },
    { name: 'poi', features: [{ type: 1, tags: { class: 'cafe', subclass: 'cafe', name: 'El Diablo' }, geom: [[[4070, 1500]]] }] },
  ]);
  const east = encodeTile([
    { name: 'transportation', features: [
      { type: 2, tags: { class: 'minor' }, geom: [[[-64, 2000], [1000, 2000]]] },
      { type: 2, tags: { class: 'minor' }, geom: [[[500, 1000], [500, 3000]]] },
    ] },
    { name: 'transportation_name', features: [{ type: 2, tags: { class: 'minor', name: 'West Galer Street' }, geom: [[[-64, 2000], [1100, 2000]]] }] },
    { name: 'building', features: [{ type: 3, tags: { render_height: 5, render_min_height: 0 }, geom: [[[-46, 1480], [14, 1480], [14, 1520], [-46, 1520]]] }] },
  ]);
  const doc = vectorToOsm([{ x: 2623, y: 5720, z: 14, data: west }, { x: 2624, y: 5720, z: 14, data: east }]);
  const els = doc.elements ?? [];

  it('keeps the street whole, named, and noded at the crossing', () => {
    const ways = els.filter((e) => e.type === 'way' && e.tags?.highway);
    expect(ways.length).toBe(2);
    const galer = ways.find((w) => w.tags?.name === 'West Galer Street')!;
    expect(galer).toBeTruthy();
    const cross = ways.find((w) => w !== galer)!;
    const key = (g: { lat: number; lon: number }) => `${g.lat.toFixed(7)},${g.lon.toFixed(7)}`;
    const shared = galer.geometry!.filter((g) => g && cross.geometry!.some((h) => h && key(h) === key(g)));
    expect(shared.length).toBe(1);
  });
  it('builds the edge building once, and its café names it through the one pipeline', () => {
    expect(els.filter((e) => e.tags?.building).length).toBe(1);
    const g = els.find((e) => e.tags?.building)!.geometry![0]!;
    const origin = { lat: g.lat, lon: g.lon };
    const tj = osmToTile(doc, { id: '0_0', box: { x0: -1500, z0: -1500, x1: 1500, z1: 1500 }, origin });
    const mapped = tj.buildings.filter((b) => !b.gen); // (the rest: osmToTile's fill beside a sparse street)
    expect(mapped.length).toBe(1);
    expect(mapped[0].n).toBe('El Diablo');
    expect(tj.roads.filter((r) => r.n === 'West Galer Street').length).toBe(1);
  });
});

// The review's findings, each pinned
describe('vector twin: edges, junctions and names', () => {
  const area = (r: [number, number][]) => { let a = 0; for (let i = 0, j = r.length - 1; i < r.length; j = i++) a += r[j][0] * r[i][1] - r[i][0] * r[j][1]; return Math.abs(a / 2); };
  it('a building over a tile edge that one tile holds whole and the other clipped is built once, in two abutting parts', () => {
    // 150 units wide, 96 in the west tile and 54 in the east: the east tile's copy is cut at -64
    const west = encodeTile([{ name: 'building', features: [{ type: 3, tags: { render_height: 5, render_min_height: 0 }, geom: [[[4000, 1000], [4150, 1000], [4150, 1100], [4000, 1100]]] }] }]);
    const east = encodeTile([{ name: 'building', features: [{ type: 3, tags: { render_height: 5, render_min_height: 0 }, geom: [[[-64, 1000], [54, 1000], [54, 1100], [-64, 1100]]] }] }]);
    const doc = vectorToOsm([{ x: 2623, y: 5720, z: 14, data: west }, { x: 2624, y: 5720, z: 14, data: east }]);
    const b = (doc.elements ?? []).filter((e) => e.tags?.building);
    expect(b.length).toBe(2);
    // back to global units: the two parts' areas add up to the building's (no overlap)
    const N = 4096 * 2 ** 14;
    const toG = (g: { lat: number; lon: number }): [number, number] => [((g.lon + 180) / 360) * N, ((1 - Math.log(Math.tan((g.lat * Math.PI) / 180) + 1 / Math.cos((g.lat * Math.PI) / 180)) / Math.PI) / 2) * N];
    const tot = b.reduce((a, e) => a + area(e.geometry!.slice(0, -1).map((g) => toG(g!))), 0);
    expect(Math.abs(tot - 150 * 100)).toBeLessThan(15);
  });
  it('a vertex exactly on the tile edge makes no repeated vertex and no zero-length way', () => {
    const inW = clipLine([[3000, 10], [4096, 10], [5000, 10]], 0, 0, 4096, 4096);
    expect(inW.length).toBe(1);
    expect(inW[0].p).toEqual([[3000, 10], [4096, 10]]);
    expect(inW[0].cut1).toBe(true);
    // a street ending exactly on the edge: nothing in the neighbour
    expect(clipLine([[3000, 10], [4096, 10]], 4096, 0, 8192, 4096).length).toBe(0);
    // a street lying along the shared edge belongs to one tile only
    expect(clipLine([[4096, 10], [4096, 900]], 0, 0, 4096, 4096).length).toBe(0);
    expect(clipLine([[4096, 10], [4096, 900]], 4096, 0, 8192, 4096).length).toBe(1);
  });
  it('a T that overshoots the street it meets is ended on it (no stub past the kerb)', () => {
    const t = { highway: 'residential' }, sg = JSON.stringify(t);
    const lines = [
      { tags: t, sig: sg, p: [[0, 100], [400, 100]] as [number, number][], cut0: false, cut1: false },
      { tags: t, sig: sg, p: [[300, 0], [300, 100.9]] as [number, number][], cut0: false, cut1: false },
    ];
    node(lines);
    expect(lines[1].p[lines[1].p.length - 1][1]).toBeCloseTo(100, 6);
    expect(lines[0].p.some(([x, y]) => Math.abs(x - 300) < 1e-6 && Math.abs(y - 100) < 1e-6)).toBe(true);
  });
  it('two unnamed streets crossing by a tile edge are each stitched straight on', () => {
    const t = { highway: 'residential' }, sg = JSON.stringify(t);
    const lines = stitch([
      { tags: t, sig: sg, p: [[3000, 2000], [4096, 2000]], cut0: false, cut1: true },
      { tags: t, sig: sg, p: [[4096, 2000.6], [5000, 2000]], cut0: true, cut1: false },
      { tags: t, sig: sg, p: [[3000, 3097], [4096, 2001]], cut0: false, cut1: true },
      { tags: t, sig: sg, p: [[4096, 2000.9], [5192, 905]], cut0: true, cut1: false },
    ]);
    expect(lines.length).toBe(2);
    const flat = lines.find((l) => Math.abs(l.p[0][1] - 2000) < 1 && Math.abs(l.p[l.p.length - 1][1] - 2000) < 1);
    expect(flat).toBeTruthy();
  });
  it('a street merged through a change of name is split and each part named; a name line in the next bucket is found', () => {
    const t = { highway: 'residential' }, sg = JSON.stringify(t);
    const segs = [
      { a: [0, 1024] as [number, number], b: [500, 1024] as [number, number], name: 'Oak Ave', cls: 'minor', layer: 0 },
      { a: [500, 1024] as [number, number], b: [1000, 1024] as [number, number], name: 'Main St', cls: 'minor', layer: 0 },
    ];
    const out = name([{ tags: t, sig: sg, p: [[0, 1023], [1000, 1023]], cut0: false, cut1: false }], segs);
    expect(out.map((l) => l.tags.name)).toEqual(['Oak Ave', 'Main St']);
    expect(out[0].p[out[0].p.length - 1]).toEqual(out[1].p[0]); // one shared vertex at the change
  });
  it('a U-shaped building cut by the tile edge through both wings is two rings, not one joined by a sliver', () => {
    // a U opening north: wings x 0..30 and 70..100, base y 60..100; the tile ends at y = 50
    const U: [number, number][] = [[0, 0], [30, 0], [30, 60], [70, 60], [70, 0], [100, 0], [100, 100], [0, 100]];
    const rings = clipPoly(U, -1000, -1000, 1000, 50);
    expect(rings.length).toBe(2);
    expect(rings.every((r) => Math.abs(area(r) - 30 * 50) < 1e-6)).toBe(true);
  });
  it('a point of interest that isn\'t a storefront doesn\'t become one', () => {
    expect(poiTags({ class: 'cemetery', subclass: 'grave_yard', name: 'Lake View' })).toBeNull();
    expect(poiTags({ class: 'shop', subclass: 'anything', name: 'X' })?.shop).toBe('anything');
  });
});

describe('vector twin: the second review', () => {
  const N = 4096 * 2 ** 14;
  const toG = (g: { lat: number; lon: number }): [number, number] => [((g.lon + 180) / 360) * N, ((1 - Math.log(Math.tan((g.lat * Math.PI) / 180) + 1 / Math.cos((g.lat * Math.PI) / 180)) / Math.PI) / 2) * N];
  const area = (r: [number, number][]) => { let a = 0; for (let i = 0, j = r.length - 1; i < r.length; j = i++) a += r[j][0] * r[i][1] - r[i][0] * r[j][1]; return Math.abs(a / 2); };
  const twoTiles = (w: [number, number][], e: [number, number][]) => vectorToOsm([
    { x: 2623, y: 5720, z: 14, data: encodeTile([{ name: 'building', features: [{ type: 3, tags: { render_height: 5, render_min_height: 0 }, geom: [w] }] }]) },
    { x: 2624, y: 5720, z: 14, data: encodeTile([{ name: 'building', features: [{ type: 3, tags: { render_height: 5, render_min_height: 0 }, geom: [e] }] }]) },
  ]);
  it('a building reaching exactly 60 units past the edge is kept whole once, or in parts, never half', () => {
    for (const [a, b] of [[4036, 4156], [4040, 4156], [4036, 4155]]) {
      const doc = twoTiles([[a, 1000], [b, 1000], [b, 1100], [a, 1100]], [[a - 4096, 1000], [Math.min(b - 4096, 64), 1000], [Math.min(b - 4096, 64), 1100], [a - 4096, 1100]]);
      const tot = (doc.elements ?? []).filter((e) => e.tags?.building).reduce((s, e) => s + area(e.geometry!.slice(0, -1).map((g) => toG(g!))), 0);
      expect(Math.abs(tot - (b - a) * 100)).toBeLessThan(15);
    }
  });
  it('an island in a lake across the tile edge stays land in both tiles', () => {
    // a lake over the edge; an island in it straddling the edge (a hole, inside both buffers)
    const lake = (dx: number): [number, number][][] => [
      [[3500 - dx, 500], [4160 - dx, 500], [4160 - dx, 1500], [3500 - dx, 1500]].map(([x, y]) => [Math.max(-64, x), y]) as [number, number][],
      [[4050 - dx, 900], [4050 - dx, 1100], [4140 - dx, 1100], [4140 - dx, 900]] as [number, number][], // (anticlockwise: a hole)
    ];
    const doc = vectorToOsm([
      { x: 2623, y: 5720, z: 14, data: encodeTile([{ name: 'water', features: [{ type: 3, tags: { class: 'lake' }, geom: lake(0) }] }]) },
      { x: 2624, y: 5720, z: 14, data: encodeTile([{ name: 'water', features: [{ type: 3, tags: { class: 'lake' }, geom: lake(4096) }] }]) },
    ]);
    const lakes = (doc.elements ?? []).filter((e) => e.tags?.natural === 'water');
    expect(lakes.length).toBe(2);
    expect(lakes.every((e) => e.type === 'relation' && (e.members ?? []).some((m) => m.role === 'inner'))).toBe(true);
  });
  it('a T meeting its street at 20° and overshooting by a unit is ended on it; a tram in the road never captures it', () => {
    const st = { highway: 'residential' }, tram = { railway: 'tram' };
    const lines = [
      { tags: st, sig: JSON.stringify(st), p: [[0, 100], [400, 100]] as [number, number][], cut0: false, cut1: false },
      { tags: tram, sig: JSON.stringify(tram), p: [[0, 100.8], [400, 100.8]] as [number, number][], cut0: false, cut1: false },
      // from the north-west at 20°, ending 1 unit past the street (across it)
      { tags: st, sig: JSON.stringify(st), p: [[200 - 100 * Math.cos(0.349), 100 + 100 * Math.sin(0.349)], [200 + (1 / Math.sin(0.349)) * Math.cos(0.349), 100 - 1]] as [number, number][], cut0: false, cut1: false },
    ];
    node(lines);
    const T = lines[2].p, end = T[T.length - 1];
    expect(end[1]).toBeCloseTo(100, 6); // on the street, not the tram
    // no hairpin: y never goes back up after passing the tram
    for (let i = 1; i < T.length; i++) expect(T[i][1]).toBeLessThanOrEqual(T[i - 1][1] + 1e-9);
    expect(lines[0].p.some((p) => Math.abs(p[0] - end[0]) < 1e-6 && Math.abs(p[1] - 100) < 1e-6)).toBe(true);
  });
  it('a street that changes its name at a crossing is split on the crossing, both parts meeting it', () => {
    const t = { highway: 'residential' }, sg = JSON.stringify(t);
    const noded = [
      { tags: t, sig: sg, p: [[0, 0], [1000, 0]] as [number, number][], cut0: false, cut1: false },
      { tags: t, sig: sg, p: [[500, -300], [520, 300]] as [number, number][], cut0: false, cut1: false },
    ];
    node(noded);
    const segs = [
      { a: [0, 0] as [number, number], b: [505, 0] as [number, number], name: 'Main St', cls: 'minor', layer: 0 },
      { a: [505, 0] as [number, number], b: [1000, 0] as [number, number], name: 'Oak Ave', cls: 'minor', layer: 0 },
      { a: [500, -300] as [number, number], b: [520, 300] as [number, number], name: 'Cross St', cls: 'minor', layer: 0 },
    ];
    const out = name(noded, segs);
    const main = out.find((l) => l.tags.name === 'Main St')!, oak = out.find((l) => l.tags.name === 'Oak Ave')!, cross = out.find((l) => l.tags.name === 'Cross St')!;
    const j = main.p[main.p.length - 1];
    expect(oak.p[0]).toEqual(j);
    expect(cross.p.some((p) => p[0] === j[0] && p[1] === j[1])).toBe(true);
  });
  it('a short gap in the name line takes its neighbours\' name', () => {
    const t = { highway: 'residential' }, sg = JSON.stringify(t);
    const segs = [
      { a: [0, 0] as [number, number], b: [480, 0] as [number, number], name: 'Galer St', cls: 'minor', layer: 0 },
      { a: [520, 0] as [number, number], b: [1000, 0] as [number, number], name: 'Galer St', cls: 'minor', layer: 0 },
    ];
    const out = name([{ tags: t, sig: sg, p: [[0, 0], [1000, 0]], cut0: false, cut1: false }], segs);
    expect(out.length).toBe(1);
    expect(out[0].tags.name).toBe('Galer St');
  });
});

describe('vector twin: the third review (node and names)', () => {
  const st = { highway: 'residential' };
  const L = (p: [number, number][], tags: Record<string, string> = st) => ({ tags, sig: JSON.stringify(tags), p, cut0: false, cut1: false });
  const has = (l: { p: [number, number][] }, x: number, y: number) => l.p.some(([a, b]) => Math.abs(a - x) < 1e-6 && Math.abs(b - y) < 1e-6);
  it('a dead end running a unit beside a parallel street stays where it is', () => {
    const lines = [L([[0, 0], [1000, 0]]), L([[200, 1], [600, 1]])];
    node(lines);
    expect(lines[1].p).toEqual([[200, 1], [600, 1]]);
    expect(lines[0].p.length).toBe(2);
  });
  it('a short end never rests on the stub another street just lost', () => {
    // R along y=0; S from the south overshooting R by a unit (its stub goes); Lx ending half a unit
    // from S's old stub and 0.9 from R — it rests on R
    const lines = [L([[0, 0], [1000, 0]]), L([[500, -300], [500, 1]]), L([[800, 300], [500.5, 0.9]])];
    node(lines);
    const S = lines[1].p;
    expect(S[S.length - 1][1]).toBeCloseTo(0, 6); // S ends on R
    for (let i = 1; i < S.length; i++) expect(S[i][1]).toBeGreaterThanOrEqual(S[i - 1][1] - 1e-9); // no hairpin
    const e = lines[2].p[lines[2].p.length - 1];
    expect(e[1]).toBeCloseTo(0, 6); // Lx on R
  });
  it('a real crossing a little before the end is never passed over for a near-miss behind it', () => {
    // T crosses X square-on 2 units before its end (out of reach: a real crossing, kept); a
    // service line Y crosses T shallowly 10 units before its end
    const lines = [L([[-500, 0], [500, 0]]), L([[0, -300], [0, 2]]), L([[-30, -12], [30, -8]], { highway: 'service' })];
    node(lines);
    expect(has(lines[1], 0, 0)).toBe(true); // T still meets X
    expect(lines[1].p[lines[1].p.length - 1][1]).toBeCloseTo(2, 6); // and keeps its end
  });
  it('a very short street crossing a street keeps both its ends', () => {
    const lines = [L([[0, 0], [100, 0]]), L([[50, -1.25], [50, 1.25]])];
    node(lines);
    expect(lines[1].p.length).toBeGreaterThanOrEqual(2);
    expect(Math.hypot(lines[1].p[0][0] - lines[1].p[lines[1].p.length - 1][0], lines[1].p[0][1] - lines[1].p[lines[1].p.length - 1][1])).toBeGreaterThan(1);
  });
  it('an end a hair off the street is put exactly on it', () => {
    const lines = [L([[0, 0], [1000, 0]]), L([[500, -300], [500, -0.0001]])];
    node(lines);
    const e = lines[1].p[lines[1].p.length - 1];
    expect(has(lines[0], e[0], e[1])).toBe(true);
  });
  it('a few samples of another street\'s name between two runs of one name are smoothed away', () => {
    const segs = [
      { a: [0, 0] as [number, number], b: [1000, 0] as [number, number], name: 'Aurora Ave', cls: 'minor', layer: 0 },
      { a: [480, 1] as [number, number], b: [520, 1] as [number, number], name: 'Fork Rd', cls: 'minor', layer: 0 },
    ];
    const out = name([L([[0, 0.5], [1000, 0.5]])], segs);
    expect(out.map((l) => l.tags.name)).toEqual(['Aurora Ave']);
  });
});

describe('vector twin: the fourth review', () => {
  const st = { highway: 'residential' };
  const L = (p: [number, number][], tags: Record<string, string> = st) => ({ tags, sig: JSON.stringify(tags), p, cut0: false, cut1: false });
  const has = (l: { p: [number, number][] }, x: number, y: number) => l.p.some(([a, b]) => Math.abs(a - x) < 1e-6 && Math.abs(b - y) < 1e-6);
  it('a slip lane merging at 5° that stops a third of a unit short is joined to the street', () => {
    const a = 0.0873, lines = [L([[0, 0], [1000, 0]]), L([[500 - 200 * Math.cos(a), 0.3 + 200 * Math.sin(a)], [500, 0.3]])];
    node(lines);
    const e = lines[1].p[lines[1].p.length - 1];
    expect(e[1]).toBeCloseTo(0, 6);
    expect(has(lines[0], e[0], e[1])).toBe(true);
  });
  it('a street crossing a tile edge at 5° is stitched though its two copies cross the edge far apart', () => {
    const t = { highway: 'residential' }, sg = JSON.stringify(t), a = 0.0873, k = Math.tan(a);
    // along x = 4096 (the edge) the street runs nearly parallel to it; each tile's copy is a unit off
    const lines = stitch([
      { tags: t, sig: sg, p: [[4096 - 100, 1000], [4096, 1000 + 100 / k]], cut0: false, cut1: true },
      { tags: t, sig: sg, p: [[4096, 1000 + 100 / k + 10], [4196, 1000 + 200 / k + 10]], cut0: true, cut1: false },
    ]);
    expect(lines.length).toBe(1);
  });
  it('a closed loop (a roundabout drawn as one line) is never opened by a street beside it', () => {
    const loop: [number, number][] = [[0, 0], [100, 0], [100, 100], [0, 100], [0, 0]];
    const lines = [L(loop.map(([x, y]) => [x, y + 1] as [number, number])), L([[-50, 0], [200, 0]])];
    node(lines);
    const p = lines[0].p;
    expect(p[0]).toEqual(p[p.length - 1]);
  });
  it('a T falling a unit short of a street\'s bend is joined at the bend', () => {
    const lines = [L([[0, 50], [500, 0], [1000, 50]]), L([[500, -300], [500, -1]])];
    node(lines);
    const e = lines[1].p[lines[1].p.length - 1];
    expect(e).toEqual([500, 0]);
  });
});
