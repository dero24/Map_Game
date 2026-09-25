// Terrarium tile sampler: elevation(m) = R*256 + G + B/256 - 32768.
import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { PNG } from 'pngjs';
import { RAW } from '../config.mjs';

export function terrainSampler(z) {
  const cache = new Map();
  const tile = (x, y) => {
    const k = `${x}_${y}`;
    if (!cache.has(k)) {
      const f = resolve(RAW, 'terrain', String(z), `${k}.png`);
      cache.set(k, existsSync(f) ? PNG.sync.read(readFileSync(f)) : null);
    }
    return cache.get(k);
  };
  const px = (x, y) => {
    const tx = Math.floor(x / 256), ty = Math.floor(y / 256);
    const t = tile(tx, ty);
    if (!t) return NaN;
    const i = ((y - ty * 256) * 256 + (x - tx * 256)) * 4;
    return t.data[i] * 256 + t.data[i + 1] + t.data[i + 2] / 256 - 32768;
  };
  // Bilinear sample at lat/lon.
  return (lat, lon) => {
    const n = 2 ** z;
    const fx = ((lon + 180) / 360) * n * 256 - 0.5;
    const r = (lat * Math.PI) / 180;
    const fy = ((1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2) * n * 256 - 0.5;
    const x0 = Math.floor(fx), y0 = Math.floor(fy), ax = fx - x0, ay = fy - y0;
    const a = px(x0, y0), b = px(x0 + 1, y0), c = px(x0, y0 + 1), d = px(x0 + 1, y0 + 1);
    return (a * (1 - ax) + b * ax) * (1 - ay) + (c * (1 - ax) + d * ax) * ay;
  };
}
