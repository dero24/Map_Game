// Session-start health gate. Run this before any new work:
//   node tools/init.mjs            full check (deps, typecheck, tests, baked pack)
//   node tools/init.mjs --fast     skip vitest (repeat init in one session)
// Exits non-zero if the baseline is broken — fix it before stacking new work on top.
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { spawnSync } from 'node:child_process';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const FAST = process.argv.includes('--fast');
const NPM = process.platform === 'win32' ? 'npm.cmd' : 'npm';

let failures = 0;
const ok = (msg) => console.log(`  ok   ${msg}`);
const bad = (msg) => { failures++; console.log(`  FAIL ${msg}`); };
const warn = (msg) => console.log(`  warn ${msg}`);

function run(label, cmd, args) {
  console.log(`==> ${label}`);
  // args are fixed constants — safe to concatenate for the .cmd shim on Windows
  const r = process.platform === 'win32'
    ? spawnSync(`${cmd} ${args.join(' ')}`, { cwd: ROOT, stdio: 'inherit', shell: true })
    : spawnSync(cmd, args, { cwd: ROOT, stdio: 'inherit' });
  if (r.status !== 0) { bad(`${label} exited ${r.status}`); return false; }
  return true;
}

console.log(`==> Working directory: ${ROOT}`);

// Node >= 20 (package.json engines)
const [major] = process.versions.node.split('.').map(Number);
if (major < 20) bad(`node ${process.versions.node} — engines requires >=20`);
else ok(`node ${process.versions.node}`);

// Dependencies present
if (!existsSync(resolve(ROOT, 'node_modules'))) {
  warn('node_modules missing — running npm install');
  run('npm install', NPM, ['install']);
} else ok('node_modules present');

// Baseline verification
if (run('typecheck', NPM, ['run', 'typecheck'])) ok('typecheck clean');
if (FAST) warn('vitest skipped (--fast)');
else if (run('vitest', NPM, ['test'])) ok('tests pass');

// Baked-pack sanity: every non-hidden REGIONS entry has a complete pack on disk.
console.log('==> Baked packs');
const { REGIONS } = await import(pathToFileURL(resolve(ROOT, 'scripts/config.mjs')).href);
const dataDir = resolve(ROOT, 'public/data');
let regionsJson = [];
try { regionsJson = JSON.parse(readFileSync(resolve(dataDir, 'regions.json'), 'utf8')); }
catch { bad('public/data/regions.json missing or unparseable — run npm run bake'); }

for (const [id, cfg] of Object.entries(REGIONS)) {
  if (cfg.hidden) continue;
  const dir = resolve(dataDir, id);
  // Planned/fetched-but-unbaked regions are new work in flight, not a broken baseline —
  // only a partial pack (dir exists, files missing) fails the gate.
  if (!existsSync(dir)) { warn(`${id}: no baked pack yet (planned/fetched)`); continue; }
  const missing = ['world.json', 'terrain.bin', 'manifest.json', 'paint.json']
    .filter((f) => !existsSync(resolve(dir, f)));
  if (missing.length) { bad(`${id}: partial bake — missing ${missing.join(', ')}`); continue; }
  const tiles = existsSync(resolve(dir, 'tiles'))
    ? readdirSync(resolve(dir, 'tiles')).filter((f) => f.endsWith('.json')).length : 0;
  if (!tiles) { bad(`${id}: tiles/ empty`); continue; }
  if (!regionsJson.some((r) => r.id === id)) { bad(`${id}: absent from regions.json`); continue; }
  ok(`${id}: manifest + ${tiles} tiles`);
}

// Work-queue state: counts by status + verified-completion rate, and enforce WIP=1.
console.log('==> Work queue');
try {
  const fl = JSON.parse(readFileSync(resolve(ROOT, 'feature_list.json'), 'utf8'));
  const counts = {};
  const active = [];
  for (const f of fl.features) { counts[f.status] = (counts[f.status] ?? 0) + 1; if (f.status === 'in_progress') active.push(f.id); }
  const done = counts.passing ?? 0, total = fl.features.length;
  ok(`features: ${total} total — ${done} passing, ${counts.not_started ?? 0} not_started, ${counts.blocked ?? 0} blocked, ${counts.superseded ?? 0} superseded, ${active.length} in_progress`);
  // the queue is ranked by tier (docs/GAMEPLAY_VISION.md §17): the next open item of the lowest tier
  const next = fl.features.filter((f) => f.status === 'not_started' || f.status === 'in_progress').sort((a, b) => (a.tier ?? 9) - (b.tier ?? 9) || (a.rank ?? 999) - (b.rank ?? 999))[0];
  if (next) ok(`next: tier ${next.tier ?? '?'} · ${next.id}${next.status === 'in_progress' ? ' (in progress)' : ''}`);
  if (active.length > 1) bad(`WIP limit violated: ${active.join(', ')} all in_progress — keep exactly one`);
  else if (active.length) ok(`active: ${active[0]}`);
} catch { bad('feature_list.json missing or unparseable'); }

// Constraint #5 as an executable check: no place names baked into runtime code.
// Comment lines are legit documentation — only code lines are scanned.
console.log('==> Invariants');
const PLACES = /\b(Sea Bright|Monmouth Beach|Ocean Avenue|Rumson Road)\b/;
const hits = [];
(function walk(dir) {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    if (e.name === 'vendor' || e.name === 'node_modules') continue;
    const p = resolve(dir, e.name);
    if (e.isDirectory()) walk(p);
    else if (/\.(ts|tsx|js|mjs)$/.test(e.name)) {
      readFileSync(p, 'utf8').split('\n').forEach((line, i) => {
        if (line.trimStart().startsWith('//') || line.trimStart().startsWith('*')) return;
        if (PLACES.test(line)) hits.push(`${p.replace(ROOT + '\\', '')}:${i + 1}`);
      });
    }
  }
})(resolve(ROOT, 'src'));
hits.length ? warn(`place names in code (move to config/meta): ${hits.join(', ')}`) : ok('no hardcoded place names in src/');

console.log('\n==> Next');
console.log('  play:        npm run dev  → http://localhost:5173');
console.log('  pick work:   feature_list.json — the lowest tier’s first open item by rank (one at a time)');
console.log('  history:     docs/earth/LOG.md (newest entry first)');
console.log('  tile worker: cd worker && npx wrangler dev   (only if touching real-lite tiles)');

if (failures) {
  console.error(`\n${failures} check(s) failed — fix the baseline before new feature work.`);
  process.exit(1);
}
console.log('\nBaseline healthy. Go.');
