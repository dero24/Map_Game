import { describe, expect, it } from 'vitest';
import shardsJson from './fixtures/places/shards.json';
import tilesJson from './fixtures/places/rev.json';
import { normalize, tokens, nameShards, queryShards, rankRows, parseRows, rowToTsv, localityIn, inRings, tileOf, tileKey, detailOf, type RevTile, type PlaceRow } from '../src/ui/placeIndex';

// The fixture is scripts/build-places.mjs's own output: New Jersey's rows of a few shards (and every
// Springfield and Portland town), and the boundary tiles round the shore.
const shards = shardsJson as Record<string, string>;
const tiles = tilesJson as unknown as Record<string, RevTile>;
const rowsOf = (k: string) => parseRows(shards[k] ?? '');
const tileAt = (lat: number, lon: number) => tiles[tileKey(...tileOf(lat, lon))] ?? null;
const SEA_BRIGHT = { lat: 40.3597, lon: -73.975 };

describe('place index: words and shards (placeIndex.ts)', () => {
  it('normalizes accents, apostrophes, ampersands and punctuation', () => {
    expect(normalize("St. George's by-the-River")).toBe('st georges by the river');
    expect(normalize('Cañon City')).toBe('canon city');
    expect(normalize('A&P')).toBe('a and p');
    expect(tokens('  Monmouth   Beach ')).toEqual(['monmouth', 'beach']);
  });
  it("files a name under each word's first three letters", () => {
    expect(nameShards('Monmouth Beach')).toEqual(['mon', 'bea']);
    expect(nameShards('La Jolla')).toEqual(['la', 'jol']);
  });
  it('reads the rarest word first, a state after, stop words last', () => {
    const size = (k: string) => ({ shr: 10, mon: 500, bea: 9000 })[k] ?? 1e6;
    expect(queryShards('Monmouth Beach', size)).toEqual(['mon', 'bea']);
    expect(queryShards('Shrewsbury NJ', size)).toEqual(['shr', 'nj']);
    expect(queryShards('springfield illinois')[0]).toBe('spr');
    expect(queryShards('New Jersey')).toEqual(['jer', 'new']); // only state words: read them anyway
    expect(queryShards('Virginia Beach', size)[0]).toBe('bea');
    expect(queryShards('Church of the Holy Spirit', size).slice(-2).sort()).toEqual(['of', 'the']); // stop words last
  });
  it('round-trips a row', () => {
    const r: PlaceRow = { name: 'Sea Bright', kind: 'borough', st: 'NJ', county: 'Monmouth County', lat: 40.36152, lon: -73.97613, w: 61 };
    expect(parseRows(rowToTsv(r) + '\n')).toEqual([r]);
    expect(detailOf(r)).toBe('borough · Monmouth County, NJ');
  });
});

describe('place index: search ranking', () => {
  it('Shrewsbury from the shore: the borough, then the township, both Monmouth County', () => {
    const hits = rankRows(rowsOf('shr'), 'Shrewsbury', SEA_BRIGHT);
    expect(hits[0].name).toBe('Shrewsbury');
    expect(hits[0].detail).toBe('borough · Monmouth County, NJ');
    expect(hits[1].detail).toBe('township · Monmouth County, NJ');
  });
  it('a state or county in the query narrows it ("Springfield IL", "springfield missouri")', () => {
    const il = rankRows(rowsOf('spr'), 'Springfield IL', SEA_BRIGHT);
    expect(il.length).toBeGreaterThan(0);
    expect(il.every((h) => h.detail.endsWith(', IL'))).toBe(true);
    expect(il[0].kind).toBe('city');
    const mo = rankRows(rowsOf('spr'), 'springfield missouri');
    expect(mo[0].detail).toMatch(/Greene County, MO$/);
  });
  it('near the shore, New Jersey first; with no place given, the bigger town', () => {
    expect(rankRows(rowsOf('spr'), 'Springfield', SEA_BRIGHT)[0].detail).toMatch(/NJ$/);
    expect(rankRows(rowsOf('por'), 'Portland')[0].detail).toMatch(/Multnomah County, OR$/);
    expect(rankRows(rowsOf('por'), 'Portland', { lat: 43.66, lon: -70.26 })[0].detail).toMatch(/ME$/);
  });
  it('the whole name beats a longer one, and a partial last word still finds it', () => {
    const hits = rankRows(rowsOf('mon'), 'Monmouth Beach', SEA_BRIGHT);
    expect(hits[0].name).toBe('Monmouth Beach');
    expect(rankRows(rowsOf('mon'), 'monmouth bea', SEA_BRIGHT)[0].name).toBe('Monmouth Beach');
    expect(rankRows(rowsOf('sea'), 'Sea Bright', SEA_BRIGHT)[0].detail).toBe('borough · Monmouth County, NJ');
  });
  it('a national park ahead of the hamlet named for it', () => {
    const rows: PlaceRow[] = [
      { name: 'Yosemite', kind: 'community', st: 'KY', county: 'Casey County', lat: 37.34, lon: -84.83, w: 36 },
      { name: 'Yosemite National Park', kind: 'park', st: 'CA', county: 'Mariposa County', lat: 37.84, lon: -119.5, w: 69 },
    ];
    expect(rankRows(rows, 'Yosemite', { lat: 40, lon: -100 })[0].name).toBe('Yosemite National Park');
    // (a school or an airport named for the park doesn't share its fame)
    rows.push({ name: 'Grand Canyon National Park Airport', kind: 'airport', st: 'AZ', county: 'Coconino County', lat: 35.95, lon: -112.15, w: 71 },
      { name: 'Grand Canyon National Park', kind: 'park', st: 'AZ', county: 'Coconino County', lat: 36.06, lon: -112.14, w: 69 });
    expect(rankRows(rows, 'Grand Canyon')[0].name).toBe('Grand Canyon National Park');
  });
  it('every query word must match: nothing for a word no row has', () => {
    expect(rankRows(rowsOf('shr'), 'Shrewsbury Zanzibar', SEA_BRIGHT)).toEqual([]);
    expect(rankRows(rowsOf('shr'), '', SEA_BRIGHT)).toEqual([]);
  });
  it('one row per place (duplicates folded)', () => {
    const rows = rowsOf('shr');
    const hits = rankRows([...rows, ...rows], 'Shrewsbury', SEA_BRIGHT, 50);
    expect(new Set(hits.map((h) => `${h.name}|${h.detail}`)).size).toBe(hits.length);
  });
});

describe('place index: reverse lookups from the boundary tiles', () => {
  it('a point in Shrewsbury borough is Shrewsbury, Monmouth County, New Jersey', () => {
    expect(localityIn(tileAt(40.3297, -74.0617), 40.3297, -74.0617)).toEqual({ locality: 'Shrewsbury', region: 'Monmouth County, New Jersey' });
  });
  it('Sea Bright, on its barrier beach', () => {
    expect(localityIn(tileAt(40.3597, -73.975), 40.3597, -73.975)?.locality).toBe('Sea Bright');
  });
  it('Shrewsbury Township is its own town, two kilometres west', () => {
    expect(localityIn(tileAt(40.3132, -74.0715), 40.3132, -74.0715)?.locality).toBe('Shrewsbury');
    const t = tileAt(40.3132, -74.0715)!;
    const twp = t.b.find((b) => b.k === 'm' && b.n === 'Shrewsbury' && inRings(b.r, -74.0715, 40.3132));
    expect(twp).toBeTruthy();
  });
  it('out at sea there is no town', () => {
    expect(localityIn(tileAt(40.36, -73.9), 40.36, -73.9)).toBeNull();
    expect(localityIn(null, 40, -74)).toBeNull();
  });
  it('even-odd containment: a hole is outside', () => {
    const sq = (x0: number, y0: number, s: number) => [x0, y0, x0 + s, y0, x0 + s, y0 + s, x0, y0 + s].map((v) => v * 1e5);
    const rings = [sq(0, 0, 10), sq(4, 4, 2)];
    expect(inRings(rings, 1, 1)).toBe(true);
    expect(inRings(rings, 5, 5)).toBe(false);
    expect(inRings(rings, 11, 5)).toBe(false);
  });
  it('tiles are 0.25° a side, keyed from 180°W, 90°S', () => {
    expect(tileOf(40.3597, -73.975)).toEqual([424, 521]);
    expect(tileOf(-90, -180)).toEqual([0, 0]);
  });
});
