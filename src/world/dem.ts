// Terrarium DEM (H2): real elevation for virtual-region cells, delivered as the same
// TerrainLayer patch the baked tiles use — fetch + decode runs in the tile worker
// (createImageBitmap + OffscreenCanvas are worker-safe), the bytes ship home in
// BuiltTile.dem and mount() registers them under the cell key.
//
// Source: AWS Open Data 'elevation-tiles-prod' (Mapzen Terrarium encoding), proxied
// through the tile worker's /dem/<z>/<x>/<y>.png route — the page is COEP-isolated and
// the S3 bucket sends no CORP header, so module-worker fetches to S3 are blocked.
//   height_m = R*256 + G + B/256 - 32768. z14 ≈ 1.2–1.9 km/tile — a 1024 m cell spans
//   at most a 2×2 tile corner. PNGs are immutable; the worker caches edge + R2.
import type { Box, LayerLayout } from './data';
import { makeProjector, type LatLon } from './realTile';

const Z = 14;
const PITCH = 16; // m between samples — 65×65 nodes per cell; enough for walkable hills
const N = 2 ** Z;
const lon2tx = (lon: number) => ((lon + 180) / 360) * N;
const lat2ty = (lat: number) => {
  const r = (lat * Math.PI) / 180;
  return ((1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2) * N;
};

export interface DemGrid {
  heights: Float32Array; // metres, row-major nz×nx
  x0: number; z0: number; pitch: number; nx: number; nz: number;
}

// Slippy tiles are shared between neighbouring cells — dedupe the decode at tile level
// and cap concurrency, otherwise a fresh ring's cells stampede the bucket into timeouts.
const tileCache = new Map<string, Promise<Float32Array | null>>();
let inflight = 0;
const queue: (() => void)[] = [];
let demBase = ''; // tile-service root — /dem/<z>/<x>/<y>.png proxies Terrarium
export function setDemBase(b: string) { demBase = b.replace(/\/+$/, ''); }

async function demTile(tx: number, ty: number): Promise<Float32Array | null> {
  const k = `${tx}_${ty}`;
  let p = tileCache.get(k);
  if (p) return p;
  p = (async () => {
    while (inflight >= 4) await new Promise<void>((r) => queue.push(r));
    inflight++;
    try {
      const tx0 = ((tx % N) + N) % N;
      // 'direct' (no tile service): Terrarium straight from its public bucket (CORS-enabled)
      const url = demBase === 'direct' ? `https://s3.amazonaws.com/elevation-tiles-prod/terrarium/${Z}/${tx0}/${ty}.png` : `${demBase}/dem/${Z}/${tx0}/${ty}.png`;
      const r = await fetch(url, { signal: AbortSignal.timeout(10000), mode: 'cors' });
      if (!r.ok) return null;
      const bmp = await createImageBitmap(await r.blob());
      const w = bmp.width, hh = bmp.height; // close() zeroes these — read dims first
      const cv = new OffscreenCanvas(w, hh);
      const g = cv.getContext('2d')!;
      g.drawImage(bmp, 0, 0);
      bmp.close();
      const px = g.getImageData(0, 0, w, hh).data;
      const h = new Float32Array(256 * 256);
      for (let i = 0; i < h.length; i++) h[i] = px[i * 4] * 256 + px[i * 4 + 1] + px[i * 4 + 2] / 256 - 32768;
      return h;
    } catch {
      return null;
    } finally {
      inflight--;
      queue.shift()?.();
    }
  })();
  tileCache.set(k, p);
  // Failures aren't cached — a transient 5xx/timeout must not pin a cell flat for the session.
  void p.then((h) => { if (!h && tileCache.get(k) === p) tileCache.delete(k); });
  return p;
}

// Race helper — callers apply their own budget; the underlying work keeps running and
// stays cached, so a fast placeholder timeout can't poison its slower real-lite twin.
export function raceNull<T>(p: Promise<T>, ms: number): Promise<T | null> {
  let timer: ReturnType<typeof setTimeout>;
  return Promise.race([p, new Promise<null>((res) => (timer = setTimeout(() => res(null), ms)))])
    .catch(() => null)
    .finally(() => clearTimeout(timer!));
}

export async function fetchDem(box: Box, origin: LatLon): Promise<DemGrid | null> {
  const P = makeProjector(origin);
  // TerrainLayer treats samples as cell CENTERS (its bilinear shifts by -0.5), so nodes
  // sit at x0+(i+0.5)*pitch — 64 nodes cover the cell, edges interpolate to the same
  // global lattice as the neighbour's patch (seam-free by construction).
  const nx = Math.round((box.x1 - box.x0) / PITCH);
  const nz = Math.round((box.z1 - box.z0) / PITCH);
  const work = (async (): Promise<DemGrid | null> => {
    // Tile range covering the box. +z is south / +x east: (x0,z0) is the north-west
    // corner — lat north (mercator y min), lon west (x min).
    const [latN, lonW] = P.unproject(box.x0, box.z0);
    const [latS, lonE] = P.unproject(box.x1, box.z1);
    // Antimeridian: lon2tx can produce tx >= N east of 180°E. The UNWRAPPED index is
    // kept as the tiles key so sampling stays coherent; only the fetch URL wraps.
    const x0 = Math.floor(lon2tx(lonW)), x1 = Math.floor(lon2tx(lonE));
    const y0 = Math.floor(lat2ty(latN)), y1 = Math.floor(lat2ty(latS));
    const tiles = new Map<string, Float32Array>(); // 'x_y' -> decoded heights, 256×256
    const want = (x1 - x0 + 1) * (y1 - y0 + 1);
    await Promise.all(
      Array.from({ length: x1 - x0 + 1 }, (_, i) => x0 + i).flatMap((tx) =>
        Array.from({ length: y1 - y0 + 1 }, (_, j) => y0 + j).map(async (ty) => {
          const h = await demTile(tx, ty);
          if (h) tiles.set(`${tx}_${ty}`, h);
        }),
      ),
    );
    // All-or-nothing: a missing slippy tile would sample as 0 m — a cliff down to "sea"
    // (which also flags it water). A flat cell that retries later beats a fake shoreline.
    if (tiles.size < want) return null;
    const sample = (x: number, z: number) => {
      const [lat, lon] = P.unproject(x, z);
      const fx = lon2tx(lon) * 256 - 0.5, fy = lat2ty(lat) * 256 - 0.5;
      const tx = Math.floor(fx / 256), ty = Math.floor(fy / 256);
      const t = tiles.get(`${tx}_${ty}`);
      if (!t) return 0;
      const px = fx - tx * 256, py = fy - ty * 256;
      const ix = Math.max(0, Math.min(255, Math.floor(px))), iy = Math.max(0, Math.min(255, Math.floor(py)));
      const ax2 = Math.max(0, Math.min(1, px - ix)), ay2 = Math.max(0, Math.min(1, py - iy));
      const jx = Math.min(255, ix + 1), jy = Math.min(255, iy + 1);
      const a = t[iy * 256 + ix], b = t[iy * 256 + jx], c = t[jy * 256 + ix], d = t[jy * 256 + jx];
      return (a * (1 - ax2) + b * ax2) * (1 - ay2) + (c * (1 - ax2) + d * ax2) * ay2;
    };
    const heights = new Float32Array(nx * nz);
    for (let j = 0; j < nz; j++) for (let i = 0; i < nx; i++) {
      const h = sample(box.x0 + (i + 0.5) * PITCH, box.z0 + (j + 0.5) * PITCH);
      heights[j * nx + i] = h <= -32000 ? 0 : h; // nodata/ocean-floor sentinel -> sea level
    }
    return { heights, x0: box.x0, z0: box.z0, pitch: PITCH, nx, nz };
  })();
  return work.catch(() => null);
}

// Pack a DemGrid into a TerrainLayer + transferable buffer. Heights go out as f32
// centimetres (TerrainLayer divides by 100) — i16 cm would cap real mountains at 327 m.
// sdf is derived from elevation, not faked: nodes at/below ~0.5 m are treated as sea —
// Terrarium encodes open water as 0/nodata — so synth lots stay out of unmapped bays
// and realExtras' `sdfAt > -45` ground paint respects the shoreline. Below-sea-level
// land (Death Valley, Netherlands) reads as water — rare and placement-only; heights
// stay true either way.
export function demLayer(d: DemGrid): { buf: ArrayBuffer; layout: LayerLayout } {
  const n = d.nx * d.nz;
  const buf = new ArrayBuffer(n * 4 + n * 2 + n * 3); // height f32 + sdf i16 + cover/flags/oceanD u8
  const f32 = new Float32Array(buf, 0, n);
  const i16 = new Int16Array(buf, n * 4, n);
  const u8 = new Uint8Array(buf, n * 6, n * 3);
  for (let i = 0; i < n; i++) {
    const sea = d.heights[i] <= 0.5;
    f32[i] = d.heights[i] * 100;
    i16[i] = sea ? -50 : 500; // -5 m offshore / +50 m inland
    u8[n * 2 + i] = sea ? 0 : 255; // oceanD: at sea / far
    if (sea) u8[n + i] = 1; // flags bit0: water
  }
  u8.fill(30, 0, n); // cover: grass
  const layout: LayerLayout = {
    grid: { x0: d.x0, z0: d.z0, cell: d.pitch, w: d.nx, h: d.nz },
    height: { offset: 0, length: n, type: 'f32' },
    sdf: { offset: n * 4, length: n, type: 'i16' },
    cover: { offset: n * 6, length: n, type: 'u8' },
    flags: { offset: n * 7, length: n, type: 'u8' },
    oceanD: { offset: n * 8, length: n, type: 'u8' },
  };
  return { buf, layout };
}
