import { describe, it, expect } from 'vitest';
import { ecoAt, ecoCell, regionOf, pnwWestside, ECO_REGIONS, type EcoRegion } from '../src/world/ecoregions';
import { ECO_GRID } from '../src/world/ecoGrid';
import { regionStyle, styleByKey, styleFor, castOf } from '../src/world/styles';
import { broadMix, plantMix, understoryMix } from '../src/assets/flora';
import { faunaMix } from '../src/assets/fauna';

// Towns each region's reference names in its "Covers" (docs/regional-life/01–16), lat/lon.
const TOWNS: Record<EcoRegion, [string, number, number][]> = {
  'new-england': [['Boston', 42.36, -71.06], ['Portland ME', 43.66, -70.26], ['Burlington VT', 44.48, -73.21], ['Hartford', 41.76, -72.67], ['Providence', 41.82, -71.41], ['Bar Harbor', 44.39, -68.2], ['Provincetown', 42.05, -70.19], ['Concord NH', 43.21, -71.54]],
  'upstate-ny': [['Albany', 42.65, -73.75], ['Buffalo', 42.89, -78.88], ['Rochester', 43.16, -77.61], ['Syracuse', 43.05, -76.15], ['Lake Placid', 44.28, -73.98], ['Ithaca', 42.44, -76.5], ['Poughkeepsie', 41.7, -73.92], ['Binghamton', 42.1, -75.91], ['Plattsburgh', 44.7, -73.45], ['NY-73 Keene Valley', 44.19, -73.79]],
  'mid-atlantic': [['Midtown Manhattan', 40.758, -73.985], ['Brooklyn', 40.68, -73.94], ['Sea Bright', 40.36, -73.97], ['Philadelphia', 39.95, -75.17], ['Baltimore', 39.29, -76.61], ['Washington DC', 38.9, -77.04], ['Dover DE', 39.16, -75.52], ['Virginia Beach', 36.85, -75.98], ['Norfolk', 36.85, -76.29], ['Arlington VA', 38.88, -77.1], ['Montauk', 41.04, -71.95], ['Atlantic City', 39.36, -74.42]],
  appalachia: [['Pittsburgh', 40.44, -80.0], ['State College', 40.79, -77.86], ['Charleston WV', 38.35, -81.63], ['Lexington KY', 38.04, -84.5], ['Louisville', 38.25, -85.76], ['Knoxville', 35.96, -83.92], ['Nashville', 36.16, -86.78], ['Chattanooga', 35.05, -85.31], ['Asheville', 35.6, -82.55], ['Boone NC', 36.22, -81.67], ['Roanoke', 37.27, -79.94], ['Gatlinburg', 35.71, -83.51], ['Birmingham AL', 33.52, -86.8], ['Scranton', 41.41, -75.66], ['Athens OH', 39.33, -82.1]],
  southeast: [['Charlotte', 35.23, -80.84], ['Raleigh', 35.78, -78.64], ['Atlanta', 33.75, -84.39], ['Savannah', 32.08, -81.09], ['Charleston SC', 32.78, -79.93], ['Columbia SC', 34.0, -81.03], ['Myrtle Beach', 33.69, -78.89], ['Wilmington NC', 34.23, -77.94], ['Macon', 32.84, -83.63], ['Augusta', 33.47, -81.97], ['Danville VA', 36.59, -79.4], ['Nags Head', 35.96, -75.62], ['Hilton Head', 32.22, -80.75], ['Montgomery', 32.37, -86.3], ['Meridian MS', 32.36, -88.7]],
  florida: [['Miami', 25.76, -80.19], ['Orlando', 28.54, -81.38], ['Tampa', 27.95, -82.46], ['Jacksonville', 30.33, -81.66], ['Gainesville', 29.65, -82.32], ['Key West', 24.56, -81.78], ['Naples', 26.14, -81.79], ['Ocala', 29.19, -82.14]],
  gulf: [['New Orleans', 29.95, -90.07], ['Baton Rouge', 30.45, -91.19], ['Lafayette LA', 30.22, -92.02], ['Shreveport', 32.53, -93.75], ['Mobile', 30.69, -88.04], ['Gulfport', 30.37, -89.09], ['Pensacola', 30.42, -87.22], ['Tallahassee', 30.44, -84.28], ['Panama City', 30.16, -85.66], ['Memphis', 35.15, -90.05], ['Greenville MS', 33.41, -91.06], ['Hattiesburg', 31.33, -89.29]],
  texas: [['Austin', 30.27, -97.74], ['Houston', 29.76, -95.37], ['Dallas', 32.78, -96.8], ['San Antonio', 29.42, -98.49], ['Fredericksburg', 30.27, -98.87], ['Lubbock', 33.58, -101.86], ['Amarillo', 35.22, -101.83], ['Corpus Christi', 27.8, -97.4], ['Brownsville', 25.9, -97.5], ['Beaumont', 30.08, -94.13], ['Tyler', 32.35, -95.3], ['Laredo', 27.51, -99.51], ['Abilene', 32.45, -99.73]],
  plains: [['Wichita', 37.69, -97.34], ['Omaha', 41.26, -95.93], ['Lincoln', 40.81, -96.7], ['Oklahoma City', 35.47, -97.52], ['Tulsa', 36.15, -95.99], ['Fargo', 46.88, -96.79], ['Sioux Falls', 43.55, -96.73], ['Bismarck', 46.81, -100.78], ['Billings', 45.78, -108.5], ['Cheyenne', 41.14, -104.82], ['Greeley', 40.42, -104.71], ['Topeka', 39.05, -95.68], ['Dodge City', 37.75, -100.02]],
  midwest: [['Chicago', 41.88, -87.63], ['Detroit', 42.33, -83.05], ['Cleveland', 41.5, -81.69], ['Columbus OH', 39.96, -83.0], ['Cincinnati', 39.1, -84.51], ['Indianapolis', 39.77, -86.16], ['Milwaukee', 43.04, -87.91], ['Minneapolis', 44.98, -93.27], ['Des Moines', 41.59, -93.62], ['St. Louis', 38.63, -90.2], ['Kansas City MO', 39.1, -94.58], ['Columbia MO', 38.95, -92.33], ['Madison', 43.07, -89.4], ['Duluth', 46.79, -92.1], ['Marquette', 46.54, -87.4], ['Erie PA', 42.13, -80.09], ['Bloomington IN', 39.17, -86.53]],
  ozarks: [['Springfield MO', 37.21, -93.29], ['Branson', 36.64, -93.22], ['Fayetteville AR', 36.06, -94.16], ['Bentonville', 36.37, -94.21], ['Eureka Springs', 36.4, -93.74], ['Hot Springs', 34.5, -93.06], ['Mena', 34.59, -94.24], ['Tahlequah', 35.92, -94.97], ['Broken Bow', 34.03, -94.74], ['Mountain View AR', 35.87, -92.12]],
  rockies: [['Denver', 39.74, -104.99], ['Boulder', 40.01, -105.27], ['Fort Collins', 40.59, -105.08], ['Colorado Springs', 38.83, -104.82], ['Estes Park', 40.38, -105.52], ['Aspen', 39.19, -106.82], ['Bozeman', 45.68, -111.04], ['Missoula', 46.87, -113.99], ['Jackson WY', 43.48, -110.76], ["Coeur d'Alene", 47.68, -116.78], ['Whitefish', 48.41, -114.34], ['Sun Valley', 43.7, -114.35]],
  'desert-sw': [['Phoenix', 33.45, -112.07], ['Tucson', 32.22, -110.97], ['Las Vegas', 36.17, -115.14], ['Palm Springs', 33.83, -116.55], ['El Paso', 31.76, -106.49], ['Albuquerque', 35.08, -106.65], ['Santa Fe', 35.69, -105.94], ['Las Cruces', 32.31, -106.78], ['Yuma', 32.69, -114.63], ['Prescott', 34.54, -112.47], ['St. George', 37.1, -113.58], ['Barstow', 34.9, -117.02], ['Alpine TX', 30.36, -103.66]],
  'great-basin': [['Reno', 39.53, -119.81], ['Salt Lake City', 40.76, -111.89], ['Boise', 43.62, -116.2], ['Moab', 38.57, -109.55], ['Flagstaff', 35.2, -111.65], ['Grand Junction', 39.06, -108.55], ['Elko', 40.83, -115.76], ['Twin Falls', 42.56, -114.46], ['Farmington NM', 36.73, -108.21], ['Gallup', 35.53, -108.74], ['Rock Springs', 41.59, -109.2]],
  california: [['San Francisco', 37.77, -122.42], ['Los Angeles', 34.05, -118.24], ['San Diego', 32.72, -117.16], ['Sacramento', 38.58, -121.49], ['Fresno', 36.74, -119.79], ['Eureka', 40.8, -124.16], ['Monterey', 36.6, -121.89], ['Yosemite Valley', 37.74, -119.59], ['South Lake Tahoe', 38.94, -119.98], ['Redding', 40.59, -122.39], ['Santa Barbara', 34.42, -119.7], ['Mount Shasta', 41.31, -122.31], ['Bakersfield', 35.37, -119.02]],
  pnw: [['Seattle', 47.61, -122.33], ['Portland OR', 45.52, -122.68], ['Tacoma', 47.25, -122.44], ['Eugene', 44.05, -123.09], ['Bend', 44.06, -121.31], ['Spokane', 47.66, -117.43], ['Yakima', 46.6, -120.51], ['Astoria', 46.19, -123.83], ['Hoh rainforest', 47.86, -123.93], ['Longmire', 46.75, -121.81], ['Medford', 42.33, -122.87], ['Walla Walla', 46.06, -118.34], ['Bellingham', 48.75, -122.48], ['Cannon Beach', 45.89, -123.96], ['Pendleton', 45.67, -118.79]],
};

describe('regions as data: the EPA ecoregion grid', () => {
  it('decodes to the lower 48: every cell a code 0–85 and a state, land where the map has it', () => {
    expect(ECO_GRID.rows * ECO_GRID.cols).toBe(520 * 1180);
    expect(ecoCell(39.74, -104.99)).toEqual({ l3: 25, state: 'CO' }); // Denver on the High Plains' edge
    expect(ecoCell(45, -40)).toBeNull(); // the open Atlantic
    expect(ecoCell(51, -100)).toBeNull(); // Canada
    expect(ecoCell(19.4, -99.1)).toBeNull(); // Mexico City
  });

  it('every town each region names resolves to that region', () => {
    const wrong: string[] = [];
    for (const r of ECO_REGIONS)
      for (const [name, lat, lon] of TOWNS[r]) {
        const p = ecoAt(lat, lon);
        if (p?.region !== r) wrong.push(`${name}: ${p ? `${p.region} (EPA ${p.l3}, ${p.state})` : 'none'}, not ${r}`);
      }
    expect(wrong).toEqual([]);
  });

  it('a coastal town on a spit or a key the 5 km cells miss takes the nearest land', () => {
    expect(ecoAt(40.36, -73.97)?.state).toBe('NJ'); // Sea Bright
    expect(ecoAt(24.56, -81.78)?.region).toBe('florida'); // Key West
    expect(ecoAt(35.25, -75.53)?.region).toBe('southeast'); // Cape Hatteras
  });

  it('the Northwest splits at the Cascades: fir, cedar and moss west, ponderosa and sage east', () => {
    for (const [, lat, lon] of [['Seattle', 47.61, -122.33], ['Portland', 45.52, -122.68], ['Hoh', 47.86, -123.93], ['Longmire', 46.75, -121.81], ['Astoria', 46.19, -123.83]] as const)
      expect(pnwWestside(ecoAt(lat, lon))).toBe(true);
    for (const [, lat, lon] of [['Bend', 44.06, -121.31], ['Spokane', 47.66, -117.43], ['Yakima', 46.6, -120.51], ['Pendleton', 45.67, -118.79]] as const)
      expect(pnwWestside(ecoAt(lat, lon))).toBe(false);
    expect(ecoAt(46.19, -123.83)?.l3).toBe(1); // Astoria: the Coast Range, the Sitka spruce's fog belt
  });

  it('the code table covers all 85 ecoregions', () => {
    for (let c = 1; c <= 85; c++) expect(regionOf(c, 'XX', 40, -100)).not.toBeNull();
  });
});

describe('the casts follow the land (regionStyle → broadMix, plantMix, faunaMix, understoryMix)', () => {
  const cast = (lat: number, lon: number) => {
    const st = regionStyle(lat, lon), p = castOf(st);
    return { st, p, broad: JSON.stringify(broadMix(p)), garden: JSON.stringify(plantMix(st.climate, st.eco)), fauna: faunaMix(st.region, st.climate, p), floor: understoryMix(p) };
  };
  it('the style key carries the place, and round-trips', () => {
    const st = regionStyle(38.04, -84.5);
    expect(st.eco).toBe('appalachia');
    expect(st.key.split('/')[5]).toBe(`appalachia.${st.l3}.KY`);
    expect(styleByKey(st.key)).toEqual(st);
    expect(regionStyle(48.86, 2.35).eco).toBe(''); // Paris: the climate's casts
    expect(regionStyle(48.86, 2.35).key.split('/').length).toBe(4);
  });
  it('a key pinned before the regions takes its place from the origin', () => {
    const st = styleFor({ style: 'temperate/clapboard/R/na/northeast' }, { lat: 40.362, lon: -73.9755 });
    expect(st.eco).toBe('mid-atlantic');
    expect(st.state).toBe('NJ');
    expect(st.family).toBe('clapboard');
  });
  it('Kentucky and Ohio, Savannah and Raleigh, Austin and Phoenix each get their own', () => {
    const ky = cast(38.04, -84.5), oh = cast(39.96, -83.0);
    expect(ky.st.eco).toBe('appalachia');
    expect(oh.st.eco).toBe('midwest');
    expect(ky.broad).not.toBe(oh.broad);
    expect(ky.garden).not.toBe(oh.garden);
    const sav = cast(32.08, -81.09), ral = cast(35.78, -78.64);
    expect(sav.broad).not.toBe(ral.broad);
    expect(sav.fauna.shorebird?.some(([k]) => k === 'ibis')).toBe(true); // the coastal plain's marsh birds
    expect(ral.fauna.shorebird?.some(([k]) => k === 'ibis')).toBeFalsy();
    const aus = cast(30.27, -97.74), phx = cast(33.45, -112.07);
    expect(aus.st.eco).toBe('texas');
    expect(phx.st.eco).toBe('desert-sw');
    expect(aus.garden).not.toBe(phx.garden);
    expect(aus.fauna.firefly).toBeTruthy();
    expect(phx.fauna.firefly).toBeFalsy();
  });
  it('fireflies flash only east of the Plains (ranges.md)', () => {
    for (const [lat, lon] of [[39.74, -104.99], [33.45, -112.07], [40.76, -111.89], [37.77, -122.42], [47.61, -122.33], [44.06, -121.31], [46.81, -100.78], [33.58, -101.86]])
      expect(cast(lat, lon).fauna.firefly, `${lat},${lon}`).toBeFalsy();
    for (const [lat, lon] of [[40.362, -73.9755], [38.04, -84.5], [41.88, -87.63], [32.08, -81.09], [37.21, -93.29], [39.05, -95.68]])
      expect(cast(lat, lon).fauna.firefly, `${lat},${lon}`).toBeTruthy();
  });
  it('the shore keeps its look: the Mid-Atlantic is the original temperate set', () => {
    const shore = cast(40.362, -73.9755), old = styleByKey('temperate/clapboard/R/na/northeast')!;
    expect(shore.st.eco).toBe('mid-atlantic');
    expect(shore.st.trees).toEqual(old.trees);
    expect(shore.st.moss).toBe(old.moss);
    // (its original trees at their original weights; package #4 adds the Mid-Atlantic's own natives —
    // the tulip tree, sweetgum, dogwood, redbud, hickory and redcedar — and no crape myrtle in New Jersey)
    const now = JSON.parse(shore.broad) as [string, number][], before = broadMix({ ...castOf(old) });
    expect(now.slice(0, before.length)).toEqual(before);
    expect(now.slice(before.length).map(([k]) => k).sort()).toEqual(['dogwood', 'hickory', 'redbud', 'redcedar', 'sweetgum', 'tuliptree']);
    // (its animals as they were; its birds the East's backyard birds, package #11 — the generic songbird
    // still first, the robin, the cardinal, the jay, the dove, the crow and the town's pigeons with it —
    // and package #12's water and big birds: the hawk still first among the raptors)
    // and package #13's mammals: the grey squirrel still first up the trees, the chipmunk and woodchuck,
    // the raccoon, the skunk and the opossum at night)
    // (and package #14's: a black bear now and then at the wood's edge, the deer still first; package #15's
    // painted turtles and sliders on the logs)
    const { songbird: birds, raptor, waterfowl, wader, gull, fowl, climber, burrower, forager, browser, basker, ...rest } = shore.fauna, { songbird: old0, raptor: raptor0, climber: climber0, browser: browser0, ...rest0 } = faunaMix('na', 'temperate');
    expect(rest).toEqual(rest0);
    expect(raptor![0]).toEqual(raptor0![0]);
    expect(climber![0]).toEqual(climber0![0]);
    expect(browser![0]).toEqual(browser0![0]);
    for (const r of [waterfowl, wader, gull, fowl, burrower, forager, basker]) expect(r!.length).toBeGreaterThan(0);
    expect(birds![0]).toEqual(old0![0]);
    expect(birds!.map(([k]) => k)).toEqual(expect.arrayContaining(['robin', 'cardinal', 'bluejay', 'mourningdove', 'crow', 'pigeon']));
  });
  it("the Northwest: the westside's firs, alders and sword fern; the dry side's ponderosa and no bigleaf moss", () => {
    const sea = cast(47.61, -122.33), bend = cast(44.06, -121.31);
    expect(sea.p.west).toBe(true);
    expect(sea.st.moss).toBe(1);
    expect(sea.floor.mix.map(([s]) => s)).toContain('swordfern');
    expect(JSON.parse(sea.broad).map(([k]: [string]) => k)).toContain('alder');
    expect(bend.p.west).toBe(false);
    expect(bend.st.moss).toBeLessThan(0.2);
    expect(bend.floor.mix.length).toBe(0);
    expect(JSON.parse(bend.broad).map(([k]: [string]) => k)).not.toContain('alder');
    expect(bend.st.trees[3]).toBeGreaterThan(bend.st.trees[0]); // ponderosa country
    expect(bend.fauna.browser?.[0][0]).toBe('muleDeer');
  });
});
