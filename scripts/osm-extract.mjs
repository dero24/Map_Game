#!/usr/bin/env node
// Our own OpenStreetMap extract for the tile service (docs/DATA_SOURCES.md §0; Robby, 2026-10-03:
// "our own extract in R2", Overpass only a polite fallback). Geofabrik's file (ODbL) → the cell
// query's elements (src/world/osmQuery.ts: the same statements the Overpass query is made of) with
// their full geometry → cut on the fixed global grid of src/world/osmTiles.ts (1/128° tiles) → one
// packed file per 1° block: the tiles' gzipped lines back to back, the block's tall things (the
// skylines' layer), its big relations, and a directory. The tile service (worker/src/osm.js) reads a
// cell's tiles by range and answers as Overpass would.
//
//   node scripts/osm-extract.mjs --pbf=D:/map_game_osm/us-latest.osm.pbf --ts=2026-10-02T20:21:34Z
//     [--work=D:/map_game_osm/us] (the DuckDB file: ~100 GB at its peak for the lower 48)
//     [--tmp=X:/map_game_tmp] (DuckDB's spill: the pack's sort, ~100 GB) [--out=D:/map_game_osm/out/v1]
//     [--blocks=106_130,105_130] (pack only these blocks) [--keep] (reuse the tables of a run that got
//     as far as packing) [--mem=16GB] [--threads=10]
//
// Lean on disk: the file is read once per kind of element instead of kept whole, each step's table
// dropped as soon as the next has used it, and each way printed while it's packed rather than stored
// (New Jersey's first version kept everything: 5.5 GB, ~400 GB for the US). The pack format and its
// reader are tests/osmTiles.test.ts; the comparison with Overpass is tests/osmExtract.test.ts.
import { DuckDBInstance } from '@duckdb/node-api';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import { gzip } from 'node:zlib';
import { promisify } from 'node:util';
import { sqlWhere, queryKeys } from '../src/world/osmQuery.ts';
import { TILE_PER_DEG as T, BLOCK_TILES as BT, BIG } from '../src/world/osmTiles.ts';

const argv = process.argv.slice(2);
const arg = (k, d) => { const a = argv.filter((x) => x.startsWith(`--${k}=`)).map((x) => x.slice(k.length + 3)); return a.length ? a : d; };
const PBF = arg('pbf', [''])[0];
const WORK = arg('work', ['D:/map_game_osm/us'])[0];
const TMP = arg('tmp', [`${WORK}/tmp`])[0];
const OUT = arg('out', ['D:/map_game_osm/out/v1'])[0];
const TS = arg('ts', [''])[0];
const ONLY = arg('blocks', [''])[0] ? new Set(arg('blocks')[0].split(',')) : null;
const KEEP = argv.includes('--keep');
const MEM = arg('mem', ['16GB'])[0], THREADS = arg('threads', ['10'])[0], SLICE_PTS = Number(arg('slice-points', ['10000000'])[0]);
// the skylines' thresholds: the lowest any skyline asks for (skyline.ts TALL/FLOORS, farSkyline.ts MAST)
const TALL = { h: 45, floors: 14, mast: 150 };
const PART_MAX = 200e6; // a block past this goes on in another part (wrangler uploads ≤ ~300 MB an object)
if (!PBF && !KEEP) { console.error('--pbf=<file.osm.pbf> is required'); process.exit(1); }
if (!TS) console.warn('no --ts=<replication timestamp>: the answers will carry none');
for (const d of [WORK, TMP, OUT]) mkdirSync(d, { recursive: true });
const t0 = Date.now();
const log = (...a) => console.log(`[${((Date.now() - t0) / 1000).toFixed(0).padStart(5)}s]`, ...a);

const db = await DuckDBInstance.create(`${WORK}/extract.duckdb`);
const con = await db.connect();
await con.run(`INSTALL spatial; LOAD spatial; SET temp_directory='${TMP}'; SET memory_limit='${MEM}'; SET threads=${THREADS}; SET preserve_insertion_order=false;`);
const run = async (label, sql) => { const t = Date.now(); await con.run(sql); log(label, `${((Date.now() - t) / 1000).toFixed(1)} s`); };
// (a step whose table — or a later table made from it — is already there is kept: a run that died
// part-way, out of memory or disk, picks up where it stopped. A new file: a fresh --work directory.)
const has = async (...ts) => +(await (await con.runAndReadAll(`SELECT count(*) n FROM duckdb_tables() WHERE table_name IN (${ts.map((t) => `'${t}'`).join(',')})`)).getRowObjectsJson()[0].n) > 0;
const step = async (label, keepIf, sql) => { if (await has(...keepIf)) log(label, '(kept from the last run)'); else await run(label, sql); };
const drop = (...ts) => con.run(ts.map((t) => `DROP TABLE IF EXISTS ${t};`).join(' ') + ' CHECKPOINT;');
const one = async (sql) => (await con.runAndReadAll(sql)).getRowObjectsJson()[0];
const osm = (kind, cols) => `(SELECT ${cols} FROM ST_ReadOSM('${PBF}') WHERE kind = '${kind}')`;
const pre = (t) => queryKeys(t).map((k) => `map_contains(tags, '${k}')`).join(' OR ');
const H = (k) => `TRY_CAST(tags['${k}'] AS DOUBLE)`;
const isTower = `(map_contains(tags, 'man_made') AND regexp_matches(tags['man_made'], '^(tower|mast)$'))`;

if (!KEEP) {
  // 1. relations: the query's, and their members
  await step('relations', ['sel_r'], `CREATE OR REPLACE TABLE sel_r AS SELECT id, tags, refs, ref_types, ref_roles FROM ${osm('relation', '*')} WHERE (${pre('relation')}) AND ${sqlWhere('relation')}`);
  await step('members', ['mem', 'tall'], `CREATE OR REPLACE TABLE mem AS SELECT id AS rid, unnest(refs) AS ref, unnest(ref_types)::VARCHAR AS mtype, unnest(ref_roles) AS role, generate_subscripts(refs, 1) AS mi FROM sel_r`);
  // 2. ways: the query's (sel), the relations' members, and the skylines' towers and masts
  await step('ways', ['ways', 'swg'], `CREATE OR REPLACE TABLE ways AS SELECT id, tags, refs, ((${pre('way')}) AND ${sqlWhere('way')}) AS sel FROM ${osm('way', 'id, tags, refs')}
    WHERE ((${pre('way')}) AND ${sqlWhere('way')}) OR id IN (SELECT ref FROM mem WHERE mtype = 'way') OR ${isTower}`);
  await step('way nodes', ['wn', 'wj', 'wg'], `CREATE OR REPLACE TABLE wn AS SELECT id AS wid, unnest(refs) AS nid, generate_subscripts(refs, 1) AS i FROM ways`);
  // 3. the ways' points: one pass over the nodes (a hash join the size of the US: DuckDB spills it)
  await step('way points', ['wj', 'wg'], `CREATE OR REPLACE TABLE wj AS SELECT wn.wid, wn.i, round(n.lat, 7) lat, round(n.lon, 7) lon FROM wn JOIN ${osm('node', 'id, lat, lon')} n ON n.id = wn.nid`);
  await drop('wn');
  // (each way's points gathered unordered — a parallel hash aggregate — then sorted by their index:
  // a list of structs sorts by its first field. One ordered list aggregate over the US's 1.5 B points
  // ran out of memory, and sliced it ran on one core; this is the same list, at full speed)
  // (slices of ~10 M points — New Jersey's whole size, which never spilled: an eighth of the US's
  // 1.5 B points spilled 85 GB in four minutes; each slice re-reads the points, seconds from an SSD)
  if (!(await has('wg'))) {
    await drop('wg_tmp');
    const pts = +(await one('SELECT count(*) n FROM wj')).n;
    const SLICES = Math.max(1, Math.ceil(pts / (SLICE_PTS || 10e6)));
    log(`geometry: ${pts.toLocaleString()} points in ${SLICES} slices`);
    for (let k = 0; k < SLICES; k++)
      await run(`geometry ${k + 1}/${SLICES}`, `${k ? 'INSERT INTO wg_tmp' : 'CREATE TABLE wg_tmp AS'} SELECT id, list_transform(list_sort(pts), p -> struct_pack(lat := p.lat, lon := p.lon)) geom, s, w, n, e, cnt
        FROM (SELECT wid id, list(struct_pack(i := i, lat := lat, lon := lon)) pts, min(lat) s, min(lon) w, max(lat) n, max(lon) e, count(*) cnt FROM wj WHERE wid % ${SLICES} = ${k} GROUP BY wid)`);
    await con.run('ALTER TABLE wg_tmp RENAME TO wg; CHECKPOINT;');
  } else log('geometry', '(kept from the last run)');
  await drop('wj');
  // 4. the tiles each way crosses (its line, edges included — a box can only select it through them)
  await step('way tiles', ['wt', 'swt'], `CREATE OR REPLACE TABLE wt AS
    WITH c AS (SELECT id, CASE WHEN cnt > 1 THEN ST_MakeLine(list_transform(geom, p -> ST_Point(p.lon, p.lat))) ELSE ST_Point(w, s) END line,
        floor((w + 180) * ${T})::INT tx0, floor((e + 180) * ${T})::INT tx1, floor((s + 90) * ${T})::INT ty0, floor((n + 90) * ${T})::INT ty1 FROM wg),
      u AS (SELECT *, unnest(range(tx0, tx1 + 1)) tx FROM c),
      v AS (SELECT *, unnest(range(ty0, ty1 + 1)) ty FROM u)
    SELECT id, tx, ty FROM v
    WHERE (tx0 = tx1 AND ty0 = ty1) OR ST_Intersects(line, ST_MakeEnvelope(tx / ${T}.0 - 180, ty / ${T}.0 - 90, (tx + 1) / ${T}.0 - 180, (ty + 1) / ${T}.0 - 90))`);
  // 5. nodes: the query's, the relations' member nodes, the skylines' towers and masts
  await step('nodes', ['sel_n'], `CREATE OR REPLACE TABLE sel_n AS SELECT id, tags, round(lat, 7) lat, round(lon, 7) lon,
      ((${pre('node')}) AND ${sqlWhere('node')}) AS sel, (${isTower} AND ${H('height')} >= ${TALL.mast}) AS tallnode
    FROM ${osm('node', 'id, tags, lat, lon')} WHERE (cardinality(tags) > 0 AND (((${pre('node')}) AND ${sqlWhere('node')}) OR (${isTower} AND ${H('height')} >= ${TALL.mast})))
      OR id IN (SELECT ref FROM mem WHERE mtype = 'node')`);
  // 6. relations printed with their members' geometry (one join per member type: a LEFT JOIN whose
  //    ON tests the left side's type ran as a nested loop)
  await step('relation members', ['mj', 'tall'], `CREATE OR REPLACE TABLE mj AS
    SELECT mem.rid, mem.mi, mem.mtype, mem.ref,
      '{"type":"way","ref":' || mem.ref || ',"role":' || to_json(mem.role) || CASE WHEN wg.id IS NULL THEN '' ELSE ',"geometry":' || to_json(wg.geom) END || '}' j,
      wg.s, wg.w, wg.n, wg.e
    FROM mem LEFT JOIN wg ON wg.id = mem.ref WHERE mem.mtype = 'way'
    UNION ALL
    SELECT mem.rid, mem.mi, mem.mtype, mem.ref,
      '{"type":"node","ref":' || mem.ref || ',"role":' || to_json(mem.role) || CASE WHEN np.id IS NULL THEN '' ELSE ',"lat":' || to_json(np.lat) || ',"lon":' || to_json(np.lon) END || '}' j,
      np.lat, np.lon, np.lat, np.lon
    FROM mem LEFT JOIN sel_n np ON np.id = mem.ref WHERE mem.mtype = 'node'
    UNION ALL
    SELECT mem.rid, mem.mi, mem.mtype, mem.ref, '{"type":"relation","ref":' || mem.ref || ',"role":' || to_json(mem.role) || '}' j, NULL, NULL, NULL, NULL
    FROM mem WHERE mem.mtype NOT IN ('way', 'node')`);
  await step('relation json', ['rj', 'tall'], `CREATE OR REPLACE TABLE rj AS SELECT sel_r.id, min(mj.s) s, min(mj.w) w, max(mj.n) n, max(mj.e) e,
      '{"type":"relation","id":' || sel_r.id || ',"members":[' || string_agg(mj.j, ',' ORDER BY mj.mi) || '],"tags":' || to_json(any_value(sel_r.tags)) || '}' payload
    FROM sel_r JOIN mj ON mj.rid = sel_r.id GROUP BY sel_r.id`);
  await step('relation tiles', ['rt', 'tall'], `CREATE OR REPLACE TABLE rt AS SELECT DISTINCT m.rid id, wt.tx, wt.ty FROM (SELECT rid, ref FROM mj WHERE mtype = 'way') m JOIN wt ON wt.id = m.ref
    UNION SELECT DISTINCT m.rid, floor((np.lon + 180) * ${T})::INT, floor((np.lat + 90) * ${T})::INT FROM (SELECT rid, ref FROM mj WHERE mtype = 'node') m JOIN sel_n np ON np.id = m.ref`);
  // (a big relation is printed once, in the block of its first tile; its tiles point there)
  await step('relation lines', ['lines_r'], `CREATE OR REPLACE TABLE lines_r AS
    WITH home AS (SELECT id, min(tx) htx, arg_min(ty, tx::BIGINT * 1000000 + ty) hty FROM rt GROUP BY id) -- (the westmost, then southmost tile: min_by(ty, tx) chose among a column's tiles at random)
    SELECT rt.tx, rt.ty, CASE WHEN length(rj.payload) > ${BIG} THEN 'R' ELSE 'r' END k, rj.id, rj.s, rj.w, rj.n, rj.e,
      CASE WHEN length(rj.payload) > ${BIG} THEN (floor(home.htx / ${BT})::INT || '_' || floor(home.hty / ${BT})::INT) ELSE rj.payload END payload
    FROM rj JOIN rt ON rt.id = rj.id JOIN home ON home.id = rj.id`);
  await step('big relations', ['bigs'], `CREATE OR REPLACE TABLE bigs AS
    WITH home AS (SELECT id, min(tx) htx, arg_min(ty, tx::BIGINT * 1000000 + ty) hty FROM rt GROUP BY id) -- (the westmost, then southmost tile: min_by(ty, tx) chose among a column's tiles at random)
    SELECT floor(home.htx / ${BT})::INT AS bx, floor(home.hty / ${BT})::INT AS bym, rj.id, rj.payload FROM rj JOIN home ON home.id = rj.id WHERE length(rj.payload) > ${BIG}`);
  // 7. the skylines' layer (src/world/skyline.ts, farSkyline.ts; worker /skyline): every block's tall
  //    buildings (≥ 45 m or 14 storeys), tall building parts, building relations ≥ 45 m, and towers
  //    and masts ≥ 150 m, printed as in the tiles, in every block they touch
  await step('tall', ['tall'], `CREATE OR REPLACE TABLE tall AS
    WITH tw AS (SELECT id, tags FROM ways WHERE
        (map_contains(tags, 'building') AND (${H('height')} >= ${TALL.h} OR ${H('building:levels')} >= ${TALL.floors}))
        OR (map_contains(tags, 'building:part') AND ${H('height')} >= ${TALL.h})
        OR (${isTower} AND ${H('height')} >= ${TALL.mast})),
      tr AS (SELECT id FROM sel_r WHERE map_contains(tags, 'building') AND ${H('height')} >= ${TALL.h}),
      all_ AS (
        SELECT floor(wt.tx / ${BT})::INT bx, floor(wt.ty / ${BT})::INT bym, 'w' k, wg.id, wg.s, wg.w, wg.n, wg.e,
          to_json(struct_pack(type := 'way', id := wg.id, geometry := wg.geom, tags := tw.tags))::VARCHAR payload
        FROM tw JOIN wg ON wg.id = tw.id JOIN wt ON wt.id = tw.id
        UNION ALL
        SELECT floor(floor((lon + 180) * ${T}) / ${BT})::INT, floor(floor((lat + 90) * ${T}) / ${BT})::INT, 'n', id, lat, lon, lat, lon,
          to_json(struct_pack(type := 'node', id := id, lat := lat, lon := lon, tags := tags))::VARCHAR FROM sel_n WHERE tallnode
        UNION ALL
        SELECT floor(rt.tx / ${BT})::INT, floor(rt.ty / ${BT})::INT, 'r', rj.id, rj.s, rj.w, rj.n, rj.e, rj.payload
        FROM tr JOIN rj ON rj.id = tr.id JOIN rt ON rt.id = tr.id)
    SELECT bx, bym, k, id, any_value(s) s, any_value(w) w, any_value(n) n, any_value(e) e, any_value(payload) payload FROM all_ GROUP BY bx, bym, k, id`);
  await drop('mj', 'rj', 'rt', 'mem');
  // 8. what the packing reads: the selected ways' tiles with their tags, the nodes' lines
  await step('selected way tiles', ['swt'], `CREATE OR REPLACE TABLE swt AS SELECT wt.id, wt.tx, wt.ty FROM wt SEMI JOIN (SELECT id FROM ways WHERE sel) s ON s.id = wt.id`);
  await step('selected way tags', ['swg'], `CREATE OR REPLACE TABLE swg AS SELECT id, tags FROM ways WHERE sel`);
  await drop('wt', 'ways');
}
const counts = await one(`SELECT (SELECT count(*) FROM sel_n WHERE sel) n, (SELECT count(*) FROM swg) w, (SELECT count(DISTINCT id) FROM lines_r) r, (SELECT count(*) FROM bigs) big,
  (SELECT count(*) FROM swt) lw, (SELECT count(*) FROM lines_r) lr, (SELECT count(*) FROM tall) tall`);
log('elements', counts);

// 9. pack, in one ordered pass: per block, its tiles in key order — each tile's lines gzipped, back to
//    back — then its tall things, then its big relations. (Each way is printed here, not stored.)
const gz = promisify(gzip);
const index = existsSync(`${OUT}/index.json`) ? JSON.parse(readFileSync(`${OUT}/index.json`, 'utf8')) : { v: 1, blocks: {} };
Object.assign(index, { v: 1, ts: TS, tile: T, block: BT, made: new Date().toISOString(), sources: [PBF.split(/[\\/]/).pop()] });
// (in bands of block columns, west to east: the US in one ordered pass is a sort of ~100 GB of printed
// elements, a band's a fraction of it. But every band re-reads all the ways' geometry and tags — the
// join's other side, ~50 GB for the US — so bands are sized by what's in them, at most --band-lines
// printed lines each, and a column with nothing in it (the Pacific between the Aleutians and the
// lower 48) is never asked for: the first US run's 4° bands from −180° to +180°, 90 of them at ~6 min
// each, would have taken seven hours. A band holds its ways' tags while it joins their geometry, then
// sorts its printed lines: 40 M lines ran 20 GB out of memory; the densest column is ~9 M)
const BAND_LINES = Number(arg('band-lines', ['12000000'])[0]);
const sql = (bx0, bx1) => `SELECT tx // ${BT} bx, ty // ${BT} bym, tx, ty, k, id, s, w, n, e, payload FROM (
    SELECT floor((lon + 180) * ${T})::INT tx, floor((lat + 90) * ${T})::INT ty, 'n' k, id, lat s, lon w, lat n, lon e,
      to_json(struct_pack(type := 'node', id := id, lat := lat, lon := lon, tags := tags))::VARCHAR payload FROM sel_n WHERE sel
    UNION ALL
    SELECT swt.tx, swt.ty, 'w', wg.id, wg.s, wg.w, wg.n, wg.e, to_json(struct_pack(type := 'way', id := wg.id, geometry := wg.geom, tags := swg.tags))::VARCHAR
    FROM swt JOIN wg ON wg.id = swt.id JOIN swg ON swg.id = swt.id
    WHERE swt.tx BETWEEN ${bx0 * BT} AND ${(bx1 + 1) * BT - 1}
    UNION ALL
    SELECT tx, ty, k, id, s, w, n, e, payload FROM lines_r)
  WHERE tx BETWEEN ${bx0 * BT} AND ${(bx1 + 1) * BT - 1}
  ${ONLY ? `AND (tx // ${BT}) || '_' || (ty // ${BT}) IN (${[...ONLY].map((b) => `'${b}'`).join(',')})` : ''}
  ORDER BY bx, bym, tx, ty, k, id`;
// (each block column's printed lines, then the bands: consecutive columns with data, up to BAND_LINES)
let cols = (await con.runAndReadAll(`SELECT bx, sum(n)::BIGINT n FROM (
    SELECT tx // ${BT} bx, count(*) n FROM swt GROUP BY 1
    UNION ALL SELECT floor((lon + 180) * ${T})::INT // ${BT}, count(*) FROM sel_n WHERE sel GROUP BY 1
    UNION ALL SELECT tx // ${BT}, count(*) FROM lines_r GROUP BY 1) GROUP BY bx ORDER BY bx`)).getRows().map(([bx, n]) => [Number(bx), Number(n)]);
if (ONLY) cols = cols.filter(([bx]) => [...ONLY].some((b) => +b.split('_')[0] === bx));
const bands = [];
for (const [bx, n] of cols) {
  const last = bands.at(-1);
  if (last && last.n + n <= BAND_LINES) { last.bx1 = bx; last.n += n; } else bands.push({ bx0: bx, bx1: bx, n });
}
// (a band already packed — the run stopped part way — is kept: index.packed lists them)
index.packed = (index.packed ?? []).filter((k) => bands.some((b) => `${b.bx0}-${b.bx1}` === k));
log(`packing ${cols.length} block columns in ${bands.length} bands (≤ ${(BAND_LINES / 1e6).toFixed(0)} M lines each): ${bands.map((b) => `${b.bx0}–${b.bx1}`).join(', ')}…`);
// (a block's tall things and big relations come over a second connection: a query on the streaming
// one ends its stream — the first run stopped after one vector, 2,048 lines)
const side = await db.connect();
let block = null, total = 0, nBlocks = 0;
let st = null;
const startBlock = (key) => { st = { key, parts: [[]], off: 0, dir: {}, pending: [], lines: 0, tile: null, buf: [] }; };
const add = async (key, bufP) => {
  const b = await bufP;
  if (st.off + b.length > PART_MAX && st.parts.at(-1).length) { st.parts.push([]); st.off = 0; }
  const at = [st.off, b.length, st.parts.length - 1];
  st.parts.at(-1).push(b);
  st.off += b.length;
  return at;
};
// tiles compress on libuv's pool (UV_THREADPOOL_SIZE) in order; at most a few hundred in flight
let chain = Promise.resolve();
const queue = (tile, text) => {
  const p = gz(Buffer.from(text), { level: 6 });
  const s = st;
  chain = chain.then(async () => { s.dir[tile] = await add(tile, p); });
  s.pending.push(p);
  if (s.pending.length > 256) { const w = s.pending.splice(0, 128); return Promise.all(w); }
  return null;
};
const flushTile = () => { if (st?.tile && st.buf.length) { const w = queue(st.tile, st.buf.join('\n') + '\n'); st.buf = []; return w; } return null; };
const endBlock = async () => {
  if (!st) return;
  const w = flushTile();
  if (w) await w;
  await chain;
  const [bx, by] = st.key.split('_');
  const tallRows = (await side.runAndReadAll(`SELECT k, id, s, w, n, e, payload FROM tall WHERE bx = ${bx} AND bym = ${by} ORDER BY k, id`)).getRows();
  const tall = tallRows.length ? await add('tall', gz(Buffer.from(tallRows.map((r) => r.join('\t')).join('\n') + '\n'), { level: 6 })) : null;
  const big = {};
  for (const [id, payload] of (await side.runAndReadAll(`SELECT id, payload FROM bigs WHERE bx = ${bx} AND bym = ${by} ORDER BY id`)).getRows()) big[id] = await add('big', gz(Buffer.from(payload), { level: 6 }));
  const bins = st.parts.map((p) => Buffer.concat(p));
  const h = createHash('sha256');
  for (const b of bins) h.update(b);
  const hash = h.digest('hex').slice(0, 16);
  bins.forEach((b, i) => writeFileSync(`${OUT}/${st.key}.${i}.bin`, b));
  writeFileSync(`${OUT}/${st.key}.json`, JSON.stringify({ v: 1, ts: TS, tiles: st.dir, big, ...(tall ? { tall } : {}) }));
  const bytes = bins.reduce((a, b) => a + b.length, 0);
  index.blocks[st.key] = { hash, parts: bins.length, bytes, tiles: Object.keys(st.dir).length, lines: st.lines, big: Object.keys(big).length, tall: tallRows.length };
  total += bytes;
  nBlocks++;
  log(`block ${st.key}: ${Object.keys(st.dir).length} tiles, ${st.lines} lines, ${tallRows.length} tall, ${Object.keys(big).length} big, ${(bytes / 1e6).toFixed(1)} MB in ${bins.length} part${bins.length > 1 ? 's' : ''}`);
  writeFileSync(`${OUT}/index.json`, JSON.stringify(index, null, 1));
  st = null;
};
// (an ordered stream can hand over an empty chunk before it's done — only no chunk at all is the end)
for (const band of bands) {
  if (index.packed.includes(`${band.bx0}-${band.bx1}`)) { log(`band ${band.bx0}–${band.bx1} (kept from the last run)`); continue; }
  const t = Date.now();
  const res = await con.stream(sql(band.bx0, band.bx1));
  for (let empty = 0; ; ) {
    const chunk = await res.fetchChunk();
    if (!chunk) break;
    if (!chunk.rowCount) { if (++empty > 10000) break; continue; }
    empty = 0;
    for (const [bx, by, tx, ty, k, id, s, w, n, e, payload] of chunk.getRows()) {
      const key = `${bx}_${by}`;
      if (key !== block) { await endBlock(); block = key; startBlock(key); }
      const tile = `${tx}_${ty}`;
      if (tile !== st.tile) { const wait = flushTile(); if (wait) await wait; st.tile = tile; }
      st.buf.push(`${k}\t${id}\t${s}\t${w}\t${n}\t${e}\t${payload}`);
      st.lines++;
    }
  }
  await endBlock();
  block = null;
  index.packed.push(`${band.bx0}-${band.bx1}`);
  writeFileSync(`${OUT}/index.json`, JSON.stringify(index, null, 1));
  log(`band ${band.bx0}–${band.bx1} (${(band.n / 1e6).toFixed(1)} M lines) packed in ${((Date.now() - t) / 1000).toFixed(0)} s`);
}
// (blocks with only tall things, outside every tile's block: none in practice — the tall are tiles' too)
writeFileSync(`${OUT}/index.json`, JSON.stringify(index, null, 1));
log(`packed ${nBlocks} blocks, ${(total / 1e6).toFixed(1)} MB → ${OUT}`);
