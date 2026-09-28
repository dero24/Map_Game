import { describe, it, expect } from 'vitest';
import { usZone, zoneAt } from '../src/world/tz';
import { localHour } from '../src/core/sun';

describe('the clock a place keeps', () => {
  it('names the zone of cities across the lower 48, Arizona apart', () => {
    const at: [string, number, number, string][] = [
      ['Seattle', 47.61, -122.33, 'America/Los_Angeles'], ['Portland', 45.52, -122.68, 'America/Los_Angeles'],
      ['Los Angeles', 34.05, -118.24, 'America/Los_Angeles'], ['Las Vegas', 36.17, -115.14, 'America/Los_Angeles'],
      ['Spokane', 47.66, -117.43, 'America/Los_Angeles'], ['Boise', 43.62, -116.2, 'America/Denver'],
      ['Salt Lake City', 40.76, -111.89, 'America/Denver'], ['Denver', 39.74, -104.99, 'America/Denver'],
      ['El Paso', 31.76, -106.49, 'America/Denver'], ['Albuquerque', 35.08, -106.65, 'America/Denver'],
      ['Phoenix', 33.45, -112.07, 'America/Phoenix'], ['Tucson', 32.22, -110.97, 'America/Phoenix'],
      ['Rapid City', 44.08, -103.23, 'America/Denver'], ['Bismarck', 46.81, -100.78, 'America/Chicago'],
      ['Dallas', 32.78, -96.8, 'America/Chicago'], ['Chicago', 41.88, -87.63, 'America/Chicago'],
      ['New Orleans', 29.95, -90.07, 'America/Chicago'], ['Nashville', 36.16, -86.78, 'America/Chicago'],
      ['Indianapolis', 39.77, -86.16, 'America/New_York'], ['Detroit', 42.33, -83.05, 'America/New_York'],
      ['Knoxville', 35.96, -83.92, 'America/New_York'], ['Atlanta', 33.75, -84.39, 'America/New_York'],
      ['Miami', 25.76, -80.19, 'America/New_York'], ['Sea Bright', 40.36, -73.97, 'America/New_York'],
      ['Boston', 42.36, -71.06, 'America/New_York'], ['Pensacola', 30.42, -87.22, 'America/Chicago'],
    ];
    for (const [name, lat, lon, z] of at) expect([name, usZone(lat, lon)]).toEqual([name, z]);
    expect(usZone(31.69, -106.42)).toBe(null); // Ciudad Juárez, across the river
    expect(usZone(25.67, -100.31)).toBe(null); // Monterrey
    expect(usZone(51.5, -0.12)).toBe(null);
    expect(zoneAt(51.5, -0.12)).toBe('Etc/GMT');
    expect(zoneAt(35.68, 139.69)).toBe('Etc/GMT-9');
  });
  it('keeps summer time: 18:20 in Seattle on 28 September is 01:20 UTC, not 02:20', () => {
    const ms = Date.UTC(2026, 8, 29, 1, 20);
    expect(localHour(ms, zoneAt(47.63, -122.36))).toBeCloseTo(18 + 20 / 60, 5);
    expect(localHour(Date.UTC(2026, 0, 15, 2, 20), zoneAt(47.63, -122.36))).toBeCloseTo(18 + 20 / 60, 5); // (January: standard time)
    expect(localHour(ms, zoneAt(33.45, -112.07))).toBeCloseTo(18 + 20 / 60, 5); // (Phoenix: PDT's clock all summer)
  });
});
