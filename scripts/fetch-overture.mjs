// One-time Overture Maps buildings pull (CDLA-Permissive 2.0) via DuckDB bbox query on the public GeoParquet.
// Only the last ~2 monthly releases stay public, so the result is archived in raw/overture-buildings.json.
import { existsSync, writeFileSync, mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { DuckDBInstance } from '@duckdb/node-api';
import { RAW, BACKDROP } from './config.mjs';

const RELEASE = process.env.OVERTURE_RELEASE ?? '2026-08-19.0';
const out = resolve(RAW, 'overture-buildings.json');
if (existsSync(out) && !process.argv.includes('--force')) {
  console.log('overture-buildings.json exists — use --force to refetch');
  process.exit(0);
}
mkdirSync(RAW, { recursive: true });

const db = await DuckDBInstance.create(':memory:');
const con = await db.connect();
await con.run(`INSTALL spatial; LOAD spatial; INSTALL httpfs; LOAD httpfs; SET s3_region='us-west-2';`);
const b = BACKDROP;
const t0 = Date.now();
const reader = await con.runAndReadAll(`
  SELECT id, height, num_floors, roof_shape, roof_color, facade_color, facade_material, class, subtype,
         names.primary AS name, sources[1].dataset AS src, ST_AsText(geometry) AS wkt
  FROM read_parquet('s3://overturemaps-us-west-2/release/${RELEASE}/theme=buildings/type=building/*', hive_partitioning=1)
  WHERE bbox.xmin < ${b.e} AND bbox.xmax > ${b.w} AND bbox.ymin < ${b.n} AND bbox.ymax > ${b.s}`);
const rows = reader.getRowObjectsJson();
writeFileSync(out, JSON.stringify({ release: RELEASE, rows }));
const src = {};
let h = 0, f = 0;
for (const r of rows) {
  src[r.src] = (src[r.src] ?? 0) + 1;
  if (r.height != null) h++;
  if (r.num_floors != null) f++;
}
console.log(`${rows.length} buildings in ${((Date.now() - t0) / 1000).toFixed(0)}s; with height ${h}, floors ${f}`, src);
