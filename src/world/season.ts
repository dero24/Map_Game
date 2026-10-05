// Seasons: what the date does to a place — snow on the ground, bare branches, autumn colour, the
// snowline on the far mountains. A pure function of latitude, longitude, the ground's elevation and
// the day of the year, so every visitor to a town on the same date sees the same season.
//
// The model is a coarse climatology, not weather: a January mean temperature from latitude, the
// climate class and the elevation (6 °C a kilometre), an annual swing by climate, and a two-week
// lag (snowpack and leaves follow the air). Snow lies where the lagged mean is near freezing;
// broadleaf trees drop their leaves below ~11 °C and colour on the way down in autumn.
import { climateAt, naSub, worldRegion, type Climate } from './styles';

export interface Season {
  /** 0..1 snow cover on the ground and roofs */
  snow: number;
  /** 0..1 share of a broadleaf crown's leaves that are down */
  leafFall: number;
  /** 0..1 autumn colour in the leaves still up */
  autumn: number;
  /** 0..1 how far through its turning the season is — rising from the first colour to the last leaf
   *  and never back (propMaterial: each tree turns at its own point of it) */
  turn: number;
  /** 0..1 spring blossom on the flowering trees (cherries): the warming weeks near 11 °C */
  bloom: number;
  /** 0..1 how far the warming half of the year has come, by the air: 0 at the winter's mean (or 5 °C,
   *  whichever is warmer) … 1 at 23 °C; 0 while the year cools. The flowering trees each open in their
   *  own window of it (treeSeasons.ts bloomNow): the redbud, the cherry, the dogwood, the rosebay in June —
   *  later up north and up a mountain, and north Florida's dogwoods no sooner than March */
  spring: number;
  /** 0..1 the summer's heat: 0 below 18 °C … 1 from 23 °C (the crape myrtle's cones, June to September) */
  summer: number;
  /** elevation (m) above which the far mountains are white */
  snowline: number;
  /** the lagged mean air temperature (°C) at the given elevation — for tests and tuning */
  temp: number;
}

const ADJ: Record<Climate, number> = { temperate: 0, continental: -6, boreal: -9, polar: -12, arid: 2, mediterranean: 3, tropical: 2 };
const SWING: Record<Climate, number> = { temperate: 20, continental: 28, boreal: 32, polar: 25, arid: 18, mediterranean: 12, tropical: 8 };

/** January mean (°C) at sea level and the annual swing for a place. */
export function climateNormals(lat: number, lon: number): { jan: number; swing: number } {
  const c = climateAt(lat, lon);
  let jan = 27 - 0.85 * Math.max(0, Math.abs(lat) - 15) + ADJ[c], swing = SWING[c];
  if (worldRegion(lat, lon) === 'na') {
    const sub = naSub(lat, lon);
    // the Pacific Northwest's mild marine winters; the continental cold of the East's coast
    if (sub === 'pnw') (jan += 5), (swing = 13);
    else if (lon > -100 && c === 'temperate') (jan -= 4), (swing = 24);
  }
  return { jan, swing };
}

/** Mean air temperature on day `doy` (1..366) at `elev` metres. */
export function meanTemp(lat: number, lon: number, elev: number, doy: number): number {
  const { jan, swing } = climateNormals(lat, lon);
  const d = lat < 0 ? doy + 182.5 : doy; // the southern year is half a turn round
  return jan - 6 * Math.max(0, elev) / 1000 + (swing * (1 - Math.cos((2 * Math.PI * (d - 20)) / 365.25))) / 2;
}

/** Hours of daylight at a latitude on a day of the year (sunrise to sunset, no refraction). */
export function dayLength(lat: number, doy: number): number {
  const decl = (-23.44 * Math.cos(((2 * Math.PI) / 365.25) * (doy + 10)) * Math.PI) / 180;
  const c = Math.max(-1, Math.min(1, -Math.tan((lat * Math.PI) / 180) * Math.tan(decl)));
  return (2 * ((Math.acos(c) * 180) / Math.PI)) / 15;
}

export function seasonAt(lat: number, lon: number, elev: number, doy: number): Season {
  const T = meanTemp(lat, lon, elev, doy - 12); // snowpack and leaves lag the air by a fortnight
  const snow = Math.min(1, Math.max(0, (2 - T) / 6));
  const leafFall = Math.min(1, Math.max(0, (11 - T) / 4));
  // colour turns on the way down (the cooling half of the year), peaking near 13 °C
  const d = lat < 0 ? doy + 182.5 : doy;
  const cooling = Math.sin((2 * Math.PI * (d - 20)) / 365.25) < 0;
  // …and only once the days shorten: trees read the night as well as the cold. A mild marine
  // autumn (Seattle's September is ~15 °C) waits for October's short days; the tropics never turn.
  const photo = Math.min(1, Math.max(0, (11.9 - dayLength(lat, doy)) / 1.3));
  const autumn = cooling ? Math.min(photo, Math.min(1, Math.max(0, 1 - Math.abs(T - 13) / 5))) * (1 - 0.5 * leafFall) : 0;
  // (after the coldest turn of the year the colour doesn't vanish overnight: what the season had
  // turned at the switch fades as the spring warms by 3 °C — a mild winter's still-coloured crowns
  // go green with their new leaves, not on the 20th of January)
  const turnOf = (t: number, ph: number) => Math.min(ph, Math.min(1, Math.max(0, (18 - t) / 7)));
  let turn = cooling ? turnOf(T, photo) : 0;
  if (!cooling) {
    const sw = lat < 0 ? 202.75 : 20; // the day the year stops cooling (d = 20)
    const Tsw = meanTemp(lat, lon, elev, sw - 12), phsw = Math.min(1, Math.max(0, (11.9 - dayLength(lat, sw)) / 1.3));
    turn = turnOf(Tsw, phsw) * Math.min(1, Math.max(0, 1 - (T - Tsw) / 3));
  }
  // (the unlagged air: blossom opens with the first warm weeks, before the canopy has filled)
  const Ta = meanTemp(lat, lon, elev, doy);
  const bloom = !cooling ? Math.min(1, Math.max(0, 1 - Math.abs(Ta - 11.5) / 3.5)) : 0;
  // (a mild winter's flowers wait for real warmth, not the first day the year turns: from the winter's
  // own mean, never below 5 °C)
  const low = Math.max(5, meanTemp(lat, lon, elev, lat < 0 ? 202.75 : 20) + 1.5);
  const spring = !cooling ? Math.min(1, Math.max(0, (Ta - low) / Math.max(4, 23 - low))) : 0;
  const summer = Math.min(1, Math.max(0, (Ta - 18) / 5));
  // the far mountains: white where the (unlagged-enough) mean at that height is below −2 °C
  const sea = meanTemp(lat, lon, 0, doy - 12);
  const snowline = Math.max(250, ((sea + 2) / 6.5) * 1000);
  return { snow, leafFall, autumn, turn, bloom, spring, summer, snowline, temp: T };
}

/** Day of the year (1..366) of a timestamp, in UTC. */
export function dayOfYear(ms: number): number {
  const d = new Date(ms), start = Date.UTC(d.getUTCFullYear(), 0, 1);
  return Math.floor((ms - start) / 86400000) + 1;
}

/** The day's clouds when the weather runs by itself (main.ts autoWeather): a slow beat of fair and
 *  overcast spells, the same for everyone. `t`: the world's hours. */
export const autoCloud = (t: number) => 0.3 + 0.3 * Math.sin(t * 0.37 + 1.3) * Math.sin(t * 0.11);
/** How wet the trees are at world hour `t`: 1 through a wet spell (the heaviest overcast, when it
 *  rains), drying over the next day or two (e-folding 30 h) — the resurrection fern greens within hours
 *  of rain and curls brown in a dry spell (assets/hangers.ts). */
export function wetness(t: number): number {
  for (let h = 0; h <= 120; h += 2) if (autoCloud(t - h) > 0.47) return Math.exp(-h / 30);
  return 0;
}
