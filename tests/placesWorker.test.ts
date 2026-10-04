import { describe, expect, it, beforeAll } from 'vitest';
import shardsJson from './fixtures/places/shards.json';
import tilesJson from './fixtures/places/rev.json';
// @ts-expect-error — the tile service is plain JS
import { places } from '../worker/src/places.js';

// The tile service's place routes (worker/src/places.js) over an in-memory R2 packed the way
// scripts/build-places.mjs packs it: gzipped shards back to back, a directory of [offset, length].
const shards = shardsJson as Record<string, string>;
const tiles = tilesJson as Record<string, unknown>;
const enc = new TextEncoder(), dec = new TextDecoder();
const gzip = async (s: string) => new Uint8Array(await new Response(new Blob([s]).stream().pipeThrough(new CompressionStream('gzip'))).arrayBuffer());
async function pack(entries: [string, string][]) {
  const dir: Record<string, number[]> = {};
  const parts: Uint8Array[] = [];
  let off = 0;
  for (const [k, body] of entries) { const gz = await gzip(body); dir[k] = [off, gz.length]; parts.push(gz); off += gz.length; }
  const bin = new Uint8Array(off);
  let o = 0;
  for (const p of parts) { bin.set(p, o); o += p.length; }
  return { dir, bin };
}
const objects = new Map<string, Uint8Array>();
const reads: string[] = [];
const bucket = {
  async get(key: string, opts?: { range?: { offset: number; length: number } }) {
    const b = objects.get(key);
    if (!b) return null;
    reads.push(key + (opts?.range ? `@${opts.range.offset}` : ''));
    const s = opts?.range ? b.subarray(opts.range.offset, opts.range.offset + opts.range.length) : b;
    return { body: new Blob([s as BlobPart]).stream(), text: async () => dec.decode(s), json: async () => JSON.parse(dec.decode(s)) };
  },
};
const json = (body: unknown, init: ResponseInit = {}) => new Response(typeof body === 'string' ? body : JSON.stringify(body), { ...init, headers: { 'content-type': 'application/json', ...(init.headers ?? {}) } });
const ctx = { waitUntil: () => {} };
const ask = async (path: string) => {
  const url = new URL(`https://svc.example${path}`);
  const r: Response = await places(new Request(url), { TILES: bucket }, ctx, url, { json });
  return { status: r.status, headers: r.headers, body: await r.json() };
};

beforeAll(async () => {
  (globalThis as unknown as { caches: unknown }).caches = { default: { match: async () => undefined, put: async () => {} } };
  const n = await pack(Object.entries(shards));
  objects.set('places/v3/names.bin', n.bin);
  objects.set('places/v3/names.json', enc.encode(JSON.stringify({ v: 1, shards: Object.fromEntries(Object.entries(n.dir).map(([k, v]) => [k, [...v, 0]])) })));
  const t = await pack(Object.entries(tiles).map(([k, v]) => [k, JSON.stringify(v)]));
  objects.set('places/v3/rev.bin', t.bin);
  objects.set('places/v3/rev.json', enc.encode(JSON.stringify({ v: 1, tiles: t.dir })));
});

describe('the tile service answers place searches and reverse tiles (worker/src/places.js)', () => {
  it('search: Shrewsbury near the shore, from one ranged read of one shard', async () => {
    reads.length = 0;
    const r = await ask('/places/search?q=Shrewsbury&lat=40.3597&lon=-73.975');
    expect(r.status).toBe(200);
    expect(r.body.results[0]).toMatchObject({ name: 'Shrewsbury', detail: 'borough · Monmouth County, NJ', kind: 'borough' });
    expect(r.body.results[0].score).toBeUndefined();
    expect(reads.filter((k) => k.startsWith('places/v3/names.bin@'))).toHaveLength(1);
    expect(r.headers.get('cache-control')).toMatch(/max-age=86400/);
  });
  it('search: a qualifier that is not in the name falls through to the next shard', async () => {
    const r = await ask('/places/search?q=asbury%20monmouth&lat=40.36&lon=-74');
    expect(r.body.results[0]?.name).toBe('Asbury Park');
  });
  it('search: too short, or nothing matches: an empty list, not an error', async () => {
    expect((await ask('/places/search?q=s')).body.results).toEqual([]);
    expect((await ask('/places/search?q=zzzzqx')).body.results).toEqual([]);
  });
  it('reverse tile: the tile round Sea Bright has its boroughs; open sea is an empty tile', async () => {
    const r = await ask('/places/rt/424_521.json');
    expect(r.status).toBe(200);
    expect(r.body.b.some((b: { n: string }) => b.n === 'Sea Bright')).toBe(true);
    expect(r.headers.get('cache-control')).toMatch(/immutable/);
    expect((await ask('/places/rt/1_1.json')).body).toEqual({ v: 3, b: [] });
  });
  it('other paths under /places are not its business', async () => {
    const url = new URL('https://svc.example/places/nope');
    expect(await places(new Request(url), { TILES: bucket }, ctx, url, { json })).toBeNull();
  });
});
