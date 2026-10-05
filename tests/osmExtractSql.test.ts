import { describe, expect, it, beforeAll } from 'vitest';

// The extract's own relation SQL (scripts/osm-extract.mjs, read out of the script so the test runs
// what the extract runs), over a few hand-made relations in an in-memory DuckDB: what it prints must
// be what Overpass prints for `out geom`. The US run found a member's empty role — OSM allows it,
// Overpass prints "role": "", ST_ReadOSM reads it as NULL — dropping the member from its relation
// (a NULL in a concatenation is NULL), and a relation of only such members printing as null.
type Rows = { getRowObjectsJson(): Record<string, unknown>[] };
type Con = { run(sql: string): Promise<unknown>; runAndReadAll(sql: string): Promise<Rows> };
let con: Con;
let src = '';
/** A step's SQL as the script writes it: its template literal, evaluated with the script's constants. */
const stepSql = (label: string) => {
  const m = src.match(new RegExp(`step\\('${label}', \\[[^\\]]*\\], \`([\\s\\S]*?)\`\\);`));
  if (!m) throw new Error(`no step '${label}' in scripts/osm-extract.mjs`);
  return new Function('T', 'BT', 'BIG', `return \`${m[1]}\`;`)(128, 128, 50_000) as string;
};
const rows = async (sql: string) => (await con.runAndReadAll(sql)).getRowObjectsJson();

beforeAll(async () => {
  const fs = (await import(/* @vite-ignore */ `node:${'fs'}`)) as { readFileSync(p: URL, enc: 'utf8'): string };
  src = fs.readFileSync(new URL('../scripts/osm-extract.mjs', import.meta.url), 'utf8').replace(/\r\n/g, '\n');
  const { DuckDBInstance } = (await import(/* @vite-ignore */ `@duckdb/${'node-api'}`)) as { DuckDBInstance: { create(p: string): Promise<{ connect(): Promise<Con> }> } };
  con = await (await DuckDBInstance.create(':memory:')).connect();
  // the tables as the extract's earlier steps leave them (sel_r from ST_ReadOSM: roles may be NULL)
  await con.run(`CREATE TABLE sel_r AS SELECT * FROM (VALUES
      (1::BIGINT, MAP {'type': 'multipolygon', 'building': 'roof'}, [10, 11]::BIGINT[], ['way', 'way'], [NULL, 'outer']::VARCHAR[]),
      (2::BIGINT, MAP {'type': 'site', 'amenity': 'parking'}, [12]::BIGINT[], ['way'], [NULL]::VARCHAR[]),
      (3::BIGINT, MAP {'type': 'multipolygon', 'natural': 'water'}, [10, 20]::BIGINT[], ['way', 'node'], ['outer', 'label']::VARCHAR[])
    ) t(id, tags, refs, ref_types, ref_roles)`);
  const pt = (lat: number, lon: number) => `{'lat': ${lat}::DOUBLE, 'lon': ${lon}::DOUBLE}`;
  await con.run(`CREATE TABLE wg AS SELECT * FROM (VALUES
      (10::BIGINT, [${pt(40, -74)}, ${pt(40.001, -74)}, ${pt(40.001, -73.999)}, ${pt(40, -74)}], 40::DOUBLE, -74::DOUBLE, 40.001::DOUBLE, -73.999::DOUBLE, 4::BIGINT),
      (12::BIGINT, [${pt(41, -75)}, ${pt(41.001, -75)}], 41::DOUBLE, -75::DOUBLE, 41.001::DOUBLE, -75::DOUBLE, 2::BIGINT)
    ) t(id, geom, s, w, n, e, cnt)`);
  await con.run(`CREATE TABLE sel_n AS SELECT * FROM (VALUES (20::BIGINT, MAP {'name': 'Pond'}, 40.0005::DOUBLE, -73.9995::DOUBLE, false, false)) t(id, tags, lat, lon, sel, tallnode)`);
  for (const step of ['members', 'relation members', 'relation json']) await con.run(stepSql(step));
});

describe('the extract prints relations as Overpass does (scripts/osm-extract.mjs SQL, in DuckDB)', () => {
  it('a member with an empty role keeps its place in the relation, as "role": ""', async () => {
    const r = await rows('SELECT id, payload FROM rj ORDER BY id');
    expect(r.map((x) => x.id)).toEqual(['1', '2', '3']);
    const one = JSON.parse(String(r[0].payload));
    expect(one).toEqual({
      type: 'relation', id: 1,
      members: [
        { type: 'way', ref: 10, role: '', geometry: [{ lat: 40, lon: -74 }, { lat: 40.001, lon: -74 }, { lat: 40.001, lon: -73.999 }, { lat: 40, lon: -74 }] },
        { type: 'way', ref: 11, role: 'outer' }, // (a member the extract doesn't have: no geometry, as Overpass prints one it can't place)
      ],
      tags: { type: 'multipolygon', building: 'roof' },
    });
  });
  it('a relation of only empty roles is printed, never null', async () => {
    const [two] = await rows('SELECT payload FROM rj WHERE id = 2');
    expect(two.payload).not.toBeNull();
    expect(JSON.parse(String(two.payload)).members).toEqual([{ type: 'way', ref: 12, role: '', geometry: [{ lat: 41, lon: -75 }, { lat: 41.001, lon: -75 }] }]);
  });
  it('node members carry their place and role; members stay in their order', async () => {
    const [three] = await rows('SELECT payload, s, w, n, e FROM rj WHERE id = 3');
    const j = JSON.parse(String(three.payload));
    expect(j.members.map((m: { type: string; ref: number; role: string }) => `${m.type}${m.ref}:${m.role}`)).toEqual(['way10:outer', 'node20:label']);
    expect(j.members[1]).toEqual({ type: 'node', ref: 20, role: 'label', lat: 40.0005, lon: -73.9995 });
    // (the relation's bounds span its members': what a reader's box prefilter needs)
    expect([three.s, three.w, three.n, three.e].map(Number)).toEqual([40, -74, 40.001, -73.999]);
  });
  it('nothing the steps print is null', async () => {
    const [n] = await rows('SELECT count(*) FILTER (WHERE payload IS NULL) nn, count(*) n FROM rj');
    expect(n).toEqual({ nn: '0', n: '3' });
    const [m] = await rows('SELECT count(*) FILTER (WHERE j IS NULL) nn FROM mj');
    expect(m.nn).toBe('0');
  });
});
