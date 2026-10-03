// LiDAR cell work — runs in its own worker (lidar.worker.ts), off the tile-build thread:
// EPT octree reads, LAZ decode, the 1 m height rasters, roof fits for the footprints a tile
// asks about, unmapped-building and tree detection. The tile worker (lidar.ts) owns the
// cache and applies results; this side owns the rasters (a few cells kept in memory, so a
// second tile variant of the same cell measures without re-reading the survey).
import createLazPerf, { type LazPerf } from '../vendor/laz-perf/laz-perf.js';
// The decoder's WASM rides in the worker chunk as base64 rather than a separate request:
// a same-origin fetch can queue for minutes behind slow tile-service calls (HTTP/1.1 dev).
import WASM_B64 from '../vendor/laz-perf/wasm-b64';
import type { Box } from './data';
import { measureFootprint, type RoofFit } from './measure';
import {
  LidarGrid, boxLatLon, depthFor, depthForDensity, detectBuildings, detectTrees, hagAt, lasClass, lasHeader, localToMercBox, mercToLocal, nodesIn, ringMask, unprojectLocal,
  type EptInfo, type Hag, type LidarProject,
} from './lidarCore';

type LatLon = { lat: number; lon: number };
const PAD = 12; // m of raster beyond the cell: footprints straddling the edge still measure
const MAX_PROJECTS = 3;
const MAX_POINTS = 4e6; // per cell per survey — whole octree levels are dropped to stay under it
const CONC = 6;
const FETCH_MS = 30000; // a stalled S3 read gives up rather than holding a cell slot
export const RS: RoofFit[] = ['flat', 'hip', 'gable', 'gableX', 'pitched'];

let origin: LatLon | null = null;
let lpP: Promise<LazPerf> | null = null;
let log: (msg: string) => void = (m) => console.info(m);
export function setCellLog(fn: (msg: string) => void) { log = fn; }
let lazFactory = async (): Promise<LazPerf> => {
  const bin = atob(WASM_B64), u8 = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i);
  return createLazPerf({ wasmBinary: u8.buffer });
};
/** A runtime that may not compile WASM from bytes (a Cloudflare Worker: its module is compiled at
 *  deploy) hands over its own way to start the decoder. */
export function setLazPerf(f: () => Promise<LazPerf>) {
  lazFactory = f;
  lpP = null;
}
const lazperf = () => (lpP ??= lazFactory());

// ---------- EPT reads (session-cached) ----------
const eptP = new Map<string, Promise<EptInfo>>();
const hierP = new Map<string, Promise<Record<string, number>>>();
const get = (url: string) => fetch(url, { signal: AbortSignal.timeout(FETCH_MS) }).then((r) => { if (!r.ok) throw new Error(`${url} ${r.status}`); return r; });
const json = <T>(url: string) => get(url).then((r) => r.json() as Promise<T>);
function ept(base: string) {
  let p = eptP.get(base);
  if (!p) eptP.set(base, (p = json<EptInfo>(base + 'ept.json')));
  p.catch(() => eptP.delete(base));
  return p;
}
function hier(base: string, key: string) {
  const k = base + key;
  let p = hierP.get(k);
  if (!p) hierP.set(k, (p = json<Record<string, number>>(`${base}ept-hierarchy/${key}.json`)));
  p.catch(() => hierP.delete(k));
  return p;
}
// Nodes over the cell down to the depth that gives DENSITY points/m² (≈0.8 m spacing —
// a 10×12 m house gets ~180 returns); `cap` bounds the hierarchy walk. Whole levels are
// then dropped while the read would exceed MAX_POINTS, so what gets read never depends on
// network timing (the result is cached for good — it must be the same every time).
const DENSITY = 1.5;
async function nodesFor(base: string, E: EptInfo, mb: [number, number, number, number], lat: number) {
  const cap = depthFor(E, lat, 0.6);
  const H: Record<string, number> = { ...(await hier(base, '0-0-0-0')) };
  const seen = new Set<string>(['0-0-0-0']);
  for (;;) {
    const pend = nodesIn(E, H, mb, cap).filter((k) => H[k] === -1 && !seen.has(k));
    if (!pend.length) break;
    for (const k of pend) seen.add(k);
    const subs = await Promise.all(pend.map((k) => hier(base, k)));
    for (const s of subs) Object.assign(H, s);
  }
  const all = nodesIn(E, H, mb, cap).filter((k) => H[k] !== 0);
  let maxD = depthForDensity(E, H, all, lat, DENSITY, cap);
  const sum = (d: number) => all.reduce((a, k) => a + (+k.split('-')[0] <= d ? Math.max(0, H[k]) : 0), 0);
  while (maxD > 0 && sum(maxD) > MAX_POINTS) maxD--;
  const nodes = all.filter((k) => +k.split('-')[0] <= maxD).sort((a, b) => +a.split('-')[0] - +b.split('-')[0] || (a < b ? -1 : 1));
  return { maxD, nodes };
}

// One LAZ node's returns, in the file's own order: `begin(n)`, then `put(i, X, Y, Z, C)` per point
// (X, Y in the survey's Mercator metres, Z its elevation, C its class). Kept (Pts) or streamed
// straight into a grid, a point is the same numbers: Z is float32 either way.
type Put = (i: number, X: number, Y: number, Z: number, C: number) => void;
function decode(LP: LazPerf, ab: ArrayBuffer, begin: (n: number) => void, put: Put) {
  const buf = new Uint8Array(ab);
  const hd = lasHeader(buf);
  const src = LP._malloc(buf.length);
  LP.HEAPU8.set(buf, src);
  const z = new LP.LASZip();
  try {
    z.open(src, buf.length);
    const n = z.getCount(), len = z.getPointLength(), pf = hd.pf; // header's id, compression bits masked
    begin(n);
    const rec = LP._malloc(len);
    try {
      let H8 = LP.HEAPU8, dv = new DataView(H8.buffer, rec, len);
      for (let i = 0; i < n; i++) {
        z.getPoint(rec);
        if (LP.HEAPU8.buffer !== H8.buffer) (H8 = LP.HEAPU8), (dv = new DataView(H8.buffer, rec, len)); // wasm memory grew
        put(i, dv.getInt32(0, true) * hd.sx + hd.ox, dv.getInt32(4, true) * hd.sy + hd.oy, Math.fround(dv.getInt32(8, true) * hd.sz + hd.oz), lasClass(H8, rec, pf));
      }
    } finally {
      LP._free(rec);
    }
  } finally {
    z.delete();
    LP._free(src);
  }
}

// Decoded shallow nodes are shared by every cell under them — keep a few.
interface Pts { X: Float64Array; Y: Float64Array; Z: Float32Array; C: Uint8Array }
const ptsCache = new Map<string, Promise<Pts>>();
function points(url: string, keep: boolean): Promise<Pts> {
  const hit = ptsCache.get(url);
  if (hit) return hit;
  const p = (async () => {
    const [ab, LP] = await Promise.all([get(url).then((r) => r.arrayBuffer()), lazperf()]);
    let out!: Pts;
    decode(LP, ab, (n) => (out = { X: new Float64Array(n), Y: new Float64Array(n), Z: new Float32Array(n), C: new Uint8Array(n) }), (i, X, Y, Z, C) => {
      out.X[i] = X;
      out.Y[i] = Y;
      out.Z[i] = Z;
      out.C[i] = C;
    });
    return out;
  })();
  if (keep) {
    ptsCache.set(url, p);
    p.catch(() => ptsCache.delete(url));
    while (ptsCache.size > 24) ptsCache.delete(ptsCache.keys().next().value!);
  }
  return p;
}
/** Forget every read kept between cells (a long-lived server measures one cell at a time). */
export function dropCellCaches() {
  ptsCache.clear();
  eptP.clear();
  hierP.clear();
  hagMem.clear();
  hagDone.clear();
}

// ---------- the cell raster ----------
// Surveys are tried newest first; a survey that fails (404 after an index refresh, S3
// hiccup) is skipped, not fatal. null = every candidate was read and none had ground
// returns here (safe to remember); a throw = nothing usable AND something failed (retry).
// `strict` (the precompute script, the tile service): any failed read throws instead of moving on
// to an older survey — a record that's kept for every visitor must never depend on a network hiccup.
// `lean` (the tile service, in a Worker's 128 MB): each node is decoded straight into the grid as
// its turn comes, never held as points; only the compressed files in flight are kept. The adds
// are the same numbers in the same order, so the grid — and every fit — is the same as the kept way.
export async function hagFor(box: Box, cands: LidarProject[], eptBase: string, strict = false, lean = false): Promise<Hag | null> {
  if (!origin) throw new Error('lidar: no origin');
  const bb = boxLatLon(origin, box);
  const A = mercToLocal(origin, box);
  const mb = localToMercBox(origin, box, PAD);
  let grid: LidarGrid | null = null;
  let src = '', year = 0, failed: unknown = null;
  for (const c of cands.slice(0, MAX_PROJECTS)) {
    const base = `${eptBase}${c.n}/`;
    let g: LidarGrid;
    try {
      const E = await ept(base);
      const { maxD, nodes } = await nodesFor(base, E, mb, (bb.s + bb.n) / 2);
      if (!nodes.length) continue;
      g = new LidarGrid(box.x0 - PAD, box.z0 - PAD, 1, box.x1 + PAD, box.z1 + PAD);
      // Up to CONC nodes in flight, but added to the grid in node order: the ground sums are
      // float32, so the order of the adds decides their last bits — taken as the network
      // delivered them, two reads of one cell could differ by a centimetre's rounding. In
      // order, a desktop's own read and the precomputed record (scripts/measure-cells.mjs) agree.
      const G = g;
      const add = (X: number, Y: number, Z: number, C: number) => {
        if (X < mb[0] || X > mb[2] || Y < mb[1] || Y > mb[3]) return;
        G.add(A.a * X + A.b * Y + A.c, A.d * X + A.e * Y + A.f, Z, C);
      };
      const pend: (Promise<Pts | ArrayBuffer> | null)[] = [];
      const ahead = () => {
        const k = nodes[pend.length];
        if (k == null) return;
        const url = `${base}ept-data/${k}.laz`;
        const p = lean ? get(url).then((r) => r.arrayBuffer()) : points(url, +k.split('-')[0] <= maxD - 2);
        p.catch(() => {}); // (rejections surface when their turn is awaited)
        pend.push(p);
      };
      for (let i = 0; i < CONC; i++) ahead();
      const LP = lean ? await lazperf() : null;
      for (let i = 0; i < nodes.length; i++) {
        const P = await pend[i]!;
        pend[i] = null;
        ahead();
        if (lean) decode(LP!, P as ArrayBuffer, () => {}, (_, X, Y, Z, C) => add(X, Y, Z, C));
        else for (let j = 0, Q = P as Pts; j < Q.X.length; j++) add(Q.X[j], Q.Y[j], Q.Z[j], Q.C[j]);
      }
    } catch (e) {
      if (strict) throw e;
      failed = e;
      continue;
    }
    if (g.groundFraction() < 0.02) continue; // outline said yes, the survey says no (or unclassified)
    if (!grid) (grid = g), (src = c.n), (year = c.y);
    else grid.fillFrom(g);
    if (grid.surfaceFraction() > 0.9) break;
  }
  if (!grid) {
    if (failed) throw failed;
    return null;
  }
  return { x0: grid.x0, z0: grid.z0, res: grid.res, w: grid.w, h: grid.h, v: grid.hag(), chm: grid.canopy(), cov: grid.coverage(box, 16), src, year };
}


// ---------- one request ----------
export interface CellReq {
  ck: string; box: Box; origin: LatLon; cands: LidarProject[]; ept: string;
  bld: { k: string; r: number[]; prior?: 'gable' | 'hip' | 'flat'; house: boolean; hm?: number }[]; // rings in 0.1 m ints; hm = mapped height (m)
  mapped: number[][]; // mapped (non-guess) footprint rings, 0.1 m ints — masks for detection
  wantNew: boolean; wantTrees: boolean;
  strict?: boolean; // the precompute script, the tile service: a failed read throws (see hagFor)
  lean?: boolean; // the tile service: nodes streamed into the grid, nothing kept after the cell (see hagFor)
}
export interface CellRes {
  none?: 1; src?: string; year?: number;
  fits: [string, number[]][]; // [key, [h, eav, rs, q] | []]
  nb?: { r: number[]; m: number[] }[]; t?: number[]; tc?: number[];
  canopy?: 'classified' | 'unclassified';
}

const hagMem = new Map<string, Promise<Hag | null>>();
const hagDone = new Set<string>();
// Cells read two at a time, newest request first (the player has moved on); a finishing
// read hands its slot straight to the next waiter.
let running = 0;
const waiting: (() => void)[] = [];
async function limited<T>(f: () => Promise<T>): Promise<T> {
  if (running >= 2) await new Promise<void>((r) => waiting.push(r));
  else running++;
  try {
    return await f();
  } finally {
    const next = waiting.pop();
    if (next) next();
    else running--;
  }
}
const ringOf = (f: number[]): [number, number][] => {
  const r: [number, number][] = [];
  for (let i = 0; i + 1 < f.length; i += 2) r.push([f[i] / 10, f[i + 1] / 10]);
  return r;
};

export async function measureCell(q: CellReq): Promise<CellRes> {
  origin = q.origin;
  const ck = q.ck;
  let gp = hagMem.get(ck);
  if (!gp) {
    const t0 = performance.now();
    log(`lidar ${ck}: reading for ${q.bld.length} footprints${q.wantTrees ? ' + trees' : ''}`);
    hagMem.set(ck, (gp = limited(() => hagFor(q.box, q.cands, q.ept, !!q.strict, !!q.lean))));
    void gp.then((g) => { hagDone.add(ck); log(g ? `lidar ${ck}: ${g.src} read in ${((performance.now() - t0) / 1000).toFixed(1)} s` : `lidar ${ck}: no survey covers this cell`); }, (e) => { log(`lidar ${ck}: unavailable (${e?.message ?? e})`); hagMem.delete(ck); });
    for (const k of hagMem.keys()) {
      if (hagMem.size <= 4) break;
      if (hagDone.has(k)) hagMem.delete(k), hagDone.delete(k);
    }
  }
  const G = await gp; // throws on network trouble — the caller builds from priors
  if (q.lean) hagMem.delete(ck), hagDone.delete(ck); // (nothing outlives the cell: the grid goes with this call)
  if (!G) return { none: 1, fits: [] };
  const out: CellRes = { src: G.src, year: G.year, fits: [], canopy: G.chm ? 'classified' : 'unclassified' };
  const fresh: [string, number[], boolean, number | undefined][] = q.bld.map((b) => {
    const m = measureFootprint(ringOf(b.r), (x, z) => hagAt(G, x, z), b.prior);
    return [b.k, m ? [m.h, m.eav, RS.indexOf(m.rs), m.q] : [], b.house, b.hm];
  });
  // Vertical units: EPT keeps each survey's Z units, and some 3DEP deliveries are in US
  // survey feet (the index doesn't say). Where heights are mapped (a city's own survey — most
  // of Manhattan), the measured/mapped ratio says it outright (~3.28 = feet); elsewhere, houses
  // standing ~25 m tall on median is feet.
  const med = (a: number[]) => a.sort((x, y) => x - y)[a.length >> 1];
  const rs = fresh.filter(([, m, , hm]) => hm && hm >= 6 && m.length && m[3] >= 0.35).map(([, m, , hm]) => m[0] / hm!);
  const hs = fresh.filter(([, m, house]) => house && m.length && m[3] >= 0.35).map(([, m]) => m[0]);
  const byRatio = rs.length >= 6 ? med(rs) : 0;
  const feet = byRatio ? (byRatio > 2.4 ? 0.3048006 : 1) : hs.length >= 8 && med(hs) > 14 ? 0.3048006 : 1;
  if (feet !== 1) log(`lidar ${ck}: ${G.src} reads as feet (${byRatio ? `measured/mapped ${byRatio.toFixed(2)}` : `median house ${med(hs).toFixed(1)}`}) — scaling`);
  for (const [k, m] of fresh) out.fits.push([k, m.length ? [+(m[0] * feet).toFixed(2), +(m[1] * feet).toFixed(2), m[2], +m[3].toFixed(2)] : []]);
  const [clat, clon] = ck.split(',').map(Number);
  const toLL = (x: number, z: number) => {
    const [lat, lon] = unprojectLocal(origin!, x, z);
    return [Math.round((lat - clat) * 1e6), Math.round((lon - clon) * 1e6)];
  };
  let hits: { ring: [number, number][]; h: number }[] = [];
  if (q.wantNew || q.wantTrees) {
    // Unmapped buildings: the mask is the MAPPED footprints (+1.5 m) — hybrid-fill guesses
    // mustn't hide the real roofs they stand in for.
    const mappedRings = q.mapped.map(ringOf);
    hits = detectBuildings(G, G.v, G.chm, ringMask(G, mappedRings, 1.5), q.box);
    if (q.wantNew)
      out.nb = hits.map((hit) => {
        const m = measureFootprint(hit.ring, (x, z) => hagAt(G, x, z));
        const r = hit.ring.flatMap(([x, z]) => toLL(x, z));
        return { r, m: m ? [+(m.h * feet).toFixed(2), +(m.eav * feet).toFixed(2), RS.indexOf(m.rs), +m.q.toFixed(2)] : [+(hit.h * feet).toFixed(2)] };
      });
    if (q.wantTrees) {
      // Trees: the vegetation-classified canopy when the survey has one, else every
      // non-ground return with every roof (mapped + found, +1 m) masked, smooth tops rejected.
      const blocked = ringMask(G, [...mappedRings, ...hits.map((h) => h.ring)], 1.0);
      const T = detectTrees(G, G.chm ?? G.v, blocked, q.box, !G.chm);
      out.t = T.flatMap((t) => [...toLL(t.x, t.z), Math.round(t.h * feet * 10), Math.round(t.r * 10)]);
    }
    out.tc = Array.from(G.cov);
  }
  return out;
}
