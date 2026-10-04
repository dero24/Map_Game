// What a real cell asks OpenStreetMap for, written once: the Overpass query the tile service and the
// direct path send (realTile.ts `overpassQuery`, generated from this list) and the selection our own
// extract makes from Geofabrik's files (scripts/osm-extract.mjs: `sqlWhere` for DuckDB, `matchesQuery`
// to check it) are the same statements, so the two can never drift apart (tests/osmQuery.test.ts).

/** One tag condition, Overpass-style: the key is present (`["k"]`), equals a value (`["k"="v"]`) or
 *  matches a regular expression (`["k"~"re"]`, case-sensitive, unanchored unless the pattern says). */
export interface Cond { k: string; v?: string; re?: string }
export interface Stmt { t: 'node' | 'way' | 'relation'; c: Cond[] }

const has = (k: string): Cond => ({ k });
const eq = (k: string, v: string): Cond => ({ k, v });
const re = (k: string, r: string): Cond => ({ k, re: r });
const S = (t: Stmt['t'], ...c: Cond[]): Stmt => ({ t, c });

export const STATEMENTS: Stmt[] = [
  S('way', has('highway')),
  S('way', has('building')),
  S('relation', has('building')),
  S('way', has('building:part')),
  S('relation', has('building:part')),
  S('way', re('natural', '^(water|coastline|beach|sand|wetland|wood|scrub|heath|grassland)$')),
  S('way', eq('amenity', 'parking')),
  S('relation', eq('amenity', 'parking')),
  S('relation', eq('natural', 'water')),
  S('way', eq('waterway', 'riverbank')),
  S('node', eq('natural', 'tree')),
  S('node', eq('amenity', 'bench')),
  S('node', re('highway', '^(traffic_signals|stop|give_way|crossing|street_lamp)$')),
  S('node', re('amenity', '^(waste_basket|post_box|bicycle_parking|drinking_water|vending_machine|recycling|bbq|clock|planter)$')),
  S('node', re('leisure', '^(picnic_table|firepit)$')),
  S('node', eq('tourism', 'information'), re('information', '^(board|map)$')),
  S('node', re('man_made', '^(street_cabinet|planter)$')),
  S('node', re('seamark:type', '^(buoy_|beacon_|mooring$)')),
  S('node', eq('barrier', 'bollard')),
  S('node', eq('tourism', 'viewpoint')),
  S('node', has('playground')),
  S('way', has('playground')),
  S('node', eq('emergency', 'fire_hydrant')),
  S('node', eq('railway', 'subway_entrance')),
  S('node', re('man_made', '^(mast|tower|communications_tower|water_tower|chimney|flagpole)$')),
  S('way', re('man_made', '^(mast|communications_tower|water_tower|chimney)$')),
  S('node', eq('highway', 'bus_stop')),
  S('node', has('name'), re('amenity', '^(cafe|restaurant|fast_food|bar|pub|biergarten|ice_cream|bank|pharmacy|post_office|library|nightclub)$')),
  S('node', has('name'), has('shop')),
  S('node', has('name'), has('office')),
  S('way', eq('wall', 'seawall')),
  S('way', re('man_made', '^(groyne|breakwater|pier)$')),
  S('way', re('barrier', '^(fence|wall|retaining_wall)$')),
  S('way', eq('power', 'line')),
  S('way', re('railway', '^(rail|tram|light_rail)$')),
  S('way', re('leisure', '^(park|pitch|playground|garden|recreation_ground|swimming_pool|golf_course|marina)$')),
  S('way', re('landuse', '^(forest|farmland|meadow|reservoir|cemetery|basin|quarry|landfill|grass|recreation_ground|village_green)$')),
  S('relation', re('leisure', '^(park|pitch|playground|garden|recreation_ground)$')),
  S('relation', re('landuse', '^(forest|farmland|meadow|reservoir|cemetery|basin|quarry|landfill|grass)$')),
];

const condQl = (c: Cond) => (c.v !== undefined ? `["${c.k}"="${c.v}"]` : c.re !== undefined ? `["${c.k}"~"${c.re}"]` : `["${c.k}"]`);
/** The union's statements, as the Overpass query lists them (two spaces, one a line). */
export const overpassStatements = () => STATEMENTS.map((s) => `  ${s.t}${s.c.map(condQl).join('')};`).join('\n');

const rx = new Map<string, RegExp>();
const condOk = (c: Cond, tags: Record<string, string>) => {
  const v = tags[c.k];
  if (v === undefined) return false;
  if (c.v !== undefined) return v === c.v;
  if (c.re !== undefined) {
    let r = rx.get(c.re);
    if (!r) rx.set(c.re, (r = new RegExp(c.re)));
    return r.test(v);
  }
  return true;
};
/** Whether an element of this type and tags is in the query's answer (ignoring where it is). */
export function matchesQuery(t: Stmt['t'], tags: Record<string, string> | undefined | null): boolean {
  if (!tags) return false;
  for (const s of STATEMENTS) if (s.t === t && s.c.every((c) => condOk(c, tags))) return true;
  return false;
}

const sqlStr = (s: string) => `'${s.replace(/'/g, "''")}'`;
const condSql = (c: Cond, col: string) => {
  const v = `${col}[${sqlStr(c.k)}]`;
  if (c.v !== undefined) return `${v} = ${sqlStr(c.v)}`;
  if (c.re !== undefined) return `regexp_matches(${v}, ${sqlStr(c.re)})`;
  return `map_contains(${col}, ${sqlStr(c.k)})`;
};
/** The same selection as a DuckDB WHERE clause over a MAP(VARCHAR, VARCHAR) tags column. */
export function sqlWhere(t: Stmt['t'], col = 'tags'): string {
  const ors = STATEMENTS.filter((s) => s.t === t).map((s) => `(${s.c.map((c) => condSql(c, col)).join(' AND ')})`);
  return ors.length ? `(${ors.join(' OR ')})` : 'FALSE';
}
/** Every key a statement of this type needs (a cheap prefilter: an element without any is never in). */
export const queryKeys = (t: Stmt['t']) => [...new Set(STATEMENTS.filter((s) => s.t === t).map((s) => s.c[0].k))];
