#!/usr/bin/env node
// Upload our own OpenStreetMap extract (scripts/osm-extract.mjs's packs) to R2 for the tile service
// (worker/src/osm.js). Only what changed goes up: each block's keys carry its content hash
// (`osm/v1/b/<bx>_<by>.<hash>.bin` and `.json`), so an unchanged block is never re-written (R2 bills
// writes: a refresh writes the blocks whose OSM changed, and one index). The index — which hash each
// block is, and the outline the extract covers — goes up last, so the service switches in one write.
//
//   node scripts/osm-upload.mjs --pack=D:/map_game_osm/out/v1 --poly=D:/map_game_osm/us.poly
//     [--no-index] (stage the blocks, leave the service as it is) [--dry] [--jobs=4]
//     [--local] (the `wrangler dev` R2 instead of Cloudflare's, for trying the service locally)
//     [--prune] (list the uploaded keys no index names any more — delete them by hand once the new
//     index has been live a day)
//   node scripts/osm-upload.mjs --addon --pack=D:/map_game_osm/out/addon-v1
//     an add-on (scripts/osm-extract-addon.mjs) under `osm/v1/addon/`: its blocks, then its own index —
//     the extract's index is never touched; the service reads the add-on beside the extract when the
//     two are from one snapshot (worker/src/osm.js). Taking it back: delete `osm/v1/addon/index.json`.
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { spawn } from 'node:child_process';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const args = Object.fromEntries(process.argv.slice(2).map((a) => { const m = a.match(/^--([^=]+)(?:=(.*))?$/); return m ? [m[1], m[2] ?? true] : [a, true]; }));
const PACK = String(args.pack ?? 'D:/map_game_osm/out/v1');
const ADDON = !!args.addon;
const BUCKET = 'map-game-tiles', PFX = ADDON ? 'osm/v1/addon' : 'osm/v1';
const JOBS = Number(args.jobs ?? 4);
const index = JSON.parse(readFileSync(`${PACK}/index.json`, 'utf8'));
const doneFile = `${PACK}/uploaded${args.local ? '.local' : ''}.json`;
const done = new Set(existsSync(doneFile) ? JSON.parse(readFileSync(doneFile, 'utf8')) : []);

// Geofabrik's .poly: a name, then rings of "lon lat" lines, each closed by END. A ring named "!…" is
// a hole — none in the US file, and refused: the service reads the outline as plain rings, so a
// dropped hole would claim its area as covered
function readPoly(file) {
  const rings = [];
  let cur = null;
  for (const line of readFileSync(file, 'utf8').split(/\r?\n/).slice(1)) {
    const t = line.trim();
    if (!t) continue;
    if (t === 'END') { if (cur) rings.push(cur); cur = null; continue; }
    if (!cur) { if (t.startsWith('!')) throw new Error(`${file}: ring ${t} is a hole — the service's outline has no holes`); cur = []; continue; }
    const [x, y] = t.split(/\s+/).map(Number);
    cur.push([+x.toFixed(6), +y.toFixed(6)]);
  }
  return rings;
}
const cover = args.poly ? readPoly(String(args.poly)) : index.cover;
if (!ADDON && !cover?.length) { console.error('--poly=<extract outline> is required (Geofabrik: <name>.poly)'); process.exit(1); }
if (ADDON && !index.addon) { console.error(`${PACK} is no add-on (its index has no "addon")`); process.exit(1); }

// (three tries: a wrangler upload now and then fails for nothing — the local store under parallel
// writes, the network)
const put = async (key, file, type) => { for (let i = 0; i < 3; i++) if (await put1(key, file, type)) return true; return false; };
const put1 = (key, file, type) => new Promise((res) => {
  if (args.dry) { console.log('would put', key); return res(true); }
  const p = spawn(process.platform === 'win32' ? 'npx.cmd' : 'npx', ['wrangler', 'r2', 'object', 'put', `${BUCKET}/${key}`, `--file=${file}`, `--content-type=${type}`, args.local ? '--local' : '--remote'], { cwd: resolve(ROOT, 'worker'), shell: process.platform === 'win32', stdio: ['ignore', 'pipe', 'pipe'] });
  let err = '';
  p.stderr.on('data', (d) => (err += d));
  p.stdout.on('data', (d) => (err += d));
  p.on('close', (code) => { if (code) console.error(`  ${key}: failed\n${err.slice(-400)}`); res(code === 0); });
});

const jobs = [];
for (const [b, info] of Object.entries(index.blocks)) {
  for (const [ext, type] of [...Array.from({ length: info.parts ?? 1 }, (_, p) => [`${p}.bin`, 'application/octet-stream']), ['json', 'application/json']]) {
    const key = `${PFX}/b/${b}.${info.hash}.${ext}`;
    if (!done.has(key)) jobs.push({ key, file: `${PACK}/${b}.${ext}`, type });
  }
}
const named = new Set(Object.entries(index.blocks).flatMap(([b, i]) => [...Array.from({ length: i.parts ?? 1 }, (_, p) => `${PFX}/b/${b}.${i.hash}.${p}.bin`), `${PFX}/b/${b}.${i.hash}.json`]));
if (args.prune) { for (const k of done) if (!named.has(k)) console.log('stale', k); process.exit(0); }
console.log(`${jobs.length} objects to upload (${Object.keys(index.blocks).length} blocks, ${done.size} already up)`);
let next = 0, ok = 0, bad = 0;
const t0 = Date.now();
await Promise.all(Array.from({ length: Math.min(JOBS, jobs.length) }, async () => {
  while (next < jobs.length) {
    const j = jobs[next++];
    if (await put(j.key, j.file, j.type)) { ok++; done.add(j.key); if (!args.dry && ok % 20 === 0) writeFileSync(doneFile, JSON.stringify([...done])); } else bad++;
    if ((ok + bad) % 25 === 0) console.log(`  ${ok + bad}/${jobs.length} (${((Date.now() - t0) / 1000).toFixed(0)} s)`);
  }
}));
if (!args.dry) writeFileSync(doneFile, JSON.stringify([...done]));
console.log(`uploaded ${ok}, failed ${bad}`);
if (bad) process.exit(1);
if (args['no-index']) { console.log('blocks staged; the index was left as it is (--no-index)'); process.exit(0); }
const blocks = Object.fromEntries(Object.entries(index.blocks).map(([b, i]) => [b, i.hash]));
// (an add-on's index: its snapshot, what it adds, its blocks — no outline: the extract's says what's covered)
const live = ADDON ? { v: 1, ts: index.ts, tile: index.tile, block: index.block, addon: index.addon, sources: index.sources, made: index.made, blocks }
  : { v: 1, ts: index.ts, tile: index.tile, block: index.block, sources: index.sources, made: index.made, cover, blocks };
const f = `${PACK}/index.live.json`;
writeFileSync(f, JSON.stringify(live));
if (!(await put(`${PFX}/index.json`, f, 'application/json'))) process.exit(1);
console.log(`index switched: ${Object.keys(live.blocks).length} blocks as of ${live.ts}`);
