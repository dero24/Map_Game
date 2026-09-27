// Region factory gate — everything that must be true before a region counts as "live".
//   node tools/verify-region.mjs --region=<id>                  static checks only
//   node tools/verify-region.mjs --region=<id> --soak=90        + soak run
//   node tools/verify-region.mjs --region=<id> --shots=a,b      + montage capture
// Exit 1 on any FAIL. Record the output as evidence in feature_list.json `regions[]`.
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { spawnSync } from 'node:child_process';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const arg = (name) => process.argv.find((a) => a.startsWith(`--${name}=`))?.split('=')[1];
const region = arg('region');
const soakSecs = arg('soak');
const shots = arg('shots');

if (!region) {
  console.error('usage: node tools/verify-region.mjs --region=<id> [--soak=90] [--shots=a,b]');
  process.exit(2);
}

let failures = 0;
const ok = (m) => console.log(`  ok   ${m}`);
const bad = (m) => { failures++; console.log(`  FAIL ${m}`); };
const warn = (m) => console.log(`  warn ${m}`);

// 1. REGIONS entry — config.mjs exits(2) itself on an unknown --region, so reaching
//    this line means the id is real. `CFG` is the spec for the requested region.
const { CFG, REGIONS } = await import(pathToFileURL(resolve(ROOT, 'scripts/config.mjs')).href);
console.log(`==> ${region} (${CFG.name})`);

// 2. Raw inputs (or merged inputs for mergeFrom regions)
const raw = resolve(ROOT, 'raw', region);
if (existsSync(resolve(raw, 'osm.json'))) ok('raw/osm.json present');
else if (CFG.mergeFrom?.every((s) => existsSync(resolve(ROOT, 'raw', s, 'osm.json'))))
  warn(`raw/${region}/osm.json absent — merge sources exist; run node scripts/merge-raw.mjs --region=${region}`);
else bad(`raw/${region}/osm.json missing — run npm run fetch -- --region=${region}`);
for (const f of ['overture-buildings.json', 'worldcover.json', 'terrain'])
  (existsSync(resolve(raw, f)) ? ok : warn)(`raw/${f}`);
if (CFG.imagery !== false)
  (existsSync(resolve(raw, 'roofs.json')) ? ok : warn)('raw/roofs.json (NAIP roof colours)');

// 3. Baked pack
const out = resolve(ROOT, 'public/data', region);
for (const f of ['world.json', 'terrain.bin', 'manifest.json', 'paint.json'])
  (existsSync(resolve(out, f)) ? ok : bad)(`baked ${f}`);
const tilesDir = resolve(out, 'tiles');
const tileCount = existsSync(tilesDir)
  ? readdirSync(tilesDir).filter((f) => f.endsWith('.json')).length : 0;
tileCount ? ok(`${tileCount} baked tiles`) : bad('tiles/ missing or empty — run npm run bake');

// 4. Manifest contents
try {
  const m = JSON.parse(readFileSync(resolve(out, 'manifest.json'), 'utf8'));
  m.bakeId ? ok(`bakeId ${m.bakeId}`) : bad('manifest.bakeId missing — IDB cache key broken');
  m.meta?.name && m.meta?.tz ? ok('meta.name + meta.tz') : bad('manifest.meta missing name/tz');
  if (!m.meta?.style) warn('meta.style absent — style derived from origin (fine); pin it to override');
  if (m.meta?.id !== region) warn(`meta.id '${m.meta?.id}' ≠ region '${region}'`);
  Array.isArray(m.tiles) && m.tiles.length ? ok(`manifest lists ${m.tiles.length} tiles`)
    : bad('manifest.tiles empty');
} catch { bad('manifest.json unparseable'); }

// 5. regions.json listing — listed iff not hidden
try {
  const list = JSON.parse(readFileSync(resolve(ROOT, 'public/data/regions.json'), 'utf8'));
  const listed = list.some((r) => r.id === region);
  if (CFG.hidden) (listed ? bad : ok)('hidden region is not listed in regions.json');
  else (listed ? ok : bad)('listed in regions.json');
} catch { bad('regions.json unparseable'); }

// 6. Optional runtime gates
if (shots) {
  console.log(`==> montage: ${shots}`);
  const r = spawnSync('node', ['tools/capture.mjs', `--shots=${shots}`, `--region=${region}`, '--montage=only'], { cwd: ROOT, stdio: 'inherit' });
  r.status === 0 ? ok(`shots written — read shots/${region}-montage.jpg`)
    : bad(`capture exited ${r.status}`);
}
if (soakSecs) {
  console.log(`==> soak ${soakSecs}s`);
  const r = spawnSync('node', ['tools/soak.mjs', `--region=${region}`, `--seconds=${soakSecs}`], { cwd: ROOT, stdio: 'inherit' });
  r.status === 0 ? ok('soak clean') : bad(`soak exited ${r.status}`);
}

console.log(failures ? `\n${failures} check(s) failed — region is not live.` : `\n${region}: all checks pass — region is live.`);
process.exit(failures ? 1 : 0);
