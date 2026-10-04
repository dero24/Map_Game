#!/usr/bin/env node
// Our own OpenStreetMap extract for the tile service (docs/DATA_SOURCES.md §0; Robby, 2026-10-03:
// "our own extract in R2", Overpass only a polite fallback). Geofabrik's file (ODbL) → the cell
// query's elements (src/world/osmQuery.ts: the same statements the Overpass query is made of) with
// their full geometry → cut on the fixed global grid of src/world/osmTiles.ts (1/128° tiles) → one
// packed file per 1° block: the tiles' gzipped lines back to back, and a directory. The tile service
// (worker/src/osm.js) reads a cell's tiles by range and answers as Overpass would.
//
//   node scripts/osm-extract.mjs --pbf=D:/map_game_osm/us-latest.osm.pbf --ts=2026-10-02T20:21:34Z
//     [--pbf=… (more files: deduplicated by element)] [--work=D:/map_game_osm] [--out=D:/map_game_osm/out/v1]
//     [--blocks=-74_40,-75_40] (only these blocks' lines, for a quick look) [--keep] (reuse the DuckDB tables)
//
// Big outputs go to --work/--out (default D:/map_game_osm, outside the repo: tens of GB for the
// lower 48). The pack format and the reader are tests/osmTiles.test.ts; the comparison with saved
// Overpass answers is tests/osmExtract.test.ts.
import { DuckDBInstance } from '@duckdb/node-api';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { gzipSync } from 'node:zlib';
import { sqlWhere, queryKeys } from '../src/world/osmQuery.ts';
import { TILE_PER_DEG as T, BLOCK_TILES, BIG } from '../src/world/osmTiles.ts';

const argv = process.argv.slice(2);
const arg = (k, d) => { const a = argv.filter((x) => x.startsWith(`--${k}=`)).map((x) => x.slice(k.length + 3)); return a.length ? a : d; };
const PBFS = arg('pbf', []);
const WORK = arg('work', ['D:/map_game_osm'])[0];
const OUT = arg('out', [`${WORK}/out/v1`])[0];
const TS = arg('ts', [''])[0];
const ONLY = arg('blocks', [''])[0] ? new Set(arg('blocks')[0].split(',')) : null;
const KEEP = argv.includes('--keep');
// the skylines' thresholds: the lowest any skyline asks for (skyline.ts TALL/FLOORS, farSkyline.ts MAST)
const TALL = { h: 45, floors: 14, mast: 150 };
if (!PBFS.length && !KEEP) { console.error('--pbf=<file.osm.pbf> is required'); process.exit(1); }
if (!TS) console.warn('no --ts=<replication timestamp>: the answers will carry none');
mkdirSync(`${WORK}/tmp`, { recursive: true });
mkdirSync(OUT, { recursive: true });
const t0 = Date.now();
const log = (...a) => console.log(`[${((Date.now() - t0) / 1000).toFixed(0).padStart(5)}s]`, ...a);

const db = await DuckDBInstance.create(`${WORK}/extract.duckdb`);
const con = await db.connect();
await con.run(`INSTALL spatial; LOAD spatial; SET temp_directory='${WORK}/tmp'; SET memory_limit='20GB'; SET threads=10; SET preserve_insertion_order=false;`);
const run = async (label, sql) => { const t = Date.now(); await con.run(sql); log(label, `${((Date.now() - t) / 1000).toFixed(1)} s`); };
const one = async (sql) => (await con.runAndReadAll(sql)).getRowObjectsJson()[0];

if (!KEEP) {
  // 1. the file(s), every element once (neighbouring extracts share the elements across their line)
  const src = PBFS.map((p) => `SELECT kind::VARCHAR kind, id, tags, refs, lat, lon, ref_roles, ref_types FROM ST_ReadOSM('${p}')`).join(' UNION ALL ');
  await run('read', `CREATE OR REPLACE TABLE raw AS ${PBFS.length > 1 ? `SELECT DISTINCT ON (kind, id) * FROM (${src})` : src}`);
  // 2. the query's elements (the same statements as the Overpass query; a key prefilter first)
  const pre = (t) => queryKeys(t).map((k) => `map_contains(tags, '${k}')`).join(' OR ');
  await run('select nodes', `CREATE OR REPLACE TABLE sel_n AS SELECT id, tags, round(lat, 7) lat, round(lon, 7) lon FROM raw WHERE kind = 'node' AND cardinality(tags) > 0 AND (${pre('node')}) AND ${sqlWhere('node')}`);
  await run('select ways', `CREATE OR REPLACE TABLE sel_w AS SELECT id, tags FROM raw WHERE kind = 'way' AND (${pre('way')}) AND ${sqlWhere('way')}`);
  await run('select relations', `CREATE OR REPLACE TABLE sel_r AS SELECT id, tags, refs, ref_types, ref_roles FROM raw WHERE kind = 'relation' AND (${pre('relation')}) AND ${sqlWhere('relation')}`);
  await run('members', `CREATE OR REPLACE TABLE mem AS SELECT id AS rid, unnest(refs) AS ref, unnest(ref_types)::VARCHAR AS mtype, unnest(ref_roles) AS role, generate_subscripts(refs, 1) AS mi FROM sel_r`);
  // 3. the geometry of every way the answer prints: the selected ones and the relations' member ways
  // (and the skylines' towers and masts, which the cell query doesn't ask for: see TALL below)
  await run('ways needed', `CREATE OR REPLACE TABLE need_w AS SELECT id, refs FROM raw WHERE kind = 'way' AND (id IN (SELECT id FROM sel_w UNION SELECT ref FROM mem WHERE mtype = 'way')
    OR (map_contains(tags, 'man_made') AND regexp_matches(tags['man_made'], '^(tower|mast)$')))`);
  await run('their nodes', `CREATE OR REPLACE TABLE wn AS SELECT id AS wid, unnest(refs) AS nid, generate_subscripts(refs, 1) AS i FROM need_w`);
  await run('node places', `CREATE OR REPLACE TABLE np AS SELECT id, round(lat, 7) lat, round(lon, 7) lon FROM raw WHERE kind = 'node' AND id IN (SELECT nid FROM wn UNION SELECT ref FROM mem WHERE mtype = 'node')`);
  // (in steps: one aggregate with the lines in it ran over ten minutes on New Jersey; split, seconds)
  await run('way points', `CREATE OR REPLACE TABLE wj AS SELECT wn.wid, wn.i, np.lat, np.lon FROM wn JOIN np ON np.id = wn.nid`);
  await run('geometry', `CREATE OR REPLACE TABLE wg AS SELECT wid id, list(struct_pack(lat := lat, lon := lon) ORDER BY i) geom,
      min(lat) s, min(lon) w, max(lat) n, max(lon) e, count(*) cnt FROM wj GROUP BY wid`);
  await run('lines', `CREATE OR REPLACE TABLE wl AS SELECT id, CASE WHEN cnt > 1 THEN ST_MakeLine(list_transform(geom, p -> ST_Point(p.lon, p.lat))) ELSE ST_Point(w, s) END line FROM wg`);
  // 4. the tiles each way crosses (its line, edges included — a box can only select it through them)
  await run('way tiles', `CREATE OR REPLACE TABLE wt AS
    WITH c AS (SELECT wg.id, wl.line, floor((w + 180) * ${T})::INT tx0, floor((e + 180) * ${T})::INT tx1, floor((s + 90) * ${T})::INT ty0, floor((n + 90) * ${T})::INT ty1 FROM wg JOIN wl ON wl.id = wg.id),
      u AS (SELECT *, unnest(range(tx0, tx1 + 1)) tx FROM c),
      v AS (SELECT *, unnest(range(ty0, ty1 + 1)) ty FROM u)
    SELECT id, tx, ty FROM v
    WHERE (tx0 = tx1 AND ty0 = ty1) OR ST_Intersects(line, ST_MakeEnvelope(tx / ${T}.0 - 180, ty / ${T}.0 - 90, (tx + 1) / ${T}.0 - 180, (ty + 1) / ${T}.0 - 90))`);
  // 5. the lines: each element printed as Overpass prints it, in every tile it touches
  await run('node lines', `CREATE OR REPLACE TABLE lines_n AS SELECT floor((lon + 180) * ${T})::INT tx, floor((lat + 90) * ${T})::INT ty, 'n' k, id, lat s, lon w, lat n, lon e,
      to_json(struct_pack(type := 'node', id := id, lat := lat, lon := lon, tags := tags))::VARCHAR payload FROM sel_n`);
  await run('way lines', `CREATE OR REPLACE TABLE lines_w AS SELECT wt.tx, wt.ty, 'w' k, wg.id, wg.s, wg.w, wg.n, wg.e,
      to_json(struct_pack(type := 'way', id := wg.id, geometry := wg.geom, tags := sel_w.tags))::VARCHAR payload
    FROM sel_w JOIN wg ON wg.id = sel_w.id JOIN wt ON wt.id = sel_w.id`);
  // (one join per member type: a LEFT JOIN whose ON tests the left side's type ran as a nested loop)
  await run('relation members', `CREATE OR REPLACE TABLE mj AS
    SELECT mem.rid, mem.mi, mem.mtype, mem.ref,
      '{"type":"way","ref":' || mem.ref || ',"role":' || to_json(mem.role) || CASE WHEN wg.id IS NULL THEN '' ELSE ',"geometry":' || to_json(wg.geom) END || '}' j,
      wg.s, wg.w, wg.n, wg.e
    FROM mem LEFT JOIN wg ON wg.id = mem.ref WHERE mem.mtype = 'way'
    UNION ALL
    SELECT mem.rid, mem.mi, mem.mtype, mem.ref,
      '{"type":"node","ref":' || mem.ref || ',"role":' || to_json(mem.role) || CASE WHEN np.id IS NULL THEN '' ELSE ',"lat":' || to_json(np.lat) || ',"lon":' || to_json(np.lon) END || '}' j,
      np.lat, np.lon, np.lat, np.lon
    FROM mem LEFT JOIN np ON np.id = mem.ref WHERE mem.mtype = 'node'
    UNION ALL
    SELECT mem.rid, mem.mi, mem.mtype, mem.ref, '{"type":"relation","ref":' || mem.ref || ',"role":' || to_json(mem.role) || '}' j, NULL, NULL, NULL, NULL
    FROM mem WHERE mem.mtype NOT IN ('way', 'node')`);
  await run('relations', `CREATE OR REPLACE TABLE rj AS SELECT sel_r.id, min(mj.s) s, min(mj.w) w, max(mj.n) n, max(mj.e) e,
      '{"type":"relation","id":' || sel_r.id || ',"members":[' || string_agg(mj.j, ',' ORDER BY mj.mi) || '],"tags":' || to_json(any_value(sel_r.tags)) || '}' payload
    FROM sel_r JOIN mj ON mj.rid = sel_r.id GROUP BY sel_r.id`);
  await run('relation tiles', `CREATE OR REPLACE TABLE rt AS SELECT DISTINCT m.rid id, wt.tx, wt.ty FROM (SELECT rid, ref FROM mj WHERE mtype = 'way') m JOIN wt ON wt.id = m.ref
    UNION SELECT DISTINCT m.rid, floor((np.lon + 180) * ${T})::INT, floor((np.lat + 90) * ${T})::INT FROM (SELECT rid, ref FROM mj WHERE mtype = 'node') m JOIN np ON np.id = m.ref`);
  // (a big relation is printed once, in the block of its first tile; its tiles point there)
  await run('relation lines', `CREATE OR REPLACE TABLE lines_r AS
    WITH home AS (SELECT id, min(tx) htx, min_by(ty, tx) hty FROM rt GROUP BY id)
    SELECT rt.tx, rt.ty, CASE WHEN length(rj.payload) > ${BIG} THEN 'R' ELSE 'r' END k, rj.id, rj.s, rj.w, rj.n, rj.e,
      CASE WHEN length(rj.payload) > ${BIG} THEN (floor(home.htx / ${BLOCK_TILES})::INT || '_' || floor(home.hty / ${BLOCK_TILES})::INT) ELSE rj.payload END payload
    FROM rj JOIN rt ON rt.id = rj.id JOIN home ON home.id = rj.id`);
  // 5b. the skylines' layer (src/world/skyline.ts, farSkyline.ts; worker /skyline): every block's tall
  // buildings (≥ ${TALL.h} m or ${TALL.floors} storeys), tall building parts, and towers and masts
  // ≥ ${TALL.mast} m — nodes, ways and building relations, printed as in the tiles, in every block they touch
  const H = (k) => `TRY_CAST(tags['${k}'] AS DOUBLE)`;
  await run('tall', `CREATE OR REPLACE TABLE tall AS
    WITH tw AS (SELECT id, tags FROM raw WHERE kind = 'way' AND (
        (map_contains(tags, 'building') AND (${H('height')} >= ${TALL.h} OR ${H('building:levels')} >= ${TALL.floors}))
        OR (map_contains(tags, 'building:part') AND ${H('height')} >= ${TALL.h})
        OR (map_contains(tags, 'man_made') AND regexp_matches(tags['man_made'], '^(tower|mast)$') AND ${H('height')} >= ${TALL.mast}))),
      tn AS (SELECT id, tags, round(lat, 7) lat, round(lon, 7) lon FROM raw WHERE kind = 'node' AND map_contains(tags, 'man_made') AND regexp_matches(tags['man_made'], '^(tower|mast)$') AND ${H('height')} >= ${TALL.mast}),
      tr AS (SELECT id FROM sel_r WHERE map_contains(tags, 'building') AND ${H('height')} >= ${TALL.h}),
      all_ AS (
        SELECT floor(wt.tx / ${BLOCK_TILES})::INT bx, floor(wt.ty / ${BLOCK_TILES})::INT bym, 'w' k, wg.id, wg.s, wg.w, wg.n, wg.e,
          to_json(struct_pack(type := 'way', id := wg.id, geometry := wg.geom, tags := tw.tags))::VARCHAR payload
        FROM tw JOIN wg ON wg.id = tw.id JOIN wt ON wt.id = tw.id
        UNION ALL
        SELECT floor(floor((lon + 180) * ${T}) / ${BLOCK_TILES})::INT, floor(floor((lat + 90) * ${T}) / ${BLOCK_TILES})::INT, 'n', id, lat, lon, lat, lon,
          to_json(struct_pack(type := 'node', id := id, lat := lat, lon := lon, tags := tags))::VARCHAR FROM tn
        UNION ALL
        SELECT floor(rt.tx / ${BLOCK_TILES})::INT, floor(rt.ty / ${BLOCK_TILES})::INT, 'r', rj.id, rj.s, rj.w, rj.n, rj.e, rj.payload
        FROM tr JOIN rj ON rj.id = tr.id JOIN rt ON rt.id = tr.id)
    SELECT bx, bym, k, id, any_value(s) s, any_value(w) w, any_value(n) n, any_value(e) e, any_value(payload) payload FROM all_ GROUP BY bx, bym, k, id`);
  await run('big relations', `CREATE OR REPLACE TABLE bigs AS
    WITH home AS (SELECT id, min(tx) htx, min_by(ty, tx) hty FROM rt GROUP BY id)
    SELECT floor(home.htx / ${BLOCK_TILES})::INT AS bx, floor(home.hty / ${BLOCK_TILES})::INT AS bym, rj.id, rj.payload FROM rj JOIN home ON home.id = rj.id WHERE length(rj.payload) > ${BIG}`);
}
const counts = await one(`SELECT (SELECT count(*) FROM sel_n) n, (SELECT count(*) FROM sel_w) w, (SELECT count(*) FROM sel_r) r, (SELECT count(*) FROM bigs) big,
  (SELECT count(*) FROM lines_n) ln, (SELECT count(*) FROM lines_w) lw, (SELECT count(*) FROM lines_r) lr, (SELECT count(*) FROM tall) tall`);
log('elements', counts);

// 6. pack: per block, its tiles in key order — each tile's lines gzipped, back to back — then its big relations
const PART_MAX = 200e6;
const blocks = (await con.runAndReadAll(`SELECT DISTINCT floor(tx / ${BLOCK_TILES})::INT AS bx, floor(ty / ${BLOCK_TILES})::INT AS bym FROM (SELECT tx, ty FROM lines_n UNION SELECT tx, ty FROM lines_w UNION SELECT tx, ty FROM lines_r) UNION SELECT bx, bym FROM tall ORDER BY 1, 2`)).getRowObjectsJson();
log(blocks.length, 'blocks');
const index = existsSync(`${OUT}/index.json`) ? JSON.parse(readFileSync(`${OUT}/index.json`, 'utf8')) : { v: 1, blocks: {} };
index.v = 1; index.ts = TS; index.tile = T; index.block = BLOCK_TILES; index.made = new Date().toISOString(); index.sources = PBFS.map((p) => p.split(/[\\/]/).pop());
let total = 0;
for (const { bx, bym: by } of blocks) {
  const key = `${bx}_${by}`;
  if (ONLY && !ONLY.has(key)) continue;
  const sel = (t) => `SELECT tx, ty, k, id, s, w, n, e, payload FROM ${t} WHERE floor(tx / ${BLOCK_TILES})::INT = ${bx} AND floor(ty / ${BLOCK_TILES})::INT = ${by}`;
  const res = await con.stream(`${sel('lines_n')} UNION ALL ${sel('lines_w')} UNION ALL ${sel('lines_r')} ORDER BY tx, ty, k, id`);
  // (a block past PART_MAX goes on in another part: wrangler uploads at most ~300 MB an object)
  const parts = [[]], dir = {}, big = {};
  let off = 0, cur = null, buf = [], nLines = 0;
  const add = (gz) => {
    if (off + gz.length > PART_MAX && parts.at(-1).length) { parts.push([]); off = 0; }
    const at = [off, gz.length, parts.length - 1];
    parts.at(-1).push(gz);
    off += gz.length;
    return at;
  };
  const flush = () => {
    if (!cur) return;
    dir[cur] = add(gzipSync(Buffer.from(buf.join('\n') + '\n'), { level: 6 }));
    buf = [];
  };
  for (;;) {
    const chunk = await res.fetchChunk();
    if (!chunk || !chunk.rowCount) break;
    for (const [tx, ty, k, id, s, w, n, e, payload] of chunk.getRows()) {
      const tk = `${tx}_${ty}`;
      if (tk !== cur) { flush(); cur = tk; }
      buf.push(`${k}\t${id}\t${s}\t${w}\t${n}\t${e}\t${payload}`);
      nLines++;
    }
  }
  flush();
  // the block's tall things, one gzipped text (the skylines read a block's at once)
  const tallLines = (await con.runAndReadAll(`SELECT k, id, s, w, n, e, payload FROM tall WHERE bx = ${bx} AND bym = ${by} ORDER BY k, id`)).getRows().map(([k, id, s, w, n, e, payload]) => `${k}\t${id}\t${s}\t${w}\t${n}\t${e}\t${payload}`);
  const tall = tallLines.length ? add(gzipSync(Buffer.from(tallLines.join('\n') + '\n'), { level: 6 })) : null;
  for (const { id, payload } of (await con.runAndReadAll(`SELECT id, payload FROM bigs WHERE bx = ${bx} AND bym = ${by} ORDER BY id`)).getRowObjectsJson()) {
    big[id] = add(gzipSync(Buffer.from(payload), { level: 6 }));
  }
  const bins = parts.map((p) => Buffer.concat(p));
  const h = createHash('sha256');
  for (const b of bins) h.update(b);
  const hash = h.digest('hex').slice(0, 16);
  bins.forEach((b, i) => writeFileSync(`${OUT}/${key}.${i}.bin`, b));
  writeFileSync(`${OUT}/${key}.json`, JSON.stringify({ v: 1, ts: TS, tiles: dir, big, ...(tall ? { tall } : {}) }));
  const bytes = bins.reduce((a, b) => a + b.length, 0);
  index.blocks[key] = { hash, parts: bins.length, bytes, tiles: Object.keys(dir).length, lines: nLines, big: Object.keys(big).length, tall: tallLines.length };
  total += bytes;
  log(`block ${key}: ${Object.keys(dir).length} tiles, ${nLines} lines, ${Object.keys(big).length} big, ${(bytes / 1e6).toFixed(1)} MB in ${bins.length} part${bins.length > 1 ? 's' : ''}`);
}
writeFileSync(`${OUT}/index.json`, JSON.stringify(index, null, 1));
log(`packed ${(total / 1e6).toFixed(1)} MB → ${OUT}`);
