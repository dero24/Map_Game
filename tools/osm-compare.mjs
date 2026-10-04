#!/usr/bin/env node
// Our own extract against Overpass, cell by cell (docs/DATA_SOURCES.md §0: "match Overpass exactly,
// and prove it"). For each sample cell: the extract's answer (src/world/osmTiles.ts `assemble`, read
// from a local pack — scripts/osm-extract.mjs's output) against an Overpass answer for the same box —
// a saved raw answer (tests/fixtures/osm/<case>.raw.json.gz, from `--save`), or, failing that, the
// TileJson the tile service already built from Overpass (R2) — compared element by element
// (`canonical`: what osmToTile reads) and as TileJson (osmToTile's own output, field by field).
//
//   node tools/osm-compare.mjs --pack=D:/map_game_osm/nj/out --cells=<olat>,<olon>:<cx>_<cz>[;…]
//     [--save] (ask Overpass for each box as of the extract's timestamp — an attic query, the same
//     OSM — and keep the raw answer with the box's extract tiles as one test fixture,
//     <case>.raw.json.gz: both sides go through today's osmToTile, so it outlives builder changes)
//     [--out=<dir>] (where --save and --fixture write: tests/fixtures/osm by default; a dense city's
//     cell is megabytes — keep those outside the repo)
//     [--fixture] (keep each compared cell — its extract tiles and the Overpass-built TileJson — as
//     a test fixture, tests/fixtures/osm/<case>.tile.json.gz: tests/osmExtract.test.ts replays it)
//     [--service=https://map-game-tiles.map-game-tiles.workers.dev] [--name=<case>]
// `osmBase` (the OSM data's timestamp each tile carries) is the one field left out of the TileJson
// comparison: the extract's is its snapshot's, Overpass's the moment it answered.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { gunzipSync, gzipSync } from 'node:zlib';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const args = Object.fromEntries(process.argv.slice(2).map((a) => { const m = a.match(/^--([^=]+)(?:=(.*))?$/); return m ? [m[1], m[2] ?? true] : [a, true]; }));
const PACK = String(args.pack ?? 'D:/map_game_osm/out/v1');
const SERVICE = String(args.service ?? 'https://map-game-tiles.map-game-tiles.workers.dev');
const FIX = resolve(ROOT, String(args.out ?? 'tests/fixtures/osm'));
const { runnerImport } = await import('vite');
const load = async (p) => (await runnerImport(resolve(ROOT, p), { configFile: false, logLevel: 'error' })).module;
const RT = await load('src/world/realTile.ts');
const OT = await load('src/world/osmTiles.ts');

const index = JSON.parse(readFileSync(`${PACK}/index.json`, 'utf8'));
const dirs = new Map();
const dirOf = (b) => { if (!dirs.has(b)) dirs.set(b, existsSync(`${PACK}/${b}.json`) ? JSON.parse(readFileSync(`${PACK}/${b}.json`, 'utf8')) : null); return dirs.get(b); };
const bins = new Map();
const binOf = (b, p = 0) => { const k = `${b}.${p}`; if (!bins.has(k)) bins.set(k, readFileSync(`${PACK}/${b}.${p}.bin`)); return bins.get(k); };
const used = new Map(); // tile → its text (for the fixture)
const src = {
  async tile(b, t) { const d = dirOf(b); const at = d?.tiles[t]; if (!at) return null; const s = gunzipSync(binOf(b, at[2] ?? 0).subarray(at[0], at[0] + at[1])).toString(); used.set(`${b}/${t}`, s); return s; },
  async big(b, id) { const d = dirOf(b); const at = d?.big?.[id]; if (!at) return null; const s = gunzipSync(binOf(b, at[2] ?? 0).subarray(at[0], at[0] + at[1])).toString(); used.set(`${b}/big/${id}`, s); return s; },
};

const CELL = 1024, MARGIN = 48;
const cells = String(args.cells ?? '').split(';').filter(Boolean).map((c) => { const [o, k] = c.split(':'); const [olat, olon] = o.split(',').map(Number); const [cx, cz] = k.split('_').map(Number); return { olat, olon, cx, cz }; });
if (!cells.length) { console.error('--cells=<olat>,<olon>:<cx>_<cz>[;…] is required'); process.exit(1); }

const diffList = (a, b, key) => {
  const A = new Map(a.map((e) => [key(e), e])), B = new Map(b.map((e) => [key(e), e]));
  return { onlyA: [...A.keys()].filter((k) => !B.has(k)), onlyB: [...B.keys()].filter((k) => !A.has(k)) };
};
let bad = 0;
for (const c of cells) {
  const origin = { lat: c.olat, lon: c.olon };
  const box = { x0: c.cx * CELL, z0: c.cz * CELL, x1: c.cx * CELL + CELL, z1: c.cz * CELL + CELL };
  const bb = RT.makeProjector(origin).localToBbox({ x0: box.x0 - MARGIN, z0: box.z0 - MARGIN, x1: box.x1 + MARGIN, z1: box.z1 + MARGIN });
  used.clear();
  const ours = await OT.assemble(src, bb, index.ts);
  const name = String(args.name ?? `${c.olat.toFixed(4)},${c.olon.toFixed(4)}_${c.cx}_${c.cz}`);
  const fx = resolve(FIX, `${name}.raw.json.gz`);
  let theirs = null, how = '';
  if (args.save) {
    // Overpass as of the extract's own moment (attic data): the same OSM, so every difference is ours
    const q = RT.overpassQuery(bb).replace('[out:json][timeout:25]', `[out:json][timeout:60][date:"${index.ts}"]`);
    for (const ep of ['https://overpass-api.de/api/interpreter', 'https://overpass.kumi.systems/api/interpreter']) {
      try {
        const r = await fetch(ep, { method: 'POST', body: 'data=' + encodeURIComponent(q), headers: { 'content-type': 'application/x-www-form-urlencoded', 'user-agent': 'map-game extract check (github.com/dero24/Map_Game)' }, signal: AbortSignal.timeout(120000) });
        if (!r.ok) { console.log(`  ${ep}: ${r.status}`); continue; }
        const j = await r.json();
        if (j.remark && /error|timed out/i.test(j.remark)) { console.log(`  ${ep}: ${j.remark.slice(0, 100)}`); continue; }
        theirs = j; how = `Overpass ${ep.split('/')[2]} as of ${index.ts}`;
        mkdirSync(FIX, { recursive: true });
        writeFileSync(fx, gzipSync(JSON.stringify({ name, origin, box, bb, ts: index.ts, tiles: Object.fromEntries(used), overpass: j, how })));
        console.log(`  fixture: ${fx.startsWith(ROOT) ? fx.slice(ROOT.length + 1) : fx} (${(readFileSync(fx).length / 1024).toFixed(0)} KB)`);
        break;
      } catch (e) { console.log(`  ${ep}: ${e.message}`); }
    }
  } else if (existsSync(fx)) { const f = JSON.parse(gunzipSync(readFileSync(fx)).toString()); theirs = f.overpass; how = `saved: ${f.how}`; }
  const tjOurs = RT.osmToTile(ours, { id: `${c.cx}_${c.cz}`, box, origin });
  if (theirs) {
    const A = ours.elements.map(OT.canonical), B = (theirs.elements ?? []).map(OT.canonical);
    const d = diffList(A, B, (x) => x);
    const tjTheirs = RT.osmToTile(theirs, { id: `${c.cx}_${c.cz}`, box, origin });
    const same = JSON.stringify(tjOurs) === JSON.stringify(tjTheirs);
    console.log(`${name}: ${ours.elements.length} elements ours, ${(theirs.elements ?? []).length} theirs (${how}) · ${d.onlyA.length} only ours, ${d.onlyB.length} only theirs · TileJson ${same ? 'IDENTICAL' : 'differs'}`);
    for (const x of d.onlyA.slice(0, 5)) console.log('   ours:  ', x.slice(0, 160));
    for (const x of d.onlyB.slice(0, 5)) console.log('   theirs:', x.slice(0, 160));
    if (d.onlyA.length || d.onlyB.length || !same) bad++;
    continue;
  }
  // no raw answer: the service's TileJson, if it was built from Overpass before (an R2 hit)
  // (a cell not in R2 would be built now — from Overpass, or the extract once it's live: not a reference)
  const r = await fetch(`${SERVICE}/tile/${c.cx}_${c.cz}.json?olat=${c.olat}&olon=${c.olon}`, { signal: AbortSignal.timeout(10000) }).catch(() => null);
  const cache = r?.headers.get('x-tile-cache'), source = r?.headers.get('x-tile-source');
  if (!r?.ok || (cache !== 'r2' && cache !== 'edge') || source === 'extract') { console.log(`${name}: no Overpass answer to compare (service ${r?.status ?? 'unreachable'} ${cache ?? ''} ${source ?? ''})`); continue; }
  const tj = await r.json();
  const keys = ['buildings', 'roads', 'areas', 'lines', 'points', 'trees', 'pois'];
  const rows = keys.filter((k) => Array.isArray(tj[k]) || Array.isArray(tjOurs[k])).map((k) => {
    const a = (tjOurs[k] ?? []).map((e) => JSON.stringify(e)), b = (tj[k] ?? []).map((e) => JSON.stringify(e));
    const d = diffList(a, b, (x) => x);
    return `${k} ${a.length}/${b.length}${d.onlyA.length || d.onlyB.length ? ` (−${d.onlyB.length} +${d.onlyA.length})` : ''}`;
  });
  const same = JSON.stringify({ ...tjOurs, osmBase: 0 }) === JSON.stringify({ ...tj, osmBase: 0 });
  console.log(`${name}: vs the service's Overpass-built TileJson (${cache}, Overpass of ${tj.osmBase}) · ${same ? 'IDENTICAL' : 'differs'} · ${rows.join(' · ')}`);
  if (!same) bad++;
  if (args.fixture) {
    mkdirSync(FIX, { recursive: true });
    writeFileSync(resolve(FIX, `${name}.tile.json.gz`), gzipSync(JSON.stringify({ name, origin, box, bb, ts: index.ts, tiles: Object.fromEntries(used), overpassTile: tj, how: `the tile service's TileJson built from Overpass (osmBase ${tj.osmBase})`, same })));
    const ff = resolve(FIX, `${name}.tile.json.gz`);
    console.log(`  fixture: ${ff.startsWith(ROOT) ? ff.slice(ROOT.length + 1) : ff}`);
  }
}
process.exit(bad ? 1 : 0);
