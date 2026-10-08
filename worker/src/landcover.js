// A cell's land cover from ESA WorldCover (src/world/landcover.ts; CC BY 4.0, "© ESA WorldCover project
// 2021 / Contains modified Copernicus Sentinel data (2021) processed by ESA WorldCover consortium"): its
// 3° × 3° cloud-optimized GeoTIFFs on AWS's open data, read by range — only the 1024² blocks a window
// touches, and each file's header once an isolate. A cell's is read once and kept with its tile in R2; a
// far block's (8 km at 32 m, off the 20 m overview: the far ring's woods — src/world/farCover.ts) under
// its own key.
import { fromUrl } from 'geotiff';
import { landCoverGrid, LC_OVER } from '../../src/world/landcover';
import { makeProjector } from '../../src/world/realTile';

const BASE = 'https://esa-worldcover.s3.eu-central-1.amazonaws.com/v200/2021/map/ESA_WorldCover_10m_2021_v200_';
// (a 3° file by its south-west corner: N45W126 holds 45–48°N, 126–123°W)
const nameOf = (lat, lon) => {
  const a = Math.floor(lat / 3) * 3, o = Math.floor(lon / 3) * 3;
  return `${a >= 0 ? 'N' : 'S'}${String(Math.abs(a)).padStart(2, '0')}${o >= 0 ? 'E' : 'W'}${String(Math.abs(o)).padStart(3, '0')}`;
};
// each file opened once an isolate: null where there's no file (the open sea — WorldCover has none
// there); a failed open is forgotten, to be tried again
const files = new Map();
function file(name) {
  let p = files.get(name);
  if (!p) {
    p = (async () => {
      const url = `${BASE}${name}_Map.tif`;
      const head = await fetch(url, { method: 'HEAD' });
      if (head.status === 404 || head.status === 403) return null;
      if (!head.ok) throw new Error(`worldcover ${name}: ${head.status}`);
      const tiff = await fromUrl(url), base = await tiff.getImage(0);
      return { tiff, base, ovs: new Map() };
    })();
    files.set(name, p);
    p.catch(() => files.delete(name));
    if (files.size > 24) files.delete(files.keys().next().value);
  }
  return p;
}
// a file's image at overview `k` (0: the 10 m data itself) with its own origin and resolution — an
// overview's IFD carries no georeferencing: the base's, scaled
async function level(f, k) {
  const [ox, oy] = f.base.getOrigin(), [rx, ry] = f.base.getResolution();
  if (!k) return { img: f.base, ox, oy, rx, ry };
  let img = f.ovs.get(k);
  if (!img) f.ovs.set(k, (img = f.tiff.getImage(k)));
  const ov = await img, s = f.base.getWidth() / ov.getWidth();
  return { img: ov, ox, oy, rx: rx * s, ry: ry * s };
}

// (past `ms` it throws: the caller serves what it has without it and doesn't keep it)
const timed = async (p, ms) => {
  let timer;
  try {
    return await Promise.race([p, new Promise((_, no) => (timer = setTimeout(() => no(new Error('worldcover: timed out')), ms)))]);
  } finally {
    clearTimeout(timer);
  }
};

/** The cell's land cover (`box` in the frame of `origin`: an 8 m grid over it and its ground's 96 m
 *  overhang), or null where WorldCover has nothing to add (the open sea). Throws when it can't be read. */
export const landCover = (box, origin, ms = 20000) => timed(read(box, origin, 0, undefined, LC_OVER), ms);
/** A far block's (`box`, 8 km): a 32 m grid off the 20 m overview, no overhang. */
export const farCover = (box, origin, ms = 20000) => timed(read(box, origin, 1, 32, 0), ms);

async function read(box, origin, k, cell, over) {
  const P = makeProjector(origin);
  const bb = P.localToBbox({ x0: box.x0 - over, z0: box.z0 - over, x1: box.x1 + over, z1: box.z1 + over });
  // the files the window touches (a window on a 3° line: two, or four)
  const names = new Set();
  for (const lat of [bb.s, bb.n]) for (const lon of [bb.w, bb.e]) names.add(nameOf(lat, lon));
  const wins = [];
  for (const name of names) {
    const f = await file(name);
    if (!f) continue;
    const { img, ox, oy, rx, ry } = await level(f, k), W = img.getWidth(), H = img.getHeight();
    const cl = (v, n) => Math.max(0, Math.min(n, v));
    const win = [cl(Math.floor((bb.w - ox) / rx), W), cl(Math.floor((bb.n - oy) / ry), H), cl(Math.floor((bb.e - ox) / rx) + 1, W), cl(Math.floor((bb.s - oy) / ry) + 1, H)];
    if (win[2] <= win[0] || win[3] <= win[1]) continue;
    const [data] = await img.readRasters({ window: win });
    wins.push({ data, x0: win[0], y0: win[1], w: win[2] - win[0], h: win[3] - win[1], ox, oy, rx, ry });
  }
  if (!wins.length) return null;
  const sample = (lat, lon) => {
    for (const q of wins) {
      const i = Math.floor((lon - q.ox) / q.rx) - q.x0, j = Math.floor((lat - q.oy) / q.ry) - q.y0;
      if (i >= 0 && j >= 0 && i < q.w && j < q.h) return q.data[j * q.w + i];
    }
    return 0;
  };
  return landCoverGrid(box, P.unproject, sample, cell, over);
}
