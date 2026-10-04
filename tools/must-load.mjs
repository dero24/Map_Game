#!/usr/bin/env node
// The must-load towns (tools/audit48-towns.json `mustLoad`; docs/GAMEPLAY_VISION.md §17 Tier 0: "a
// fixed list of towns that must load with land, roads, buildings and trees").
//
//   node tools/must-load.mjs --live [--service=https://map-game-tiles.map-game-tiles.workers.dev]
//     the deployed tile service, now: every town's spawn cell and its eight neighbours answer 200 with
//     real streets and buildings, from our own extract (x-tile-source), within --within=60 s. Exit 1
//     on any failure. Cheap: R2 hits after the first run (CI runs it on every push).
//   node tools/must-load.mjs --fixtures --pack=D:/map_game_osm/out/v1
//     each streamed town's spawn cell, assembled from a local extract pack exactly as the service does
//     (src/world/osmTiles.ts → osmToTile), kept as tests/fixtures/towns/<id>.tile.json.gz with today's
//     counts for tests/mustLoad.test.ts. A baked town (Sea Bright) is read from its pack by the test.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { gunzipSync, gzipSync } from 'node:zlib';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const args = Object.fromEntries(process.argv.slice(2).map((a) => { const m = a.match(/^--([^=]+)(?:=(.*))?$/); return m ? [m[1], m[2] ?? true] : [a, true]; }));
const TOWNS = JSON.parse(readFileSync(resolve(ROOT, 'tools/audit48-towns.json'), 'utf8')).towns.filter((t) => t.mustLoad);
const SERVICE = String(args.service ?? 'https://map-game-tiles.map-game-tiles.workers.dev');
const { runnerImport } = await import('vite');
const load = async (p) => (await runnerImport(resolve(ROOT, p), { configFile: false, logLevel: 'error' })).module;
const RT = await load('src/world/realTile.ts');
const VR = await load('src/world/virtual.ts');
const shore = JSON.parse(readFileSync(resolve(ROOT, 'public/data/shore/manifest.json'), 'utf8'));
const CELL = 1024, MARGIN = 48;

// a town's spawn: the region the game would put it in (the baked shore, else a virtual region at its
// snapped origin) and the cell the spawn point lies in
function spawnOf(t) {
  const P0 = RT.makeProjector(shore.origin);
  const [bx, bz] = P0.project(t.at[0], t.at[1]);
  const b = shore.backdrop;
  if (bx >= b.x0 && bx <= b.x1 && bz >= b.z0 && bz <= b.z1) return { baked: true, origin: shore.origin, x: bx, z: bz, cx: Math.floor(bx / CELL), cz: Math.floor(bz / CELL) };
  const origin = VR.virtualRegion(t.at).manifest.origin;
  const [x, z] = RT.makeProjector(origin).project(t.at[0], t.at[1]);
  return { baked: false, origin, x, z, cx: Math.floor(x / CELL), cz: Math.floor(z / CELL) };
}

if (args.live) {
  const within = Number(args.within ?? 60) * 1000;
  let bad = 0;
  for (const t of TOWNS) {
    const s = spawnOf(t);
    if (s.baked) { console.log(`${t.name}: baked (the shore pack) — not streamed`); continue; }
    const cells = [];
    for (let dx = -1; dx <= 1; dx++) for (let dz = -1; dz <= 1; dz++) cells.push([s.cx + dx, s.cz + dz]);
    const t0 = Date.now();
    const res = await Promise.all(cells.map(async ([cx, cz]) => {
      const r = await fetch(`${SERVICE}/tile/${cx}_${cz}.json?olat=${s.origin.lat}&olon=${s.origin.lon}`, { signal: AbortSignal.timeout(within) }).catch((e) => ({ ok: false, status: e.name }));
      if (!r.ok) return { cx, cz, ok: false, why: r.status };
      const tj = await r.json();
      return { cx, cz, ok: true, src: r.headers.get('x-tile-source'), cache: r.headers.get('x-tile-cache'), b: tj.buildings.length, r: tj.roads.length };
    }));
    const failed = res.filter((x) => !x.ok);
    const spawn = res.find((x) => x.cx === s.cx && x.cz === s.cz);
    const ok = !failed.length && spawn?.b > 0 && spawn?.r > 0;
    if (!ok) bad++;
    console.log(`${ok ? 'ok  ' : 'FAIL'} ${t.name}: ${res.length - failed.length}/9 cells in ${((Date.now() - t0) / 1000).toFixed(1)} s · spawn cell ${spawn?.b ?? '?'} buildings, ${spawn?.r ?? '?'} roads · from ${[...new Set(res.map((x) => x.src ?? x.why))].join(', ')}${failed.length ? ` · failed ${failed.map((f) => `${f.cx}_${f.cz} (${f.why})`).join(' ')}` : ''}`);
  }
  process.exit(bad ? 1 : 0);
}

if (args.fixtures) {
  const OT = await load('src/world/osmTiles.ts');
  const PACK = String(args.pack ?? 'D:/map_game_osm/out/v1');
  const index = JSON.parse(readFileSync(`${PACK}/index.json`, 'utf8'));
  const dirs = new Map(), bins = new Map();
  const dirOf = (b) => { if (!dirs.has(b)) dirs.set(b, existsSync(`${PACK}/${b}.json`) ? JSON.parse(readFileSync(`${PACK}/${b}.json`, 'utf8')) : null); return dirs.get(b); };
  const binOf = (b, p) => { const k = `${b}.${p}`; if (!bins.has(k)) bins.set(k, readFileSync(`${PACK}/${b}.${p}.bin`)); return bins.get(k); };
  const read = (b, at) => gunzipSync(binOf(b, at[2] ?? 0).subarray(at[0], at[0] + at[1])).toString();
  const src = { async tile(b, t) { const at = dirOf(b)?.tiles[t]; return at ? read(b, at) : null; }, async big(b, id) { const at = dirOf(b)?.big?.[id]; return at ? read(b, at) : null; } };
  const FIX = resolve(ROOT, 'tests/fixtures/towns');
  mkdirSync(FIX, { recursive: true });
  for (const t of TOWNS) {
    const s = spawnOf(t);
    if (s.baked) { console.log(`${t.name}: baked — the test reads the shore pack`); continue; }
    const box = { x0: s.cx * CELL, z0: s.cz * CELL, x1: s.cx * CELL + CELL, z1: s.cz * CELL + CELL };
    const bb = RT.makeProjector(s.origin).localToBbox({ x0: box.x0 - MARGIN, z0: box.z0 - MARGIN, x1: box.x1 + MARGIN, z1: box.z1 + MARGIN });
    const doc = await OT.assemble(src, bb, index.ts);
    const tile = RT.osmToTile(doc, { id: `${s.cx}_${s.cz}`, box, origin: s.origin });
    const f = resolve(FIX, `${t.id}.tile.json.gz`);
    writeFileSync(f, gzipSync(JSON.stringify({ id: t.id, name: t.name, kind: t.kind, at: t.at, origin: s.origin, spawn: [s.x, s.z], cell: [s.cx, s.cz], ts: index.ts, tile })));
    console.log(`${t.name}: cell ${s.cx}_${s.cz} · ${tile.buildings.length} buildings, ${tile.roads.length} roads, ${tile.areas.length} areas, ${tile.points.length} points → ${f.slice(ROOT.length + 1)} (${(readFileSync(f).length / 1024).toFixed(0)} KB)`);
  }
}
