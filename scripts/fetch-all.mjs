// Fetch every raw input for the selected region: `npm run fetch -- --region=monmouthbeach`.
import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';
import { ROOT, REGION } from './config.mjs';

for (const s of ['fetch-osm', 'fetch-terrain', 'fetch-worldcover', 'fetch-overture', 'fetch-imagery']) {
  const r = spawnSync(process.execPath, [resolve(ROOT, 'scripts', `${s}.mjs`), ...process.argv.slice(2)], { stdio: 'inherit' });
  if (r.status !== 0) process.exit(r.status ?? 1);
}
console.log(`[${REGION}] all fetches done`);
