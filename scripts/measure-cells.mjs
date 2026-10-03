// Precomputed LiDAR measurements: the runtime's own measure code (src/world/lidar.ts →
// lidarCell.ts → measure.ts, laz-perf decode) run ahead of time, so every tier — phones
// included — builds the same measured buildings a desktop reads off USGS 3DEP itself.
//
//   node scripts/measure-cells.mjs --region=shore              every cell of the baked pack
//   node scripts/measure-cells.mjs --region=shore --only=0_-1,0_0
//   node scripts/measure-cells.mjs --region=shore --resume     skip cells already measured at this VER
//   node scripts/measure-cells.mjs --region=shore --check      verify the sidecar against the pack (no network)
//
// Writes public/data/<region>/measured/<cell id>.json (one record per cell: building fits by
// centroid, the survey's unmapped buildings, its trees) and measured/index.json (VER, the
// project-index snapshot, the pack's bakeId, each cell's content hash or 0 = nothing to measure /
// no survey). The pack's own files are never touched. Output is deterministic: the same cell,
// survey and code write the same bytes (reads are ordered, failed reads retried, never skipped).
// Needs the network (USGS's public S3 bucket); takes a few seconds and ~10–20 MB per cell.
import { existsSync, mkdirSync, readFileSync, writeFileSync, rmSync, readdirSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const arg = (k, d) => {
  const a = process.argv.find((s) => s.startsWith(`--${k}=`));
  return a ? a.slice(k.length + 3) : process.argv.includes(`--${k}`) ? true : d;
};
const region = arg('region', 'shore');
const only = typeof arg('only') === 'string' ? new Set(arg('only').split(',')) : null;
const RESUME = !!arg('resume'), CHECK = !!arg('check');
const CONC = Math.max(1, +arg('conc', 2));
const TRIES = 4;

const packDir = resolve(ROOT, 'public/data', region);
const outDir = resolve(packDir, 'measured');
const man = JSON.parse(readFileSync(resolve(packDir, 'manifest.json'), 'utf8'));

// The runtime's modules through Vite (TypeScript, JSON imports, the vendored decoder).
const { runnerImport } = await import('vite');
const { module: M } = await runnerImport(resolve(ROOT, 'scripts/lib/measure-entry.ts'), { configFile: false, logLevel: 'error' });
// laz-perf is Emscripten's worker build: it wants a worker's globals (only when it starts up).
globalThis.self ??= globalThis;
globalThis.location ??= { href: 'file:///laz-perf/' };
globalThis.importScripts ??= () => {};

const idxPath = resolve(outDir, 'index.json');
const prev = existsSync(idxPath) ? JSON.parse(readFileSync(idxPath, 'utf8')) : null;
const tileJson = (t) => JSON.parse(readFileSync(resolve(packDir, t.file), 'utf8'));
// Pure ocean (nothing mapped at all): nothing for the survey to tell — settled without a read.
const empty = (tj) => !tj.buildings.length && !tj.roads.length && !(tj.areas ?? []).length;

if (CHECK) process.exit(check());

mkdirSync(outDir, { recursive: true });
const cells = { ...(prev?.ver === M.VER ? prev.cells : {}) };
const todo = man.tiles.filter((t) => !only || only.has(t.id));
let failed = 0, done = 0;
M.setCellLog((msg) => { if (/unavailable|feet/.test(msg)) console.log('   ' + msg); });

async function one(t) {
  const file = resolve(outDir, `${t.id}.json`);
  if (RESUME && cells[t.id] != null && (cells[t.id] === 0 || existsSync(file))) return;
  const tj = tileJson(t);
  const t0 = Date.now();
  const settle = (h, note) => {
    cells[t.id] = h;
    if (h === 0) rmSync(file, { force: true });
    writeIndex(); // (as it goes: a stopped run resumes with --resume)
    console.log(`${String(++done).padStart(3)}/${todo.length} ${t.id.padEnd(7)} ${note} (${((Date.now() - t0) / 1000).toFixed(1)} s)`);
  };
  if (empty(tj)) return settle(0, 'open water — nothing to measure');
  const plan = M.cellPlan(tj, t.box, man.origin);
  const q = M.cellRequest(tj, t.box, man.origin, plan.ck, plan.todo.map((b, i) => [b, plan.keys[i]]), undefined);
  if (!q) return settle(0, 'no survey near this cell');
  q.strict = true; // (a failed read throws: retried, never measured from an older survey instead)
  q.lean = true; // (nodes streamed into the grid as the tile service does — the same adds, so the same record)
  for (let a = 1; a <= TRIES; a++) {
    try {
      const rec = M.foldRes(undefined, await M.measureCell(q));
      if (rec.none) return settle(0, 'no survey covers this cell');
      const text = M.measuredText(M.VER, M.INDEX_MADE, plan.ck, t.id, rec);
      writeFileSync(file, text);
      const fits = Object.values(rec.m), ok = fits.filter((m) => m.length === 4 && m[3] >= 0.35).length;
      return settle(M.fnv36(text), `${ok}/${fits.length} measured, ${rec.nb?.length ?? 0} unmapped, ${(rec.t?.length ?? 0) / 4} trees, ${(text.length / 1024).toFixed(0)} KB, ${rec.src}`);
    } catch (e) {
      console.log(`    ${t.id} try ${a}/${TRIES}: ${e?.message ?? e}`);
      if (a < TRIES) await new Promise((r) => setTimeout(r, 4000 * a));
    }
  }
  failed++;
  delete cells[t.id];
  console.log(`    ${t.id} FAILED — left out of the index (run again with --resume)`);
}

let next = 0;
await Promise.all(Array.from({ length: CONC }, async () => { while (next < todo.length) await one(todo[next++]); }));
writeIndex();
console.log(`${Object.keys(cells).length}/${man.tiles.length} cells in measured/index.json (${M.VER})${failed ? ` — ${failed} failed` : ''}`);
process.exit(failed ? 1 : 0);

function writeIndex() {
  const sorted = Object.fromEntries(Object.keys(cells).sort().map((k) => [k, cells[k]]));
  writeFileSync(idxPath, JSON.stringify({ v: 1, ver: M.VER, index: M.INDEX_MADE, bakeId: man.bakeId, cells: sorted }, null, 1) + '\n');
}

// --check: every indexed file exists, hashes to its entry, carries this VER and keys only footprints
// the pack's cell actually has (the bake and the sidecar agree).
function check() {
  if (!prev || !M.validIndex(prev)) return console.log('no measured/index.json'), 1;
  let bad = 0;
  const say = (m) => (bad++, console.log('  FAIL ' + m));
  if (prev.ver !== M.VER) say(`index ver ${prev.ver} ≠ runtime ${M.VER} — re-run the script`);
  if (prev.bakeId !== man.bakeId) say(`index bakeId ${prev.bakeId} ≠ pack ${man.bakeId} — re-run after a re-bake`);
  const byId = new Map(man.tiles.map((t) => [t.id, t]));
  for (const [id, h] of Object.entries(prev.cells)) {
    const t = byId.get(id);
    if (!t) { say(`${id}: not a cell of the pack`); continue; }
    if (h === 0) continue;
    const f = resolve(outDir, `${id}.json`);
    if (!existsSync(f)) { say(`${id}: file missing`); continue; }
    const text = readFileSync(f, 'utf8');
    if (M.fnv36(text) !== h) say(`${id}: hash ${M.fnv36(text)} ≠ index ${h}`);
    const j = JSON.parse(text);
    if (!M.validFile(j) || j.ver !== M.VER) { say(`${id}: malformed or stale file`); continue; }
    const plan = M.cellPlan(tileJson(t), t.box, man.origin);
    if (j.ck !== plan.ck) say(`${id}: cell key ${j.ck} ≠ ${plan.ck}`);
    const keys = new Set(plan.keys), stray = Object.keys(j.rec.m).filter((k) => !keys.has(k)).length;
    if (stray) say(`${id}: ${stray} fits for footprints the cell doesn't have`);
  }
  for (const f of readdirSync(outDir)) if (f !== 'index.json' && !(f.replace(/\.json$/, '') in prev.cells && prev.cells[f.replace(/\.json$/, '')])) say(`${f}: not in the index`);
  console.log(bad ? `${bad} problem(s)` : `measured/ ok: ${Object.keys(prev.cells).length} cells`);
  return bad ? 1 : 0;
}
