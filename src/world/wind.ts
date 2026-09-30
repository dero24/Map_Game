// Winds aloft — what a balloon rides. Real wind turns clockwise and strengthens with height (the
// surface slows it and backs it; aloft it runs along the isobars), so each height is a different
// road: a balloonist steers by climbing or sinking into the layer that goes their way.
//
// Four layers (the surface, ~200 m, ~600 m, ~1,500 m), interpolated between. Deterministic: the
// same for every visitor at the same place and hour (hard constraint 3) — seeded by a region key
// and the hour of the day on the clock of the world (UTC hours since the epoch), eased from one hour
// to the next so it never jumps under you.

import { hashf } from '../assets/core';

export const WIND_LAYERS = [0, 200, 600, 1500];
export interface WindLayer { y: number; dir: number; speed: number } // dir: radians the wind blows TOWARD, 0 = north (−z), clockwise

/** The layers for region `key` at `hour` (fractional hours since the epoch). */
export function windLayers(key: number, hour: number): WindLayer[] {
  const h0 = Math.floor(hour), f = hour - h0, e = f * f * (3 - 2 * f);
  const at = (h: number) => {
    const u = (k: number) => hashf(key * 7919 + h * 104729 + k * 613);
    const base = u(0) * Math.PI * 2; // the surface wind's heading this hour
    const gust = 0.7 + u(1) * 0.6; // a calm hour or a brisk one
    // veering with height, each layer a clear turn from the last (30–70°), and faster
    return WIND_LAYERS.map((y, i) => ({
      y,
      dir: base + [0, 0.5 + u(2) * 0.7, 1.2 + u(3) * 0.8, 2.0 + u(4) * 0.9][i],
      speed: [2.2, 4.5, 7, 10.5][i] * gust * (0.8 + u(5 + i) * 0.4),
    }));
  };
  const a = at(h0), b = at(h0 + 1);
  return a.map((l, i) => {
    let d = b[i].dir - l.dir;
    d = ((d + Math.PI) % (2 * Math.PI) + 2 * Math.PI) % (2 * Math.PI) - Math.PI; // (the short way round)
    return { y: l.y, dir: l.dir + d * e, speed: l.speed + (b[i].speed - l.speed) * e };
  });
}

/** The wind (m/s, world x east / z south) at height `y` above the ground, from the layers. */
export function windAt(layers: WindLayer[], y: number): [number, number] {
  let i = 0;
  while (i + 1 < layers.length && layers[i + 1].y <= y) i++;
  const a = layers[i], b = layers[Math.min(i + 1, layers.length - 1)];
  const t = b === a ? 0 : Math.max(0, Math.min(1, (y - a.y) / (b.y - a.y)));
  const vec = (l: WindLayer) => [Math.sin(l.dir) * l.speed, -Math.cos(l.dir) * l.speed];
  const [ax, az] = vec(a), [bx, bz] = vec(b);
  return [ax + (bx - ax) * t, az + (bz - az) * t];
}

/** A region's key from its origin (lat/lon to 0.25°: neighbouring towns share their weather). */
export const windKey = (lat: number, lon: number) => Math.round(lat * 4) * 4099 + Math.round(lon * 4) * 31;
/** The hour of the world's clock (the same for everyone right now). */
export const windHour = (nowMs = Date.now()) => nowMs / 3.6e6;
/** A compass word for a heading (the way the wind blows toward). */
export function compassArrow(dir: number) {
  const a = ['↑', '↗', '→', '↘', '↓', '↙', '←', '↖'];
  return a[((Math.round(dir / (Math.PI / 4)) % 8) + 8) % 8];
}
