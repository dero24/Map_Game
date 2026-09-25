// One-time pull of AWS Terrain Tiles (Terrarium PNG encoding, no key) covering the backdrop bbox.
// z13 (~15 m/px) for the whole backdrop incl. the Navesink Highlands bluff, z15 (~3.6 m/px) for the slice.
import { mkdirSync, existsSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { RAW, BACKDROP, SLICE, UA } from './config.mjs';

const lon2x = (lon, z) => Math.floor(((lon + 180) / 360) * 2 ** z);
const lat2y = (lat, z) => {
  const r = (lat * Math.PI) / 180;
  return Math.floor(((1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2) * 2 ** z);
};

async function pull(b, z) {
  const dir = resolve(RAW, 'terrain', String(z));
  mkdirSync(dir, { recursive: true });
  const x0 = lon2x(b.w, z), x1 = lon2x(b.e, z), y0 = lat2y(b.n, z), y1 = lat2y(b.s, z);
  let n = 0;
  for (let x = x0; x <= x1; x++)
    for (let y = y0; y <= y1; y++) {
      const f = resolve(dir, `${x}_${y}.png`);
      if (existsSync(f)) continue;
      const url = `https://s3.amazonaws.com/elevation-tiles-prod/terrarium/${z}/${x}/${y}.png`;
      const res = await fetch(url, { headers: { 'User-Agent': UA } });
      if (!res.ok) throw new Error(`${url} -> ${res.status}`);
      writeFileSync(f, Buffer.from(await res.arrayBuffer()));
      n++;
    }
  console.log(`z${z}: x ${x0}..${x1}, y ${y0}..${y1} (${n} new tiles)`);
}

await pull(BACKDROP, 13);
await pull(SLICE, 15);
