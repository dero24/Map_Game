// Solar + lunar position (NOAA-style low-precision ephemeris; ~0.1 deg, plenty for painting light).
// Local frame: +x east, +y up, +z south.

const RAD = Math.PI / 180;

export interface CelestialState {
  sunDir: [number, number, number];
  sunElevation: number; // degrees
  sunAzimuth: number; // degrees clockwise from north
  moonDir: [number, number, number];
  moonElevation: number;
  moonPhase: number; // 0 new .. 0.5 full .. 1 new
  moonIllum: number; // 0..1 lit fraction
}

const julian = (ms: number) => ms / 86400000 + 2440587.5;

function dirFromAltAz(altDeg: number, azDeg: number): [number, number, number] {
  const alt = altDeg * RAD, az = azDeg * RAD;
  // azimuth clockwise from north: north = -z, east = +x
  return [Math.cos(alt) * Math.sin(az), Math.sin(alt), -Math.cos(alt) * Math.cos(az)];
}

function altAz(raDeg: number, decDeg: number, jd: number, lat: number, lon: number) {
  const d = jd - 2451545.0;
  const gmst = (280.46061837 + 360.98564736629 * d) % 360;
  const ha = ((gmst + lon - raDeg) % 360 + 360) % 360;
  const H = ha * RAD, dec = decDeg * RAD, phi = lat * RAD;
  const alt = Math.asin(Math.sin(phi) * Math.sin(dec) + Math.cos(phi) * Math.cos(dec) * Math.cos(H));
  const az = Math.atan2(-Math.sin(H), Math.tan(dec) * Math.cos(phi) - Math.sin(phi) * Math.cos(H));
  return { alt: alt / RAD, az: ((az / RAD) % 360 + 360) % 360 };
}

export function sunPosition(ms: number, lat: number, lon: number) {
  const jd = julian(ms);
  const n = jd - 2451545.0;
  const L = (280.46 + 0.9856474 * n) % 360;
  const g = ((357.528 + 0.9856003 * n) % 360) * RAD;
  const lambda = (L + 1.915 * Math.sin(g) + 0.02 * Math.sin(2 * g)) * RAD;
  const eps = (23.439 - 0.0000004 * n) * RAD;
  const ra = Math.atan2(Math.cos(eps) * Math.sin(lambda), Math.cos(lambda)) / RAD;
  const dec = Math.asin(Math.sin(eps) * Math.sin(lambda)) / RAD;
  return altAz(ra, dec, jd, lat, lon);
}

export function moonPosition(ms: number, lat: number, lon: number) {
  const jd = julian(ms);
  const d = jd - 2451545.0;
  const L = (218.316 + 13.176396 * d) * RAD;
  const M = (134.963 + 13.064993 * d) * RAD;
  const F = (93.272 + 13.22935 * d) * RAD;
  const lambda = L + 6.289 * RAD * Math.sin(M);
  const beta = 5.128 * RAD * Math.sin(F);
  const eps = 23.439 * RAD;
  const ra = Math.atan2(Math.sin(lambda) * Math.cos(eps) - Math.tan(beta) * Math.sin(eps), Math.cos(lambda)) / RAD;
  const dec = Math.asin(Math.sin(beta) * Math.cos(eps) + Math.cos(beta) * Math.sin(eps) * Math.sin(lambda)) / RAD;
  const phase = (((jd - 2451550.1) / 29.530588853) % 1 + 1) % 1;
  return { ...altAz(ra, dec, jd, lat, lon), phase, illum: (1 - Math.cos(phase * 2 * Math.PI)) / 2 };
}

export function celestial(ms: number, lat: number, lon: number): CelestialState {
  const s = sunPosition(ms, lat, lon);
  const m = moonPosition(ms, lat, lon);
  return {
    sunDir: dirFromAltAz(s.alt, s.az),
    sunElevation: s.alt,
    sunAzimuth: s.az,
    moonDir: dirFromAltAz(m.alt, m.az),
    moonElevation: m.alt,
    moonPhase: m.phase,
    moonIllum: m.illum,
  };
}

// Offset (minutes) of an IANA timezone from UTC at a given instant (handles DST via Intl).
export function tzOffsetMinutes(ms: number, tz: string): number {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: tz, hourCycle: 'h23', year: 'numeric', month: 'numeric', day: 'numeric', hour: 'numeric', minute: 'numeric',
  }).formatToParts(new Date(ms));
  const get = (t: string) => Number(parts.find((p) => p.type === t)!.value);
  const asUtc = Date.UTC(get('year'), get('month') - 1, get('day'), get('hour'), get('minute'));
  return Math.round((asUtc - Math.floor(ms / 60000) * 60000) / 60000);
}

// Epoch ms for a given local (region-tz) date + fractional hour.
export function localToMs(baseMs: number, hour: number, tz: string): number {
  const off = tzOffsetMinutes(baseMs, tz);
  const local = new Date(baseMs + off * 60000);
  const midnightLocalAsUtc = Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate());
  return midnightLocalAsUtc - off * 60000 + hour * 3600000;
}

export function localHour(ms: number, tz: string): number {
  const off = tzOffsetMinutes(ms, tz);
  const d = new Date(ms + off * 60000);
  return d.getUTCHours() + d.getUTCMinutes() / 60 + d.getUTCSeconds() / 3600;
}
