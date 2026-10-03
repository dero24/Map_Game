import { describe, it, expect, beforeAll } from 'vitest';
import { joinRec, foldRes, cellPlan, VER, INDEX_MADE, type Rec } from '../src/world/lidar';
import { measuredText, fnv36 } from '../src/world/measuredFile';
import { validFile, validIndex } from '../src/world/measured';
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
