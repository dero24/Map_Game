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
import type { Area, Box, LayerLayout } from './data';
import { makeProjector, type LatLon } from './realTile';
import { makeCanvas } from './canvas';
import { landCoverAt, type LandCover } from './landcover';
import { unzlibSync } from 'three/examples/jsm/libs/fflate.module.js';

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

async function demTile(tx: number, ty: number, z = Z): Promise<Float32Array | null> {
  const n = 2 ** z;
  const k = z === Z ? `${tx}_${ty}` : `${z}/${tx}_${ty}`;
  let p = tileCache.get(k);
  if (p) {
    tileCache.delete(k); // (most recently used last: the oldest go first below)
    tileCache.set(k, p);
    return p;
  }
  p = (async () => {
    while (inflight >= 4) await new Promise<void>((r) => queue.push(r));
    inflight++;
    try {
      const tx0 = ((tx % n) + n) % n;
      // 'direct' (no tile service): Terrarium straight from its public bucket (CORS-enabled)
      const url = demBase === 'direct' ? `https://s3.amazonaws.com/elevation-tiles-prod/terrarium/${z}/${tx0}/${ty}.png` : `${demBase}/dem/${z}/${tx0}/${ty}.png`;
      const r = await fetch(url, { signal: AbortSignal.timeout(10000), mode: 'cors' });
      if (!r.ok) return null;
      const bytes = new Uint8Array(await r.arrayBuffer());
      // the PNG read byte for byte, no canvas: the same heights on every device (no colour
      // management), and a worker without OffscreenCanvas — an iPhone before iOS 16.4 — still
      // gets its ground and its sea (it had none: every open-world cell stood flat on the water)
      const own = terrariumFromPng(bytes);
      if (own) return own;
      const bmp = await createImageBitmap(new Blob([bytes]));
      const w = bmp.width, hh = bmp.height; // close() zeroes these — read dims first
      const cv = makeCanvas(w, hh); // (OffscreenCanvas where there is one: older iOS has none)
      const g = cv.getContext('2d') as OffscreenCanvasRenderingContext2D;
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
  // (a quarter megabyte a tile, per thread: a long drive across the country keeps the last 250)
  while (tileCache.size > 250) tileCache.delete(tileCache.keys().next().value!);
  // Failures aren't cached — a transient 5xx/timeout must not pin a cell flat for the session.
  void p.then((h) => { if (!h && tileCache.get(k) === p) tileCache.delete(k); });
  return p;
}

/** Elevation at any lat/lon from the zoom-z Terrarium tiles covering a lat/lon box (the horizon
 *  ring reads z9, ~250 m a pixel). Sea floor and nodata read 0. null until the service answers,
 *  or when any tile is missing (a hole would read as a cliff to the sea). */
export async function demSampler(z: number, bb: { s: number; w: number; n: number; e: number }): Promise<((lat: number, lon: number) => number) | null> {
  if (!demBase) return null;
  const n = 2 ** z;
  const lx = (lon: number) => ((lon + 180) / 360) * n;
  const ly = (lat: number) => { const r = (lat * Math.PI) / 180; return ((1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2) * n; };
  const x0 = Math.floor(lx(bb.w)), x1 = Math.floor(lx(bb.e)), y0 = Math.floor(ly(bb.n)), y1 = Math.floor(ly(bb.s));
  const tiles = new Map<string, Float32Array>();
  const jobs: Promise<void>[] = [];
  for (let tx = x0; tx <= x1; tx++) for (let ty = y0; ty <= y1; ty++) jobs.push(demTile(tx, ty, z).then((h) => { if (h) tiles.set(`${tx}_${ty}`, h); }));
  await Promise.all(jobs);
  if (tiles.size < jobs.length) return null;
  return (lat: number, lon: number) => {
    const fx = lx(lon) * 256 - 0.5, fy = ly(lat) * 256 - 0.5;
    const tx = Math.floor(fx / 256), ty = Math.floor(fy / 256);
    const t = tiles.get(`${tx}_${ty}`);
    if (!t) return 0;
    const px = fx - tx * 256, py = fy - ty * 256;
    const ix = Math.max(0, Math.min(255, Math.floor(px))), iy = Math.max(0, Math.min(255, Math.floor(py)));
    const ax = Math.max(0, Math.min(1, px - ix)), ay = Math.max(0, Math.min(1, py - iy));
    const jx = Math.min(255, ix + 1), jy = Math.min(255, iy + 1);
    const h = (t[iy * 256 + ix] * (1 - ax) + t[iy * 256 + jx] * ax) * (1 - ay) + (t[jy * 256 + ix] * (1 - ax) + t[jy * 256 + jx] * ax) * ay;
    return h > 0 ? h : 0;
  };
}

// Race helper — callers apply their own budget; the underlying work keeps running and
// stays cached, so a fast placeholder timeout can't poison its slower real-lite twin.
export function raceNull<T>(p: Promise<T>, ms: number): Promise<T | null> {
  let timer: ReturnType<typeof setTimeout>;
  return Promise.race([p, new Promise<null>((res) => (timer = setTimeout(() => res(null), ms)))])
    .catch(() => null)
    .finally(() => clearTimeout(timer!));
}

export async function fetchDem(cellBox: Box, origin: LatLon, pitch = PITCH): Promise<DemGrid | null> {
  const P = makeProjector(origin);
  // The patch overhangs its cell by 96 m (6 pitches — the lattice stays global): buildings and
  // props at a cell's edge sample real ground even before the neighbour's patch exists, instead
  // of the resident terrain's sea-level shelf (a mile-high town's edge houses stood on 0 m).
  const OVER = 96;
  const box: Box = { x0: cellBox.x0 - OVER, z0: cellBox.z0 - OVER, x1: cellBox.x1 + OVER, z1: cellBox.z1 + OVER };
  // TerrainLayer treats samples as cell CENTERS (its bilinear shifts by -0.5), so nodes
  // sit at x0+(i+0.5)*pitch — 64 nodes cover the cell, edges interpolate to the same
  // global lattice as the neighbour's patch (seam-free by construction).
  const nx = Math.round((box.x1 - box.x0) / pitch);
  const nz = Math.round((box.z1 - box.z0) / pitch);
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
      const h = sample(box.x0 + (i + 0.5) * pitch, box.z0 + (j + 0.5) * pitch);
      heights[j * nx + i] = h <= -32000 ? 0 : h; // nodata/ocean-floor sentinel -> sea level
    }
    return { heights, x0: box.x0, z0: box.z0, pitch, nx, nz };
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
/** A body of water in local metres: its outline, its islands (holes that stay land), and the
 *  level its surface stands at — none for the sea, whose floor drops below the datum. */
export interface WaterBody { ring: [number, number][]; holes?: [number, number][][]; level?: number }

type Grid = LayerLayout['grid'];
/** Where a ring crosses the row z (even-odd: inside between each pair), sorted. */
function crossings(r: [number, number][], z: number): number[] {
  const xs: number[] = [];
  for (let i = 0, j = r.length - 1; i < r.length; j = i++) {
    const [xi, zi] = r[i], [xj, zj] = r[j];
    if (zi > z !== zj > z) xs.push(xi + ((z - zi) * (xj - xi)) / (zj - zi));
  }
  return xs.sort((a, b) => a - b);
}
/** Every grid node (a cell centre) inside a body — its ring, not its holes — row by row: a
 *  lake's outline runs to thousands of vertices and a grid to ninety thousand nodes, so each row
 *  finds its crossings once instead of each node walking the ring. */
function eachNodeIn(g: Grid, w: WaterBody, fn: (k: number) => void) {
  let z0 = Infinity, z1 = -Infinity;
  for (const [, z] of w.ring) (z0 = Math.min(z0, z)), (z1 = Math.max(z1, z));
  const holes = (w.holes ?? []).filter((q) => q.length >= 3);
  const j0 = Math.max(0, Math.ceil((z0 - g.z0) / g.cell - 0.5)), j1 = Math.min(g.h - 1, Math.floor((z1 - g.z0) / g.cell - 0.5));
  for (let j = j0; j <= j1; j++) {
    const z = g.z0 + (j + 0.5) * g.cell, xs = crossings(w.ring, z);
    if (xs.length < 2) continue;
    const hx = holes.map((q) => crossings(q, z));
    for (let q = 0; q + 1 < xs.length; q += 2) {
      const i0 = Math.max(0, Math.ceil((xs[q] - g.x0) / g.cell - 0.5)), i1 = Math.min(g.w - 1, Math.floor((xs[q + 1] - g.x0) / g.cell - 0.5));
      for (let i = i0; i <= i1; i++) {
        const x = g.x0 + (i + 0.5) * g.cell;
        if (hx.some((c) => { let n = 0; for (const cx of c) if (cx < x) n++; else break; return n % 2 === 1; })) continue;
        fn(j * g.w + i);
      }
    }
  }
}

/** Water from the map, pressed into a cell's DEM layer (a copy): inside the sea the ground drops
 *  below the datum (sdf −60 m, oceanD 0, the water flag), inside a lake to its level; an island
 *  (a hole in its body) stays land. The DEM alone can't be trusted at a shore — a z14 Terrarium
 *  tile smears the bluff into the bathymetry, and Elliott Bay read +3 to +15 m a hundred metres
 *  out (a lawn with trees on the water). The sea is tested first: a lake mapped over the sea
 *  (a marina basin, a dock) is the sea.
 *    `mapIsTruth` (the map's water is complete here — the vector tiles' ocean): ground the DEM
 *  called sea (≤ 0.5 m) that the map calls land is land, raised to the half metre — a shore's
 *  smear no longer eats the seawall, and a town below the sea stands dry. */
export function waterPatch(layer: { buf: ArrayBuffer; layout: LayerLayout }, bodies: WaterBody[], mapIsTruth = false): { buf: ArrayBuffer; layout: LayerLayout } {
  const L = layer.layout, g = L.grid, n = g.w * g.h;
  const buf = layer.buf.slice(0);
  const h = new Float32Array(buf, L.height.offset, n);
  const sdf = new Int16Array(buf, L.sdf.offset, n);
  const flags = new Uint8Array(buf, L.flags.offset, n);
  const oceanD = new Uint8Array(buf, L.oceanD.offset, n);
  // (NaN: dry; +Infinity: the sea; else a lake's bed, level − 0.5 m — a lake below the datum too)
  const level = new Float32Array(n).fill(NaN);
  const ordered = [...bodies.filter((w) => w.level === undefined), ...bodies.filter((w) => w.level !== undefined)].filter((w) => w.ring.length >= 3);
  for (const w of ordered) {
    const lv = w.level === undefined ? Infinity : w.level - 0.5;
    eachNodeIn(g, w, (k) => { if (Number.isNaN(level[k])) level[k] = lv; });
  }
  for (let k = 0; k < n; k++) {
    const lv = level[k];
    if (Number.isNaN(lv)) {
      // (lifted to the half metre — a shore's smear, and a real basin below the sea too: the open
      // world's one ocean plane lies at the datum everywhere, and ground under it reads as sea.
      // Death Valley's floor is a flat plain at the datum until the plane learns where land is.)
      if (mapIsTruth && flags[k] & 1) (flags[k] &= ~1), (sdf[k] = 500), (oceanD[k] = 255), (h[k] = Math.max(h[k], 50));
      continue;
    }
    // the sea floor at a flat 6 m (the ocean plane shows the sea; a 250 m bathymetry trough
    // beside a seawall hung the shore's ground in curtains), a lake's bed under its level
    const sea = lv === Infinity;
    h[k] = sea ? -600 : Math.min(h[k], lv * 100);
    sdf[k] = -600;
    flags[k] |= 1;
    oceanD[k] = sea ? 0 : 255; // (a lake is fresh water, not the sea — whatever the DEM guessed)
  }
  return { buf, layout: L };
}

/** A streamed cell's land cover and its distances, from its map (the bake reads ESA WorldCover and
 *  measures them; a streamed cell was grass — 30 — everywhere, 50 m from any water and 510 m from the
 *  sea): WorldCover's classes off the map's areas — woods 10, scrub and heath 20, parks, lawns, pitches
 *  and golf 30, beaches 60, wetlands 90 —; the shore's signed distance (the bake's decimetres: land out
 *  to 300 m, water to −60 m — the shore line, where they cross, where it was); the sea's distance (the
 *  bake's 2 m steps, capped at 510 m). So what keys on the land and its water's edge (the salt marsh's
 *  cordgrass and its fiddlers, a crawfish's bank, a heron's edge, the forest floor's slugs, the woods'
 *  animals, the lizards' scrub, the sand at the sea) has it beyond the baked region too. Water stays
 *  water. Under the map's areas, where the tile carries it, the land cover WorldCover reads where the
 *  map is silent (`lc`, landcover.ts): the woods nothing maps, the sand at the sea, the fields, the
 *  marshes — never its water (the map's water is the water); a park's or a golf course's lawn goes over
 *  its open and built-up ground but not over its trees, its scrub or its marsh (a park's trees are trees).
 *  In place; returns the layer. */
const COVER_OF: Record<string, number> = { grass: 30, golf: 30, pitch: 30, scrub: 20, wood: 10, beach: 60, wetland: 90 };
const KEEPS = new Set([10, 20, 90, 95]); // (what a mapped lawn doesn't cover over: trees, scrub, marsh, mangroves)
export function coverPatch(layer: { buf: ArrayBuffer; layout: LayerLayout }, areas: Area[], lc?: LandCover) {
  const L = layer.layout, g = L.grid, n = g.w * g.h;
  const cover = new Uint8Array(layer.buf, L.cover.offset, n), flags = new Uint8Array(layer.buf, L.flags.offset, n), oceanD = new Uint8Array(layer.buf, L.oceanD.offset, n);
  const ring = (f: number[]): [number, number][] => { const r: [number, number][] = []; for (let i = 0; i + 1 < f.length; i += 2) r.push([f[i] / 10, f[i + 1] / 10]); return r; };
  if (lc)
    for (let j = 0, k = 0; j < g.h; j++)
      for (let i = 0; i < g.w; i++, k++) {
        if (flags[k] & 1) continue;
        const v = landCoverAt(lc, g.x0 + (i + 0.5) * g.cell, g.z0 + (j + 0.5) * g.cell);
        if (v && v !== 80) cover[k] = v;
      }
  // (the most particular last: a wood in a park is wood, a marsh in it a marsh)
  for (const c of ['grass', 'golf', 'pitch', 'scrub', 'wood', 'beach', 'wetland']) {
    const lawn = lc && (c === 'grass' || c === 'golf');
    for (const a of areas) {
      if (a.c !== c || a.lod) continue;
      const holes = (a.i ?? []).map(ring);
      for (const o of a.o) eachNodeIn(g, { ring: ring(o), holes }, (k) => { if (!(flags[k] & 1) && !(lawn && KEEPS.has(cover[k]))) cover[k] = COVER_OF[c]; });
    }
  }
  const sdf = new Int16Array(layer.buf, L.sdf.offset, n);
  // the shore's distance, both sides (none of one or the other in the cell: as before)
  let wet = 0;
  for (let k = 0; k < n; k++) if (flags[k] & 1) wet++;
  if (wet && wet < n) {
    const toWater = chamfer(g, (k) => (flags[k] & 1) !== 0), toLand = chamfer(g, (k) => (flags[k] & 1) === 0), h = g.cell / 2;
    for (let k = 0; k < n; k++) sdf[k] = flags[k] & 1 ? -Math.min(600, Math.max(1, Math.round((toLand[k] - h) * 10))) : Math.min(3000, Math.max(1, Math.round((toWater[k] - h) * 10)));
  }
  // the sea's distance, from its nodes (none in the cell: as before, far)
  let sea = false;
  for (let k = 0; k < n && !sea; k++) sea = (flags[k] & 1) !== 0 && oceanD[k] === 0;
  if (sea) {
    const d = chamfer(g, (k) => (flags[k] & 1) !== 0 && oceanD[k] === 0);
    for (let k = 0; k < n; k++) if (!(flags[k] & 1)) oceanD[k] = Math.min(255, Math.round(d[k] / 2));
  }
  return layer;
}
/** Each node's distance (m) to the nearest node where `from`: a two-pass chamfer (3×3, √2 diagonals). */
function chamfer(g: Grid, from: (k: number) => boolean) {
  const n = g.w * g.h, W = g.w, a = g.cell, b = g.cell * Math.SQRT2, d = new Float32Array(n);
  for (let k = 0; k < n; k++) d[k] = from(k) ? 0 : Infinity;
  for (let j = 0; j < g.h; j++)
    for (let i = 0; i < W; i++) {
      const k = j * W + i;
      let v = d[k];
      if (i > 0) v = Math.min(v, d[k - 1] + a);
      if (j > 0) { v = Math.min(v, d[k - W] + a); if (i > 0) v = Math.min(v, d[k - W - 1] + b); if (i < W - 1) v = Math.min(v, d[k - W + 1] + b); }
      d[k] = v;
    }
  for (let j = g.h - 1; j >= 0; j--)
    for (let i = W - 1; i >= 0; i--) {
      const k = j * W + i;
      let v = d[k];
      if (i < W - 1) v = Math.min(v, d[k + 1] + a);
      if (j < g.h - 1) { v = Math.min(v, d[k + W] + a); if (i < W - 1) v = Math.min(v, d[k + W + 1] + b); if (i > 0) v = Math.min(v, d[k + W - 1] + b); }
      d[k] = v;
    }
  return d;
}

/** The level a lake or river stands at in this cell (m): the DEM inside it, where the survey
 *  flattened the water to its surface (3DEP is hydro-flattened — one height across a lake, so
 *  every cell along Lake Washington finds the same 6.4 m), its 30th percentile (a bank's smear
 *  reaches in from the shore, never down); a water too small to hold six of the grid's nodes
 *  falls back to the shore's low ground (a 10th percentile of its outline). */
export function waterLevel(layer: { buf: ArrayBuffer; layout: LayerLayout }, w: WaterBody, heightAt: (x: number, z: number) => number): number {
  const L = layer.layout, g = L.grid, h = new Float32Array(layer.buf, L.height.offset, g.w * g.h);
  const inside: number[] = [];
  eachNodeIn(g, w, (k) => inside.push(h[k] / 100));
  // (at the datum at the lowest: the open world's ocean plane covers anything under it — the
  // Salton Sea stands at sea level with its shore, until the plane learns where land is)
  if (inside.length >= 6) {
    inside.sort((a, b) => a - b);
    return Math.max(0, inside[Math.floor(inside.length * 0.3)]);
  }
  const hs = w.ring.map(([x, z]) => heightAt(x, z)).sort((a, b) => a - b);
  return Math.max(0, hs[Math.floor(hs.length * 0.1)] ?? 0);
}

/** A Terrarium tile's heights straight from its PNG bytes (8-bit RGB or RGBA, not interlaced — what
 *  Terrarium serves): the zlib stream inflated, each scanline's filter undone, h = R·256 + G + B/256
 *  − 32768. null for anything else (the canvas path takes it). Pure. */
export function terrariumFromPng(png: Uint8Array): Float32Array | null {
  const u32 = (o: number) => ((png[o] << 24) | (png[o + 1] << 16) | (png[o + 2] << 8) | png[o + 3]) >>> 0;
  if (png.length < 33 || png[0] !== 0x89 || png[1] !== 0x50 || png[2] !== 0x4e || png[3] !== 0x47) return null;
  let w = 0, h = 0, bpp = 0;
  const idat: Uint8Array[] = [];
  let len = 0;
  for (let o = 8; o + 8 <= png.length;) {
    const n = u32(o), type = String.fromCharCode(png[o + 4], png[o + 5], png[o + 6], png[o + 7]);
    const body = png.subarray(o + 8, o + 8 + n);
    if (type === 'IHDR') {
      w = u32(o + 8);
      h = u32(o + 12);
      const depth = body[8], color = body[9], interlace = body[12];
      if (depth !== 8 || interlace !== 0 || (color !== 2 && color !== 6)) return null;
      bpp = color === 6 ? 4 : 3;
    } else if (type === 'IDAT') { idat.push(body); len += n; }
    else if (type === 'IEND') break;
    o += 12 + n;
  }
  if (w !== 256 || h !== 256 || !bpp || !idat.length) return null;
  const z = new Uint8Array(len);
  for (let k = 0, at = 0; k < idat.length; at += idat[k].length, k++) z.set(idat[k], at);
  let raw: Uint8Array;
  try { raw = unzlibSync(z); } catch { return null; }
  const stride = w * bpp;
  if (raw.length < h * (stride + 1)) return null;
  const px = new Uint8Array(h * stride);
  for (let y = 0; y < h; y++) {
    const f = raw[y * (stride + 1)], src = y * (stride + 1) + 1, row = y * stride, up = row - stride;
    for (let i = 0; i < stride; i++) {
      const a = i >= bpp ? px[row + i - bpp] : 0, b = y ? px[up + i] : 0, c = y && i >= bpp ? px[up + i - bpp] : 0;
      let v = raw[src + i];
      if (f === 1) v += a;
      else if (f === 2) v += b;
      else if (f === 3) v += (a + b) >> 1;
      else if (f === 4) { const p = a + b - c, pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c); v += pa <= pb && pa <= pc ? a : pb <= pc ? b : c; }
      else if (f !== 0) return null;
      px[row + i] = v & 255;
    }
  }
  const out = new Float32Array(w * h);
  for (let k = 0; k < w * h; k++) out[k] = px[k * bpp] * 256 + px[k * bpp + 1] + px[k * bpp + 2] / 256 - 32768;
  return out;
}

/** A cell's ground grid with no elevation to go on (the DEM late, failed or offline) — the same
 *  lattice fetchDem lays, at the height `at` gives (the resident stand-in): somewhere to press the
 *  map's water into, so a cell out on the bay is the bay, not a lawn at 3 m. */
export function flatDem(cellBox: Box, at: (x: number, z: number) => number, pitch = PITCH): DemGrid {
  const OVER = 96, box = { x0: cellBox.x0 - OVER, z0: cellBox.z0 - OVER, x1: cellBox.x1 + OVER, z1: cellBox.z1 + OVER };
  const nx = Math.round((box.x1 - box.x0) / pitch), nz = Math.round((box.z1 - box.z0) / pitch);
  const heights = new Float32Array(nx * nz);
  for (let j = 0; j < nz; j++) for (let i = 0; i < nx; i++) heights[j * nx + i] = Math.max(1, at(box.x0 + (i + 0.5) * pitch, box.z0 + (j + 0.5) * pitch));
  return { heights, x0: box.x0, z0: box.z0, pitch, nx, nz };
}

export function demLayer(d: DemGrid): { buf: ArrayBuffer; layout: LayerLayout } {
  const n = d.nx * d.nz;
  const buf = new ArrayBuffer(n * 4 + n * 2 + n * 3); // height f32 + sdf i16 + cover/flags/oceanD u8
  const f32 = new Float32Array(buf, 0, n);
  const i16 = new Int16Array(buf, n * 4, n);
  const u8 = new Uint8Array(buf, n * 6, n * 3);
  for (let i = 0; i < n; i++) {
    const sea = d.heights[i] <= 0.5;
    f32[i] = d.heights[i] * 100;
    // -60 m offshore (open water: no ground chunk or backdrop is laid over it, so the water
    // plane shows — a DEM river at 0 m read as a tan plain) / +50 m inland
    i16[i] = sea ? -600 : 500;
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
