#!/usr/bin/env node
// Crop + upscale a region of a screenshot for close inspection.
//   node tools/crop.mjs shots/x.png x y w h [scale] -> shots/x.crop.png
import { readFileSync, writeFileSync } from 'node:fs';
import { PNG } from 'pngjs';

const [file, x, y, w, h, s = '2'] = process.argv.slice(2);
const src = PNG.sync.read(readFileSync(file));
const [X, Y, W, H, S] = [x, y, w, h, s].map(Number);
const out = new PNG({ width: W * S, height: H * S });
for (let j = 0; j < H * S; j++)
  for (let i = 0; i < W * S; i++) {
    const si = ((Y + Math.floor(j / S)) * src.width + X + Math.floor(i / S)) * 4;
    out.data.set(src.data.subarray(si, si + 4), (j * W * S + i) * 4);
  }
const dst = file.replace(/\.png$/, '.crop.png');
writeFileSync(dst, PNG.sync.write(out));
console.log(dst);
