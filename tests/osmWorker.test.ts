import { describe, expect, it, beforeAll, vi } from 'vitest';
import { osmToTile, type OsmDoc } from '../src/world/realTile';
import { lineOf, tileX, tileY, blockKey, tileKey, tilesFor } from '../src/world/osmTiles';
import type { TileJson } from '../src/world/data';

// The tile service's own path through our extract (worker/src/osm.js, worker/src/index.js `/tile` and
// `/skyline`) over an in-memory R2 packed the way scripts/osm-extract.mjs packs it: per block, its
// tiles gzipped back to back with a directory, its big relations, its tall section; an index with
// each block's hash and the extract's outline. The cells are tests/fixtures/osm's real cells
// (tests/osmExtract.test.ts): through the service they must come out as the TileJson Overpass's
// answer for the same box makes — the one the service built (R2), or today's osmToTile of a saved
// raw answer — and say so (x-tile-source: extract).
vi.mock('../worker/src/measure', () => ({ measured: async () => new Response('{}') })); // (LiDAR's WASM isn't needed here)

type Fixture = {
  name: string; origin: { lat: number; lon: number }; box: { x0: number; z0: number; x1: number; z1: number };
  bb: { s: number; w: number; n: number; e: number }; ts: string; tiles: Record<string, string>; overpassTile?: TileJson; overpass?: OsmDoc;
};
const idOf = (f: Fixture) => `${f.box.x0 / 1024}_${f.box.z0 / 1024}`;
/** What Overpass's answer for the fixture's box builds: the service's own build, or today's of the raw answer. */
const expected = (f: Fixture): TileJson => f.overpassTile ?? osmToTile(f.overpass!, { id: idOf(f), box: f.box, origin: f.origin });
const fixtures: Fixture[] = [];
const enc = new TextEncoder(), dec = new TextDecoder();
const gzip = async (s: string) => new Uint8Array(await new Response(new Blob([s]).stream().pipeThrough(new CompressionStream('gzip'))).arrayBuffer());
const objects = new Map<string, { b: Uint8Array; meta?: Record<string, string> }>();
const packed = new Set<string>(); // the blocks the in-memory pack has
const reads: string[] = [];
const puts: { key: string; meta?: Record<string, string> }[] = [];
const bucket = {
  async get(key: string, opts?: { range?: { offset: number; length: number } }) {
    const o = objects.get(key);
    if (!o) return null;
    reads.push(key + (opts?.range ? `@${opts.range.offset}` : ''));
    const s = opts?.range ? o.b.subarray(opts.range.offset, opts.range.offset + opts.range.length) : o.b;
    return { body: new Blob([s as BlobPart]).stream(), customMetadata: o.meta, text: async () => dec.decode(s), json: async () => JSON.parse(dec.decode(s)) };
  },
  async put(key: string, body: string, opts?: { customMetadata?: Record<string, string> }) {
    puts.push({ key, meta: opts?.customMetadata });
    objects.set(key, { b: enc.encode(body), meta: opts?.customMetadata });
  },
};
const env = { TILES: bucket, WORLDCOVER: 'off' }; // (the land cover read off AWS: not in a test)
const ctx = { waitUntil: () => {} };
const TS = '2026-10-02T20:21:34Z';
// New Jersey's corner of the outline (lon, lat), as osm-upload.mjs writes Geofabrik's .poly
const COVER = [[[-75.6, 38.9], [-73.8, 38.9], [-73.8, 41.4], [-75.6, 41.4], [-75.6, 38.9]]];
// (the test pack's own outline: the lower 48's box, so every fixture's cell is inside it)
const PACK_COVER = [[[-125, 24], [-66, 24], [-66, 50], [-125, 50], [-125, 24]]];
// the skylines' test block, far from the fixtures: tall things packed in its tall section
const SKY = { s: 39.1, w: -75.4, n: 39.2, e: -75.3 };
type El = { type: string; id: number; lat?: number; lon?: number; geometry?: { lat: number; lon: number }[]; tags: Record<string, string> };
const way = (id: number, lat: number, lon: number, tags: Record<string, string>): El => ({ type: 'way', id, geometry: [{ lat, lon }, { lat: lat + 0.0002, lon }, { lat: lat + 0.0002, lon: lon + 0.0002 }, { lat, lon }], tags });
const TALL: El[] = [
  way(1, 39.15, -75.35, { building: 'yes', height: '60' }), // ≥ 45 m
  way(2, 39.15, -75.34, { building: 'yes', height: '45 m' }), // Overpass's number() of "45 m" is NaN: not tall
  way(3, 39.16, -75.35, { building: 'yes', 'building:levels': '14' }), // 14 storeys
  way(4, 39.25, -75.35, { building: 'yes', height: '90' }), // tall, but outside the box
  { type: 'node', id: 5, lat: 39.17, lon: -75.36, tags: { man_made: 'mast', height: '200' } }, // only when masts are asked for
];

beforeAll(async () => {
  (globalThis as unknown as { caches: unknown }).caches = { default: { match: async () => undefined, put: async () => {} } };
  const fs = (await import(/* @vite-ignore */ `node:${'fs'}`)) as { readdirSync(p: URL): string[]; readFileSync(p: URL): Uint8Array };
  const zlib = (await import(/* @vite-ignore */ `node:${'zlib'}`)) as { gunzipSync(b: Uint8Array): Uint8Array };
  const dir = new URL('./fixtures/osm/', import.meta.url);
  for (const f of fs.readdirSync(dir).filter((f) => f.endsWith('.json.gz')).sort())
    fixtures.push(JSON.parse(dec.decode(zlib.gunzipSync(fs.readFileSync(new URL(f, dir))))));
  // the fixtures' tiles and big relations, by block
  const blocks = new Map<string, { tiles: Map<string, string>; big: Map<string, string>; tall: string[] }>();
  const blockOf = (b: string) => blocks.get(b) ?? blocks.set(b, { tiles: new Map(), big: new Map(), tall: [] }).get(b)!;
  for (const f of fixtures)
    for (const [k, text] of Object.entries(f.tiles)) {
      const [b, a, c] = k.split('/');
      if (a === 'big') blockOf(b).big.set(c, text);
      else blockOf(b).tiles.set(a, text);
    }
  for (const e of TALL) {
    const pts = e.type === 'node' ? [{ lat: e.lat!, lon: e.lon! }] : e.geometry!;
    const b = { s: Math.min(...pts.map((p) => p.lat)), w: Math.min(...pts.map((p) => p.lon)), n: Math.max(...pts.map((p) => p.lat)), e: Math.max(...pts.map((p) => p.lon)) };
    blockOf(blockKey(tileX(b.w), tileY(b.s))).tall.push(lineOf(e.type[0], e.id, b, JSON.stringify(e)));
  }
  const index: Record<string, unknown> = { v: 1, ts: TS, tile: 128, block: 128, cover: PACK_COVER, blocks: {} };
  for (const [b, B] of blocks) {
    const parts: Uint8Array[] = [];
    let off = 0;
    const put = async (text: string) => { const gz = await gzip(text); parts.push(gz); const at = [off, gz.length, 0]; off += gz.length; return at; };
    const d: Record<string, unknown> = { v: 1, ts: TS, tiles: {}, big: {} };
    for (const [t, text] of [...B.tiles].sort()) (d.tiles as Record<string, unknown>)[t] = await put(text);
    if (B.tall.length) d.tall = await put(B.tall.join('\n'));
    for (const [id, text] of B.big) (d.big as Record<string, unknown>)[id] = await put(text);
    const bin = new Uint8Array(off);
    let o = 0;
    for (const p of parts) { bin.set(p, o); o += p.length; }
    const hash = `h${b.replace('_', 'x')}`;
    objects.set(`osm/v1/b/${b}.${hash}.0.bin`, { b: bin });
    objects.set(`osm/v1/b/${b}.${hash}.json`, { b: enc.encode(JSON.stringify(d)) });
    (index.blocks as Record<string, string>)[b] = hash;
    packed.add(b);
  }
  objects.set('osm/v1/index.json', { b: enc.encode(JSON.stringify(index)) });
});
// (a fresh copy of the service, its caches empty: the index, the directories)
const fresh = async () => {
  vi.resetModules();
  // @ts-expect-error — the tile service is plain JS
  const osm = await import('../worker/src/osm.js');
  // @ts-expect-error — the tile service is plain JS
  const worker = (await import('../worker/src/index.js')).default;
  return { osm, worker } as { osm: { extractDoc: Function; skylineDoc: Function; covers: Function }; worker: { fetch(r: Request, e: unknown, c: unknown): Promise<Response> } };
};
const noBase = (t: TileJson) => ({ ...t, osmBase: 0 });

describe('the tile service reads our own extract (worker/src/osm.js)', () => {
  it('has the real cells', () => {
    expect(fixtures.length).toBeGreaterThanOrEqual(2);
  });
  it('a cell from the extract is the TileJson the service built from Overpass, a directory read once', async () => {
    const { osm } = await fresh();
    const known = new Set<string>();
    for (const f of fixtures) {
      reads.length = 0;
      const doc = await osm.extractDoc(env, f.bb);
      expect(doc, f.name).not.toBeNull();
      expect(doc.osm3s.timestamp_osm_base).toBe(TS);
      const tj = osmToTile(doc, { id: idOf(f), box: f.box, origin: f.origin });
      expect(JSON.parse(JSON.stringify(noBase(tj))), f.name).toEqual(JSON.parse(JSON.stringify(noBase(expected(f)))));
      // (a block's directory is read once, however many of its tiles a cell reads; after that, kept)
      const blocks = new Set([...tilesFor(f.bb).map(([tx, ty]) => blockKey(tx, ty)), ...Object.keys(f.tiles).filter((k) => k.includes('/big/')).map((k) => k.split('/')[0])].filter((b) => packed.has(b)));
      const fresh_ = [...blocks].filter((b) => !known.has(b));
      for (const b of blocks) known.add(b);
      const dirReads = reads.filter((k) => k.endsWith('.json') && k.includes('/b/')).length;
      expect(dirReads, f.name).toBe(fresh_.length);
      expect(reads.filter((k) => k.includes('.bin')).every((k) => k.includes('@')), 'ranged reads').toBe(true);
    }
  });
  it('only a box wholly inside the outline: across its edge or outside it, null (Overpass decides)', async () => {
    const { osm } = await fresh();
    const idx = { cover: COVER };
    expect(osm.covers(idx, { s: 40.3, w: -74.1, n: 40.31, e: -74.09 })).toBe(true);
    expect(osm.covers(idx, { s: 40.3, w: -73.81, n: 40.31, e: -73.79 })).toBe(false); // the outline runs through it
    expect(osm.covers(idx, { s: 42, w: -74.1, n: 42.01, e: -74.09 })).toBe(false); // outside
    expect(osm.covers({ cover: [] }, { s: 40.3, w: -74.1, n: 40.31, e: -74.09 })).toBe(false);
    expect(await osm.extractDoc(env, { s: 44, w: -66.01, n: 44.01, e: -65.99 })).toBeNull(); // (across the pack's outline)
    expect(await osm.extractDoc({}, fixtures[0].bb)).toBeNull(); // no bucket bound
  });
  it('a box inside the outline over a block with nothing in it is empty ground, not a failure', async () => {
    const { osm } = await fresh();
    const doc = await osm.extractDoc(env, { s: 39.5, w: -75.0, n: 39.505, e: -74.995 });
    expect(doc.elements).toEqual([]);
  });
  it('/tile answers from the extract, keeps the cell in R2 marked as such, and says so again from R2', async () => {
    const { worker } = await fresh();
    const f = fixtures[0];
    const path = `/tile/${f.box.x0 / 1024}_${f.box.z0 / 1024}.json?olat=${f.origin.lat}&olon=${f.origin.lon}`;
    puts.length = 0;
    const r1 = await worker.fetch(new Request(`https://svc.example${path}`), env, ctx);
    expect(r1.status).toBe(200);
    expect(r1.headers.get('x-tile-source')).toBe('extract');
    expect(r1.headers.get('x-tile-cache')).toBe('miss');
    expect(noBase(await r1.json())).toEqual(JSON.parse(JSON.stringify(noBase(expected(f)))));
    expect(puts.map((p) => [p.key, p.meta?.source])).toEqual([[`t/v30/${f.origin.lat.toFixed(4)},${f.origin.lon.toFixed(4)}/${tileKey(f.box.x0 / 1024, f.box.z0 / 1024)}.json`, 'extract']]);
    const r2 = await worker.fetch(new Request(`https://svc.example${path}`), env, ctx);
    expect([r2.headers.get('x-tile-cache'), r2.headers.get('x-tile-source')]).toEqual(['r2', 'extract']);
  });
});

describe('the skylines from the extract\'s tall layer (worker/src/osm.js skylineDoc, /skyline)', () => {
  it('the tall things in the box, by Overpass\'s rule and number()', async () => {
    const { osm } = await fresh();
    const doc = await osm.skylineDoc(env, SKY, { h: 45, floors: 14, mast: 0 });
    expect(doc.elements.map((e: { type: string; id: number }) => `${e.type}${e.id}`)).toEqual(['way1', 'way3']);
    const masts = await osm.skylineDoc(env, SKY, { h: 45, floors: 14, mast: 150 });
    expect(masts.elements.map((e: { type: string; id: number }) => `${e.type}${e.id}`)).toEqual(['node5', 'way1', 'way3']);
  });
  it('/skyline: a bad box is refused; a good one is answered from the extract', async () => {
    const { worker } = await fresh();
    const bad = await worker.fetch(new Request('https://svc.example/skyline?s=39&w=-76&n=41&e=-75'), env, ctx);
    expect(bad.status).toBe(400);
    const ok = await worker.fetch(new Request(`https://svc.example/skyline?s=${SKY.s}&w=${SKY.w}&n=${SKY.n}&e=${SKY.e}&h=45&floors=14&mast=0`), env, ctx);
    expect(ok.status).toBe(200);
    expect(ok.headers.get('x-tile-source')).toBe('extract');
    expect((await ok.json()).elements).toHaveLength(2);
  });
  it('/skyline before the extract is live: 503, briefly cached', async () => {
    const { worker } = await fresh();
    const r = await worker.fetch(new Request(`https://svc.example/skyline?s=${SKY.s}&w=${SKY.w}&n=${SKY.n}&e=${SKY.e}`), { TILES: { get: async () => null, put: async () => {} } }, ctx);
    expect(r.status).toBe(503);
    expect(r.headers.get('cache-control')).toMatch(/max-age=600/);
  });
});

// The add-on (osm/v1/addon: scripts/osm-extract-addon.mjs — the natural areas mapped as relations, cut
// since the extract was): read beside the extract when it is of the same snapshot; without it, or of
// another, the extract's answer as it was.
describe('the extract with its add-on (worker/src/osm.js, osm/v1/addon)', () => {
  const rel = (id: number, wid: number, lat: number, lon: number, natural: string) => ({
    type: 'relation', id,
    members: [{ type: 'way', ref: wid, role: 'outer', geometry: [{ lat, lon }, { lat: lat + 0.0004, lon }, { lat: lat + 0.0004, lon: lon + 0.0004 }, { lat, lon }] }],
    tags: { type: 'multipolygon', natural },
  });
  const ids = (doc: { elements: { type: string; id: number }[] }) => new Set(doc.elements.map((e) => `${e.type}${e.id}`));
  const addOn = async (ts: string) => {
    const f = fixtures[0], lat = (f.bb.s + f.bb.n) / 2, lon = (f.bb.w + f.bb.e) / 2;
    const small = rel(9_000_000_001, 9_000_000_011, lat, lon, 'beach'), big = rel(9_000_000_002, 9_000_000_012, lat + 0.001, lon, 'wood');
    const bbOf = (r: ReturnType<typeof rel>) => { const g = r.members[0].geometry; return { s: Math.min(...g.map((p) => p.lat)), w: Math.min(...g.map((p) => p.lon)), n: Math.max(...g.map((p) => p.lat)), e: Math.max(...g.map((p) => p.lon)) }; };
    const tx = tileX(lon), ty = tileY(lat), block = blockKey(tx, ty);
    // (a tile's lines: the small relation whole, the big one a pointer to its home block's big section)
    const text = [lineOf('r', small.id, bbOf(small), JSON.stringify(small)), lineOf('R', big.id, bbOf(big), block)].join('\n') + '\n';
    const t = await gzip(text), b = await gzip(JSON.stringify(big)), bin = new Uint8Array(t.length + b.length);
    bin.set(t, 0); bin.set(b, t.length);
    objects.set(`osm/v1/addon/b/${block}.ha.0.bin`, { b: bin });
    objects.set(`osm/v1/addon/b/${block}.ha.json`, { b: enc.encode(JSON.stringify({ v: 1, ts, tiles: { [tileKey(tx, ty)]: [0, t.length, 0] }, big: { [big.id]: [t.length, b.length, 0] } })) });
    objects.set('osm/v1/addon/index.json', { b: enc.encode(JSON.stringify({ v: 1, ts, tile: 128, block: 128, addon: 'relations', blocks: { [block]: 'ha' } })) });
    return { f, small, big };
  };
  const clear = () => { for (const k of [...objects.keys()]) if (k.startsWith('osm/v1/addon/')) objects.delete(k); };
  it('of the same snapshot: its relations — a small one whole, a big one from its own big section — beside every element of the extract', async () => {
    clear();
    const before = await (await fresh()).osm.extractDoc(env, fixtures[0].bb);
    const { f, small, big } = await addOn(TS);
    const after = await (await fresh()).osm.extractDoc(env, f.bb);
    const A = ids(before), B = ids(after);
    for (const k of A) expect(B.has(k), k).toBe(true);
    expect(B.has(`relation${small.id}`)).toBe(true);
    expect(B.has(`relation${big.id}`)).toBe(true);
    expect(B.size).toBe(A.size + 2);
    // …and the cell's TileJson carries the beach and the wood
    const tj = osmToTile(after, { id: idOf(f), box: f.box, origin: f.origin });
    expect(tj.areas.some((a) => a.c === 'beach')).toBe(true);
    clear();
  });
  it('of another snapshot, or none: the extract as it was', async () => {
    clear();
    const before = await (await fresh()).osm.extractDoc(env, fixtures[0].bb);
    await addOn('2025-01-01T00:00:00Z');
    const other = await (await fresh()).osm.extractDoc(env, fixtures[0].bb);
    expect([...ids(other)].sort()).toEqual([...ids(before)].sort());
    clear();
  });
});
