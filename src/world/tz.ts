// The clock a place keeps. The open world had only a longitude zone (Etc/GMT+8 for Seattle):
// honest anywhere, but never on daylight saving — every summer frame in the lower 48 was an hour
// late ("golden hour" at 18:20 on 28 September put Seattle's sun 5° under the horizon). In the
// contiguous US the browser's own tz database answers once the place has a zone name, so the four
// zone lines are drawn here as the latitude-by-latitude longitude they run along (county-level
// jogs smoothed; a town within ~20 km of a line may land on the wrong side), Arizona apart (no
// DST). Anywhere else keeps its longitude zone.

type Line = [number, number][]; // [lat, lon] north to south
// Pacific | Mountain: the Idaho–Montana line down to the Salmon River, the Snake, Oregon's
// Malheur County, then Nevada's eastern border
const PM: Line = [[49.5, -116.05], [47.5, -115.7], [47, -115.3], [46.5, -114.6], [45.62, -114.5], [45.6, -116.9], [44.31, -116.9], [44.3, -118.2], [42.01, -118.2], [42, -114.05], [37, -114.05], [36, -114.6], [32, -114.7], [24, -114.7]];
// Mountain | Central: the Missouri across the Dakotas, western Nebraska and Kansas, the Texas–New
// Mexico line, then west Texas round El Paso
const MC: Line = [[49.5, -104.05], [48, -102], [47, -101.3], [46, -101], [45, -100.5], [44, -100.5], [43, -100.9], [42, -101.2], [41, -101.4], [40, -101.6], [38, -101.8], [37.01, -101.8], [37, -103], [32.01, -103.06], [32, -104.9], [24, -104.9]];
// Central | Eastern: Michigan's western Upper Peninsula, Lake Michigan, Indiana's corners,
// Kentucky and Tennessee's plateau, the Alabama–Georgia line, the Florida panhandle's river
const CE: Line = [[49.5, -88.5], [47, -88.3], [46, -87.6], [45.5, -87.4], [45, -87.2], [42, -87], [41.8, -87.2], [41.5, -86.9], [41, -87.5], [39, -87.5], [38.5, -87.2], [38, -86.3], [37.5, -86], [37, -85.9], [36.5, -85.1], [35.5, -85.2], [35, -85.4], [34, -85.5], [33, -85.2], [32, -85], [30.5, -85], [30, -85.3], [29.5, -85.4], [29.4, -87.6], [24, -87.6]];

/** The line's longitude at a latitude (linear between its points). */
function lonAt(line: Line, lat: number): number {
  if (lat >= line[0][0]) return line[0][1];
  for (let i = 1; i < line.length; i++) {
    const [la0, lo0] = line[i - 1], [la1, lo1] = line[i];
    if (lat >= la1) return la0 === la1 ? lo1 : lo0 + ((lo1 - lo0) * (lat - la0)) / (la1 - la0);
  }
  return line[line.length - 1][1];
}

// the Mexican border, west to east ([lon, lat]): south of it is Mexico, which keeps no summer time
const MX: [number, number][] = [[-117.13, 32.53], [-114.72, 32.72], [-114.81, 32.49], [-111.07, 31.33], [-108.21, 31.33], [-108.21, 31.78], [-106.53, 31.78], [-105, 30.68], [-104, 29.3], [-103.2, 28.97], [-102.4, 29.8], [-101.4, 29.77], [-100.9, 29.36], [-100.3, 28.2], [-99.5, 27.5], [-99.1, 26.4], [-98.3, 26.1], [-97.14, 25.95]];
const mexican = (lat: number, lon: number) => {
  if (lon < MX[0][0] || lon > MX[MX.length - 1][0]) return false;
  for (let i = 1; i < MX.length; i++) {
    const [x0, y0] = MX[i - 1], [x1, y1] = MX[i];
    if (lon <= x1) return lat < (x1 === x0 ? Math.min(y0, y1) : y0 + ((y1 - y0) * (lon - x0)) / (x1 - x0));
  }
  return false;
};

/** The IANA zone of a place in the contiguous United States — null outside it. (Southern Ontario
 *  and Québec inside the box read as New York — the same clock.) */
export function usZone(lat: number, lon: number): string | null {
  if (lat < 24.4 || lat > 49.4 || lon < -124.9 || lon > -66.8 || mexican(lat, lon)) return null;
  if (lat > 31.3 && lat < 37 && lon > -114.8 && lon < -109.05) return 'America/Phoenix'; // Arizona keeps standard time
  if (lon < lonAt(PM, lat)) return 'America/Los_Angeles';
  if (lon < lonAt(MC, lat)) return 'America/Denver';
  if (lon < lonAt(CE, lat)) return 'America/Chicago';
  return 'America/New_York';
}

/** A place's zone: its US zone, else its longitude zone (POSIX sign: Etc/GMT-N == UTC+N). */
export function zoneAt(lat: number, lon: number): string {
  const us = usZone(lat, lon);
  if (us) return us;
  const zh = Math.round(lon / 15);
  return zh === 0 ? 'Etc/GMT' : zh > 0 ? `Etc/GMT-${zh}` : `Etc/GMT+${-zh}`;
}
