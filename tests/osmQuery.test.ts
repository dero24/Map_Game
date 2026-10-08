import { describe, expect, it } from 'vitest';
import { overpassQuery } from '../src/world/realTile';
import { STATEMENTS, matchesQuery, sqlWhere, queryKeys, overpassStatements } from '../src/world/osmQuery';

// The one list of what a real cell asks for (osmQuery.ts): the Overpass query is generated from it,
// byte for byte the query the tile service sent before the list existed (frozen below, 2026-10-03; one
// statement since, 2026-10-08: the natural areas mapped as relations);
// our own extract selects with the same list (scripts/osm-extract.mjs), as DuckDB SQL and as a
// JavaScript matcher that agree.
const FROZEN = (bb: { s: number; w: number; n: number; e: number }) => `[out:json][timeout:25][bbox:${bb.s.toFixed(7)},${bb.w.toFixed(7)},${bb.n.toFixed(7)},${bb.e.toFixed(7)}];(
  way["highway"];
  way["building"];
  relation["building"];
  way["building:part"];
  relation["building:part"];
  way["natural"~"^(water|coastline|beach|sand|wetland|wood|scrub|heath|grassland)$"];
  way["amenity"="parking"];
  relation["amenity"="parking"];
  relation["natural"="water"];
  relation["natural"~"^(beach|sand|wetland|wood|scrub|heath|grassland)$"];
  way["waterway"="riverbank"];
  node["natural"="tree"];
  node["amenity"="bench"];
  node["highway"~"^(traffic_signals|stop|give_way|crossing|street_lamp)$"];
  node["amenity"~"^(waste_basket|post_box|bicycle_parking|drinking_water|vending_machine|recycling|bbq|clock|planter)$"];
  node["leisure"~"^(picnic_table|firepit)$"];
  node["tourism"="information"]["information"~"^(board|map)$"];
  node["man_made"~"^(street_cabinet|planter)$"];
  node["seamark:type"~"^(buoy_|beacon_|mooring$)"];
  node["barrier"="bollard"];
  node["tourism"="viewpoint"];
  node["playground"];
  way["playground"];
  node["emergency"="fire_hydrant"];
  node["railway"="subway_entrance"];
  node["man_made"~"^(mast|tower|communications_tower|water_tower|chimney|flagpole)$"];
  way["man_made"~"^(mast|communications_tower|water_tower|chimney)$"];
  node["highway"="bus_stop"];
  node["name"]["amenity"~"^(cafe|restaurant|fast_food|bar|pub|biergarten|ice_cream|bank|pharmacy|post_office|library|nightclub)$"];
  node["name"]["shop"];
  node["name"]["office"];
  way["wall"="seawall"];
  way["man_made"~"^(groyne|breakwater|pier)$"];
  way["barrier"~"^(fence|wall|retaining_wall)$"];
  way["power"="line"];
  way["railway"~"^(rail|tram|light_rail)$"];
  way["leisure"~"^(park|pitch|playground|garden|recreation_ground|swimming_pool|golf_course|marina)$"];
  way["landuse"~"^(forest|farmland|meadow|reservoir|cemetery|basin|quarry|landfill|grass|recreation_ground|village_green)$"];
  relation["leisure"~"^(park|pitch|playground|garden|recreation_ground)$"];
  relation["landuse"~"^(forest|farmland|meadow|reservoir|cemetery|basin|quarry|landfill|grass)$"];
);out geom qt;`;

describe('the cell query, written once (osmQuery.ts)', () => {
  it('generates exactly the Overpass query the service has always sent', () => {
    const bb = { s: 40.3512345, w: -73.9812345, n: 40.3612345, e: -73.9712345 };
    expect(overpassQuery(bb)).toBe(FROZEN(bb));
    expect(overpassStatements().split('\n')).toHaveLength(STATEMENTS.length);
  });
  it('matches tags the way Overpass does: present, equal, regex (unanchored unless anchored)', () => {
    expect(matchesQuery('way', { highway: 'residential' })).toBe(true);
    expect(matchesQuery('node', { highway: 'residential' })).toBe(false);
    expect(matchesQuery('node', { highway: 'street_lamp' })).toBe(true);
    expect(matchesQuery('node', { highway: 'street_lamps' })).toBe(false); // ^…$
    expect(matchesQuery('node', { 'seamark:type': 'buoy_lateral' })).toBe(true); // "buoy_" is open at its end
    expect(matchesQuery('node', { 'seamark:type': 'mooring_buoy' })).toBe(false);
    expect(matchesQuery('node', { 'seamark:type': 'mooring' })).toBe(true);
    expect(matchesQuery('node', { tourism: 'information', information: 'board' })).toBe(true);
    expect(matchesQuery('node', { tourism: 'information', information: 'guidepost' })).toBe(false);
    expect(matchesQuery('node', { shop: 'bakery' })).toBe(false); // a shop needs its name
    expect(matchesQuery('node', { shop: 'bakery', name: 'Crust' })).toBe(true);
    expect(matchesQuery('relation', { natural: 'water', type: 'multipolygon' })).toBe(true);
    expect(matchesQuery('relation', { natural: 'wood' })).toBe(true); // (since 2026-10-08: a wood mapped as a multipolygon)
    expect(matchesQuery('relation', { natural: 'beach', type: 'multipolygon' })).toBe(true);
    expect(matchesQuery('relation', { natural: 'peak' })).toBe(false);
    expect(matchesQuery('way', { natural: 'wood' })).toBe(true);
    expect(matchesQuery('way', { Highway: 'residential' })).toBe(false); // keys are case-sensitive
    expect(matchesQuery('way', {})).toBe(false);
    expect(matchesQuery('way', null)).toBe(false);
  });
  it('the SQL says the same thing, statement by statement', () => {
    const w = sqlWhere('node');
    expect(w).toContain("tags['natural'] = 'tree'");
    expect(w).toContain("(map_contains(tags, 'name') AND map_contains(tags, 'shop'))");
    expect(w).toContain("regexp_matches(tags['seamark:type'], '^(buoy_|beacon_|mooring$)')");
    for (const t of ['node', 'way', 'relation'] as const) expect(sqlWhere(t).split(' OR ')).toHaveLength(STATEMENTS.filter((s) => s.t === t).length);
    expect(queryKeys('relation').sort()).toEqual(['amenity', 'building', 'building:part', 'landuse', 'leisure', 'natural']);
  });
});
