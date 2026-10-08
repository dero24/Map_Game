#!/usr/bin/env node
// The extract's add-on: what the cell query (src/world/osmQuery.ts) selects that our extract
// (scripts/osm-extract.mjs) was cut without — the natural areas mapped as relations (a beach, a wood,
// a marsh bundled from several outlines: natural=beach|sand|wetland|wood|scrub|heath|grassland,
// 2026-10-08; Cape May's beach was one). Cut from the same file as the extract, from the same moment, and
// packed the same way, under its own prefix: the tile service reads it beside the extract when the two
// are of one snapshot (worker/src/osm.js), and the next full cut carries all of it itself. Not the whole
// extract again — the file's relations, their members and their points, then a few hundred blocks.
//
// Relations only: a new statement for ways or nodes needs the full cut. The add-on holds the query's
// relations the extract's own table (`sel_r`, in its DuckDB file) doesn't — never one twice — and prints
// them with the extract's own SQL, read out of scripts/osm-extract.mjs (as tests/osmExtractSql.test.ts
// reads it): the members, their geometry, the tiles a relation's members cross, the big ones stored once.
//
//   node scripts/osm-extract-addon.mjs --pbf=D:/map_game_osm/us-latest.osm.pbf
//     --base=D:/map_game_osm/us/extract.duckdb (the extract's DuckDB file: its relations)
//     --index=D:/map_game_osm/out/v1/index.json (the extract's index: its snapshot)
//     [--work=D:/map_game_osm/addon] [--out=D:/map_game_osm/out/addon-v1] [--mem=16GB] [--threads=10]
//     [--big=2000] (a relation printed past this many characters is stored once, its tiles pointing to
//     it: the extract's own rule at 50,000 — but a wood or a marsh of 8–50 K crosses ~14 tiles, and New
//     Jersey's add-on was 88.5 MB of copies of them; once each, a cell's few are a read each)
//     [--keep] (the tables a run left, as far as its printed lines: straight to the packing)
//   then: node scripts/osm-upload.mjs --addon --pack=<out>
import { DuckDBInstance } from '@duckdb/node-api';
import { createHash } from 'node:crypto';
import { mkdirSync, writeFileSync, readFileSync, rmSync, existsSync } from 'node:fs';
import { gzipSync } from 'node:zlib';
import { sqlWhere, queryKeys } from '../src/world/osmQuery.ts';
import { TILE_PER_DEG as T, BLOCK_TILES as BT } from '../src/world/osmTiles.ts';

const argv = process.argv.slice(2);
const arg = (k, d) => { const a = argv.find((x) => x.startsWith(`--${k}=`)); return a ? a.slice(k.length + 3) : d; };
const PBF = arg('pbf', ''), BASE = arg('base', ''), INDEX = arg('index', '');
const WORK = arg('work', 'D:/map_game_osm/addon'), OUT = arg('out', 'D:/map_game_osm/out/addon-v1');
const MEM = arg('mem', '16GB'), THREADS = arg('threads', '10'), SLICE_PTS = Number(arg('slice-points', '10000000')), ONCE = Number(arg('big', '2000'));
const PART_MAX = 200e6;
if (!PBF || !BASE || !INDEX) { console.error('--pbf=<file.osm.pbf> --base=<the extract\'s DuckDB file> --index=<the extract\'s index.json> are required'); process.exit(1); }
const base = JSON.parse(readFileSync(INDEX, 'utf8'));
const TS = base.ts;
for (const d of [WORK, `${WORK}/tmp`, OUT]) mkdirSync(d, { recursive: true });
const t0 = Date.now();
const log = (...a) => console.log(`[${((Date.now() - t0) / 1000).toFixed(0).padStart(5)}s]`, ...a);

// (the extract's own steps, as it writes them: their template literals with its constants)
const SRC = readFileSync(new URL('./osm-extract.mjs', import.meta.url), 'utf8').replace(/\r\n/g, '\n');
const stepSql = (label) => {
  const m = SRC.match(new RegExp(`step\\('${label}', \\[[^\\]]*\\], \`([\\s\\S]*?)\`\\);`));
  if (!m) throw new Error(`no step '${label}' in scripts/osm-extract.mjs`);
  return new Function('T', 'BT', 'BIG', `return \`${m[1]}\`;`)(T, BT, ONCE);
};

const KEEP = argv.includes('--keep');
if (!KEEP && existsSync(`${WORK}/addon.duckdb`)) rmSync(`${WORK}/addon.duckdb`); // (a fresh file each run)
if (!KEEP && existsSync(`${WORK}/addon.duckdb.wal`)) rmSync(`${WORK}/addon.duckdb.wal`);
const db = await DuckDBInstance.create(`${WORK}/addon.duckdb`);
const con = await db.connect();
await con.run(`INSTALL spatial; LOAD spatial; SET temp_directory='${WORK}/tmp'; SET memory_limit='${MEM}'; SET threads=${THREADS}; SET preserve_insertion_order=false;`);
await con.run(`ATTACH '${BASE}' AS base (READ_ONLY)`);
const run = async (label, sql) => { const t = Date.now(); await con.run(sql); log(label, `${((Date.now() - t) / 1000).toFixed(1)} s`); };
const one = async (sql) => (await con.runAndReadAll(sql)).getRowObjectsJson()[0];
const osm = (kind, cols) => `(SELECT ${cols} FROM ST_ReadOSM('${PBF}') WHERE kind = '${kind}')`;
const pre = (t) => queryKeys(t).map((k) => `map_contains(tags, '${k}')`).join(' OR ');
const has = async (...ts) => +(await one(`SELECT count(*) n FROM duckdb_tables() WHERE database_name = current_database() AND table_name IN (${ts.map((t) => `'${t}'`).join(',')})`)).n === ts.length;

if (KEEP && (await has('lines_r', 'bigs'))) log('the tables of the last run, as far as its lines (--keep)');
else {
// 1. the query's relations the extract doesn't hold, and their members
await run('relations', `CREATE TABLE sel_r AS SELECT id, tags, refs, ref_types, ref_roles FROM ${osm('relation', '*')}
  WHERE (${pre('relation')}) AND ${sqlWhere('relation')} AND id NOT IN (SELECT id FROM base.sel_r)`);
log('relations new to the extract', await one('SELECT count(*) n FROM sel_r'));
await run('members', stepSql('members'));
// 2. their member ways, their points (one pass over the file's nodes), their geometry
await run('ways', `CREATE TABLE ways AS SELECT id, refs FROM ${osm('way', 'id, refs')} WHERE id IN (SELECT ref FROM mem WHERE mtype = 'way')`);
await run('way nodes', `CREATE TABLE wn AS SELECT id AS wid, unnest(refs) AS nid, generate_subscripts(refs, 1) AS i FROM ways`);
await run('nodes', `CREATE TABLE np AS SELECT id, tags, round(lat, 7) lat, round(lon, 7) lon FROM ${osm('node', 'id, tags, lat, lon')}
  WHERE id IN (SELECT nid FROM wn UNION SELECT ref FROM mem WHERE mtype = 'node')`);
await run('way points', `CREATE TABLE wj AS SELECT wn.wid, wn.i, np.lat, np.lon FROM wn JOIN np ON np.id = wn.nid`);
{
  // (in slices of ~10 M points, as the extract does: one ordered list aggregate runs out of memory)
  const pts = +(await one('SELECT count(*) n FROM wj')).n;
  const SLICES = Math.max(1, Math.ceil(pts / (SLICE_PTS || 10e6)));
  log(`geometry: ${pts.toLocaleString()} points in ${SLICES} slice${SLICES > 1 ? 's' : ''}`);
  for (let k = 0; k < SLICES; k++)
    await run(`geometry ${k + 1}/${SLICES}`, `${k ? 'INSERT INTO wg' : 'CREATE TABLE wg AS'} SELECT id, list_transform(list_sort(pts), p -> struct_pack(lat := p.lat, lon := p.lon)) geom, s, w, n, e, cnt
      FROM (SELECT wid id, list(struct_pack(i := i, lat := lat, lon := lon)) pts, min(lat) s, min(lon) w, max(lat) n, max(lon) e, count(*) cnt FROM wj WHERE wid % ${SLICES} = ${k} GROUP BY wid)`);
}
// (the member nodes, as the extract's own node table names them)
await run('member nodes', `CREATE TABLE sel_n AS SELECT id, tags, lat, lon, false AS sel, false AS tallnode FROM np WHERE id IN (SELECT ref FROM mem WHERE mtype = 'node')`);
// 3. the extract's own steps: each member way's tiles, the relations printed, their tiles, their lines, the big ones
for (const s of ['way tiles', 'relation members', 'relation json', 'relation tiles', 'relation lines', 'big relations']) await run(s, stepSql(s));
}
const counts = await one(`SELECT (SELECT count(DISTINCT id) FROM lines_r) r, (SELECT count(*) FROM lines_r) lines, (SELECT count(*) FROM bigs) big,
  (SELECT count(*) FROM wg) ways, (SELECT coalesce(sum(cnt), 0) FROM wg) points`);
log('the add-on', counts);

// 4. pack, as the extract does: per block, its tiles in key order — each tile's lines gzipped, back to
//    back — then its big relations, and a directory; the index last
const index = { v: 1, ts: TS, tile: T, block: BT, made: new Date().toISOString(), sources: [PBF.split(/[\\/]/).pop()], base: base.made,
  addon: 'relations: the query\'s natural areas (osmQuery.ts, 2026-10-08)', once: ONCE, blocks: {} };
// (a block column at a time, west to east: its relations stored once read for it alone — the US's are
// ~4 GB of text, a column's a few tens of MB — over a second connection, as the extract reads its big
// relations: a query on the streaming one ends its stream)
let bigBy = new Map();
const side = await db.connect();
let st = null, total = 0;
const put = (buf) => {
  if (st.off + buf.length > PART_MAX && st.parts.at(-1).length) { st.parts.push([]); st.off = 0; }
  const at = [st.off, buf.length, st.parts.length - 1];
  st.parts.at(-1).push(buf);
  st.off += buf.length;
  return at;
};
const flushTile = () => { if (st?.tile && st.buf.length) { st.dir[st.tile] = put(gzipSync(Buffer.from(st.buf.join('\n') + '\n'), { level: 6 })); st.buf = []; } };
const endBlock = () => {
  if (!st) return;
  flushTile();
  const big = {};
  for (const [id, payload] of bigBy.get(st.key) ?? []) big[id] = put(gzipSync(Buffer.from(payload), { level: 6 }));
  bigBy.delete(st.key);
  const bins = st.parts.map((p) => Buffer.concat(p));
  const h = createHash('sha256');
  for (const b of bins) h.update(b);
  const hash = h.digest('hex').slice(0, 16);
  bins.forEach((b, i) => writeFileSync(`${OUT}/${st.key}.${i}.bin`, b));
  writeFileSync(`${OUT}/${st.key}.json`, JSON.stringify({ v: 1, ts: TS, tiles: st.dir, big }));
  const bytes = bins.reduce((a, b) => a + b.length, 0);
  index.blocks[st.key] = { hash, parts: bins.length, bytes, tiles: Object.keys(st.dir).length, lines: st.lines, big: Object.keys(big).length };
  total += bytes;
  st = null;
};
const cols = (await con.runAndReadAll(`SELECT DISTINCT bx FROM (SELECT (tx // ${BT})::INT bx FROM lines_r UNION SELECT bx FROM bigs) ORDER BY bx`)).getRows().map(([bx]) => Number(bx));
log(`packing ${cols.length} block columns`);
for (const col of cols) {
  bigBy = new Map();
  for (const [by, id, payload] of (await side.runAndReadAll(`SELECT bym, id, payload FROM bigs WHERE bx = ${col} ORDER BY bym, id`)).getRows()) {
    if (payload == null) throw new Error(`big relation ${id} printed as null`);
    const k = `${col}_${by}`;
    (bigBy.get(k) ?? bigBy.set(k, []).get(k)).push([id, payload]);
  }
  const res = await con.stream(`SELECT tx // ${BT} bx, ty // ${BT} bym, tx, ty, k, id, s, w, n, e, payload FROM lines_r WHERE tx BETWEEN ${col * BT} AND ${(col + 1) * BT - 1} ORDER BY bym, tx, ty, k, id`);
  for (let empty = 0; ; ) {
    const chunk = await res.fetchChunk();
    if (!chunk) break;
    if (!chunk.rowCount) { if (++empty > 10000) break; continue; }
    empty = 0;
    for (const [bx, by, tx, ty, k, id, s, w, n, e, payload] of chunk.getRows()) {
      const key = `${bx}_${by}`;
      if (key !== st?.key) { endBlock(); st = { key, parts: [[]], off: 0, dir: {}, lines: 0, tile: null, buf: [] }; }
      const tile = `${tx}_${ty}`;
      if (tile !== st.tile) { flushTile(); st.tile = tile; }
      if (payload == null) throw new Error(`${k}${id} printed as null`);
      st.buf.push(`${k}\t${id}\t${s}\t${w}\t${n}\t${e}\t${payload}`);
      st.lines++;
    }
  }
  endBlock();
  // (a big relation whose home block has no tile line of the add-on's own: its block, its big relations alone)
  for (const key of [...bigBy.keys()]) { st = { key, parts: [[]], off: 0, dir: {}, lines: 0, tile: null, buf: [] }; endBlock(); }
  writeFileSync(`${OUT}/index.json`, JSON.stringify(index, null, 1));
}
writeFileSync(`${OUT}/index.json`, JSON.stringify(index, null, 1));
log(`packed ${Object.keys(index.blocks).length} blocks, ${(total / 1e6).toFixed(1)} MB → ${OUT} (snapshot ${TS})`);
