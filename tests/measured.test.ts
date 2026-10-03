import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { joinRec, foldRes, cellPlan, bKey, enrichTile, initLidar, VER, INDEX_MADE, type Rec } from '../src/world/lidar';
import { measuredText, fnv36, MEASURED_V } from '../src/world/measuredFile';
import { validFile, validIndex, serviceMeasured } from '../src/world/measured';
import type { TileJson } from '../src/world/data';

// (the pack is read off the disk: node's fs, found at run time — the type check knows no node)
const PACK = new URL('../public/data/shore/', import.meta.url);
let fs: { readFileSync(p: URL, enc: 'utf8'): string; existsSync(p: URL): boolean };
const read = (f: string) => fs.readFileSync(new URL(f, PACK), 'utf8');

const rec = (): Rec => ({ src: 'NJ_SNJ_2014', yr: 2014, m: { '40.36231,-73.97446': [8.4, 5.9, 2, 0.81], '40.36290,-73.97440': [] }, t: [10, -20, 95, 30], tc: [1, 1, 0], nb: [{ r: [1, 2, 3, 4, 5, 6], m: [3.1] }] });

describe('measured: precomputed LiDAR records', () => {
  it('writes the same bytes for the same record, whatever order its fields were set in', () => {
    const a = rec();
    const b: Rec = { nb: a.nb, tc: a.tc, t: a.t, m: a.m, yr: a.yr, src: a.src };
    const ta = measuredText('lidar|v8|x|', 'x', '40.3600,-73.9700', '0_-1', a);
    const tb = measuredText('lidar|v8|x|', 'x', '40.3600,-73.9700', '0_-1', b);
    expect(ta).toBe(tb);
    expect(fnv36(ta)).toBe(fnv36(tb));
    expect(validFile(JSON.parse(ta))).toBe(true);
  });
  it('the precomputed fits win over what a browser measured itself; its own only fill gaps', () => {
    const pre = rec();
    const own: Rec = { m: { '40.36231,-73.97446': [12, 9, 0, 0.9], '40.10000,-73.00000': [5, 3, 1, 0.7] } };
    const j = joinRec(pre, own)!;
    expect(j.m['40.36231,-73.97446']).toEqual([8.4, 5.9, 2, 0.81]);
    expect(j.m['40.10000,-73.00000']).toEqual([5, 3, 1, 0.7]);
    expect(pre.m['40.10000,-73.00000']).toBeUndefined(); // (the precomputed record isn't mutated)
    expect(joinRec(null, own)).toBe(own);
    expect(joinRec({ none: 1, m: {} }, own)!.none).toBe(1);
  });
  it('folds a worker result the way the runtime always has', () => {
    const r = foldRes(undefined, { src: 's', year: 2020, fits: [['k', [6, 4, 1, 0.5]]], t: [1, 2, 3, 4], tc: [1] });
    expect(r).toEqual({ src: 's', yr: 2020, m: { k: [6, 4, 1, 0.5] }, t: [1, 2, 3, 4], tc: [1] });
    expect(foldRes(undefined, { none: 1, fits: [] }).none).toBe(1);
  });
  it('rejects what is not a sidecar (a dev server answers a missing file with index.html)', () => {
    expect(validIndex(null)).toBe(false);
    expect(validIndex({ v: 1, cells: {} })).toBe(true);
    expect(validFile({ v: 1, rec: {} })).toBe(false);
  });
});

// The shore's sidecar (scripts/measure-cells.mjs): made by this runtime's measure code, for this
// pack, and every file what the index says it is — a stale or mismatched sidecar would hand every
// phone the wrong buildings. And the pack itself is the one that was baked (its tiles still hash to
// its bakeId): the sidecar sits beside it, never in it.
describe('measured: the shore sidecar', () => {
  let man: { bakeId: string; origin: { lat: number; lon: number }; tiles: { id: string; file: string; box: TileJson['box'] }[] };
  let ix: { v: 1; ver: string; index: string; bakeId: string; cells: Record<string, string | 0> };
  beforeAll(async () => {
    fs = (await import(/* @vite-ignore */ `node:${'fs'}`)) as typeof fs;
    man = JSON.parse(read('manifest.json'));
    ix = JSON.parse(read('measured/index.json'));
  });
  it('is this runtime\'s measurement of this pack', () => {
    expect(validIndex(ix)).toBe(true);
    expect(ix.ver).toBe(VER);
    expect(ix.index).toBe(INDEX_MADE);
    expect(ix.bakeId).toBe(man.bakeId);
    // every cell of the pack is settled: a record, or 0 (open water / no survey)
    expect(Object.keys(ix.cells).sort()).toEqual(man.tiles.map((t) => t.id).sort());
  });
  it('every record hashes to its index entry, carries this VER and keys only the cell\'s own footprints', () => {
    let files = 0;
    for (const t of man.tiles) {
      const h = ix.cells[t.id];
      if (h === 0) {
        expect(fs.existsSync(new URL(`measured/${t.id}.json`, PACK))).toBe(false);
        continue;
      }
      const text = read(`measured/${t.id}.json`);
      expect(fnv36(text), t.id).toBe(h);
      const j = JSON.parse(text);
      expect(validFile(j)).toBe(true);
      expect(j.ver).toBe(VER);
      expect(j.id).toBe(t.id);
      // (canonical: re-serialising the record gives the same bytes)
      expect(measuredText(j.ver, j.index, j.ck, j.id, j.rec)).toBe(text);
      const plan = cellPlan(JSON.parse(read(t.file)) as TileJson, t.box, man.origin);
      expect(j.ck).toBe(plan.ck);
      const keys = new Set(plan.keys);
      expect(Object.keys(j.rec.m).filter((k) => !keys.has(k)), t.id).toEqual([]);
      // the script asked about every measurable footprint: a phone has nothing left to measure
      expect(plan.keys.filter((k) => !j.rec.m[k]), t.id).toEqual([]);
      files++;
    }
    expect(files).toBeGreaterThan(100);
  });
  it('leaves the pack as it was baked (its tiles still hash to its bakeId)', () => {
    let h = 0x811c9dc5; // (scripts/bake.mjs: FNV-1a over every tile payload, in manifest order)
    for (const t of man.tiles) {
      const s = read(t.file);
      for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 0x01000193);
    }
    expect((h >>> 0).toString(36)).toBe(man.bakeId);
  });
});

// The tile service's records (streamed cells): asked once per cell, patient with a measure in
// progress, never remembering a failure, never trusting a record made by other measure code — and
// never asked at all where there's no survey, or by a stand-in (a peek).
describe('measured: the tile service\'s records', () => {
  const O = { lat: 40.362, lon: -73.9755 }; // (the shore: surveyed)
  const box = (cx: number, cz: number) => ({ x0: cx * 1024, z0: cz * 1024, x1: cx * 1024 + 1024, z1: cz * 1024 + 1024 });
  const file = (rec: Rec, ver = VER) => JSON.stringify({ v: 1, ver, index: INDEX_MADE, ck: 'x', rec });
  const answer = (status: number, body = '', retry?: string) => new Response(status === 202 ? '{"pending":1}' : body, { status, headers: retry ? { 'retry-after': retry } : {} });
  let calls: string[] = [];
  let script: (() => Response | Promise<Response>)[] = [];
  const realFetch = globalThis.fetch;
  afterAll(() => void (globalThis.fetch = realFetch));
  beforeAll(() => {
    globalThis.fetch = (async (u: string) => {
      calls.push(String(u));
      const next = script.shift();
      if (!next) throw new TypeError('offline');
      return next();
    }) as typeof fetch;
  });
  const reset = (...s: (() => Response | Promise<Response>)[]) => ((calls = []), (script = s));
  it('asks once per cell, at the cell\'s URL, and shares the answer', async () => {
    reset(() => answer(200, file(rec())));
    const [a, b] = await Promise.all([serviceMeasured('https://svc', O, 3, 4, box(3, 4), false), serviceMeasured('https://svc', O, 3, 4, box(3, 4), false)]);
    expect(a?.m['40.36231,-73.97446']).toEqual([8.4, 5.9, 2, 0.81]);
    expect(b).toBe(a);
    expect(calls).toEqual([`https://svc/measured/3_4.json?olat=40.362&olon=-73.9755&v=${MEASURED_V}`]);
  });
  it('waits out a measure in progress (202), then takes the record', async () => {
    vi.useFakeTimers();
    try {
      reset(() => answer(202, '', '2'), () => answer(202, '', '2'), () => answer(200, file(rec())));
      const p = serviceMeasured('https://svc', O, 5, 5, box(5, 5), false);
      await vi.advanceTimersByTimeAsync(5000);
      expect((await p)?.src).toBe('NJ_SNJ_2014');
      expect(calls.length).toBe(3);
    } finally {
      vi.useRealTimers();
    }
  });
  it('a failure (offline, an error, a record from other measure code) is null, and asked again next time', async () => {
    reset();
    expect(await serviceMeasured('https://svc', O, 6, 6, box(6, 6), false)).toBeNull(); // offline
    reset(() => answer(503, '{"error":"x"}'));
    expect(await serviceMeasured('https://svc', O, 6, 6, box(6, 6), false)).toBeNull();
    reset(() => answer(200, file(rec(), 'lidar|v7|old|')));
    expect(await serviceMeasured('https://svc', O, 6, 6, box(6, 6), false)).toBeNull();
    reset(() => answer(200, '<!doctype html>'));
    expect(await serviceMeasured('https://svc', O, 6, 6, box(6, 6), false)).toBeNull();
    reset(() => answer(200, file(rec())));
    expect(await serviceMeasured('https://svc', O, 6, 6, box(6, 6), false)).not.toBeNull();
    expect(calls.length).toBe(1);
  });
  it('never asks where there\'s no survey, nor for a peek', async () => {
    reset(() => answer(200, file(rec())));
    expect((await serviceMeasured('https://svc', { lat: 40.75, lon: -60 }, 0, 0, box(0, 0), false))?.none).toBe(1); // (the open Atlantic)
    expect(await serviceMeasured('https://svc', O, 7, 7, box(7, 7), true)).toBeNull();
    expect(calls).toEqual([]);
  });
});

// A record still on its way (the service measuring the cell for its first visitor): built from
// priors now ('late'), neither tier reading the survey meanwhile; the relief rebuild takes it.
describe('measured: enrichTile with a record on its way', () => {
  const O = { lat: 40.362, lon: -73.9755 };
  const tile = (cx: number, cz: number): { tj: TileJson; box: TileJson['box'] } => {
    const x = cx * 10240 + 2000, z = cz * 10240 + 2000;
    const b = { r: [x, z, x + 120, z, x + 120, z + 90, x, z + 90], h: 4.5, k: 'house', roof: 'hip', s: 1 } as unknown as TileJson['buildings'][number];
    return { tj: { buildings: [b], roads: [], areas: [], lines: [], points: [] } as unknown as TileJson, box: { x0: cx * 1024, z0: cz * 1024, x1: cx * 1024 + 1024, z1: cz * 1024 + 1024 } };
  };
  const recFor = (tj: TileJson): Rec => ({ src: 's', yr: 2014, m: { [bKey(O, tj.buildings[0])]: [9.2, 6.1, 2, 0.8] }, t: [], tc: [], nb: [] });
  for (const measure of [false, true]) {
    it(`${measure ? 'a desktop' : 'a phone'}: 'late' past the wait, the measured house on the relief rebuild`, async () => {
      initLidar(O, measure);
      const first = tile(measure ? 21 : 20, 3);
      let land!: (r: Rec | null) => void;
      const coming = new Promise<Rec | null>((r) => (land = r));
      const pre = () => coming;
      expect(await enrichTile(first.tj, first.box, 30, true, pre)).toBe('late');
      expect(first.tj.buildings[0].h).toBe(4.5); // (priors meanwhile)
      land(recFor(first.tj));
      const again = tile(measure ? 21 : 20, 3);
      expect(await enrichTile(again.tj, again.box, null, true, pre)).toBe('done');
      expect(again.tj.buildings[0].h).toBe(9.2);
      expect(again.tj.buildings[0].roof).toBe('gable');
    });
  }
});
