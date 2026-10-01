// Real roof colours from aerial photographs — the pure half (no network, no DOM), unit-tested.
//
// Where a public orthophoto covers a cell (USDA NAIP over the lower 48: 0.6 m, public domain),
// a roof's colour is read off the photo instead of drawn from the regional palette. Three things
// stand between a photo and a roof colour, and each is handled here:
//   1. the map's outline and the photo disagree by a few metres (survey offsets, a house leaning
//      away from the camera) — the cell's footprints are slid together to where they sit best on
//      roofs (`registerCell`), then each house nudged on its own;
//   2. a footprint holds more than roof — trees over it, its own shaded slope, a chimney's shadow,
//      gutters and the lawn at its edge — so the outline is eroded, the greenery and the deep
//      shadow thrown out, and the sunlit middle of what's left kept (`sampleRoof`);
//   3. the photo has a cast — NAIP leans green, and its haze turns dark roofs cyan and light ones
//      yellow. The cast is fitted per cell as a line in brightness against something known to be
//      grey: the streets where they show (asphalt and concrete are neutral the world over), else
//      the cell's roofs taken together (most roofs are greys and browns) — and taken back out
//      (`fitCast`, `uncast`). A roof's colour is what's left: its own difference from grey.
// The baked shore carries roof colours sampled this way at bake time (scripts/fetch-imagery.mjs)
// but already lifted for paint and never balanced: `tileRoofs` undoes the lift and balances them
// per tile, so the pack itself never changes.
// `aerialRoof` turns a balanced sample into the colour the painter mixes: the measured hue and
// lightness kept, chroma held to what roofing comes in.
import type { Building } from './data';

export type RGB = [number, number, number];

/** An orthophoto in the tile's local frame: pixel (i, j)'s centre is at
 *  x = x0 + (i + 0.5)·dx, z = z0 + (j + 0.5)·dz (north up, so rows run south with +z). */
export interface Aerial {
  w: number;
  h: number;
  px: Uint8Array | Uint8ClampedArray; // RGB or RGBA, row-major
  ch: 3 | 4;
  x0: number;
  z0: number;
  dx: number;
  dz: number;
}

/** A cell's cast: what each channel sits above grey, as a line in the pixel's mean (0–255):
 *  off_c(m) = a_c + b_c·m. Taking it away leaves a grey thing grey at every brightness. */
export interface Cast { a: RGB; b: RGB; n: number }
export const NO_CAST: Cast = { a: [0, 0, 0], b: [0, 0, 0], n: 0 };

const clamp = (v: number, lo: number, hi: number) => (v < lo ? lo : v > hi ? hi : v);
export const hex = (c: RGB) => (clamp(Math.round(c[0]), 0, 255) << 16) | (clamp(Math.round(c[1]), 0, 255) << 8) | clamp(Math.round(c[2]), 0, 255);
export const rgbOf = (v: number): RGB => [(v >> 16) & 255, (v >> 8) & 255, v & 255];

// ---------- colour helpers (HSL on 0–1) ----------
export function rgbToHsl(r: number, g: number, b: number): [number, number, number] {
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b), l = (mx + mn) / 2;
  if (mx - mn < 1e-9) return [0, 0, l];
  const d = mx - mn, s = l > 0.5 ? d / (2 - mx - mn) : d / (mx + mn);
  const h = mx === r ? (g - b) / d + (g < b ? 6 : 0) : mx === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return [h / 6, s, l];
}
export function hslToRgb(h: number, s: number, l: number): [number, number, number] {
  if (s <= 0) return [l, l, l];
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s, p = 2 * l - q;
  const f = (t: number) => {
    t = ((t % 1) + 1) % 1;
    return t < 1 / 6 ? p + (q - p) * 6 * t : t < 1 / 2 ? q : t < 2 / 3 ? p + (q - p) * (2 / 3 - t) * 6 : p;
  };
  return [f(h + 1 / 3), f(h), f(h - 1 / 3)];
}

// ---------- the photo's cast ----------
// Fitted on robust bin medians: the observations' chroma (each channel minus their mean) binned
// by brightness, a median per bin, then a weighted line through the bins. Few observations lean
// on the prior (NAIP's usual cast, below) — a cell of five sheds can't say much on its own.
// Clamped to what a camera and the air can do: no fit may move a channel more than 28 levels.
export function fitCast(obs: readonly RGB[], weights?: readonly number[], prior: Cast = NO_CAST, k = 16): Cast {
  const BIN = 16;
  const bins = new Map<number, { m: number[]; d: number[][]; w: number }>();
  obs.forEach((o, i) => {
    const m = (o[0] + o[1] + o[2]) / 3;
    if (!(m > 8 && m < 248)) return;
    const key = Math.floor(m / BIN);
    let b = bins.get(key);
    if (!b) bins.set(key, (b = { m: [], d: [[], [], []], w: 0 }));
    b.m.push(m);
    for (let c = 0; c < 3; c++) b.d[c].push(o[c] - m);
    b.w += weights ? weights[i] : 1;
  });
  const pts: { m: number; d: RGB; w: number }[] = [];
  let n = 0;
  for (const key of [...bins.keys()].sort((p, q) => p - q)) {
    const b = bins.get(key)!;
    if (b.m.length < 4) continue;
    pts.push({ m: median(b.m), d: [median(b.d[0]), median(b.d[1]), median(b.d[2])], w: b.w });
    n += b.m.length;
  }
  if (!pts.length) return prior;
  const W = pts.reduce((s, p) => s + p.w, 0), mM = pts.reduce((s, p) => s + p.m * p.w, 0) / W;
  const sxx = pts.reduce((s, p) => s + p.w * (p.m - mM) ** 2, 0);
  const spread = Math.sqrt(sxx / W); // (a narrow band of brightness can't say how the cast tilts)
  const a: RGB = [0, 0, 0], b: RGB = [0, 0, 0];
  for (let c = 0; c < 3; c++) {
    const mY = pts.reduce((s, p) => s + p.d[c] * p.w, 0) / W;
    let slope = spread > 12 ? pts.reduce((s, p) => s + p.w * (p.m - mM) * (p.d[c] - mY), 0) / sxx : prior.b[c];
    slope = clamp(slope, -0.25, 0.25);
    b[c] = slope;
    a[c] = mY - slope * mM;
  }
  // a cast moves chroma, never brightness: the three offsets sum to nothing
  const ma = (a[0] + a[1] + a[2]) / 3, mb = (b[0] + b[1] + b[2]) / 3;
  for (let c = 0; c < 3; c++) (a[c] -= ma), (b[c] -= mb);
  const t = n / (n + k);
  const out: Cast = { a: [0, 0, 0], b: [0, 0, 0], n };
  for (let c = 0; c < 3; c++) {
    out.b[c] = t * b[c] + (1 - t) * prior.b[c];
    out.a[c] = t * a[c] + (1 - t) * prior.a[c];
    // keep the correction physical over the brightness roofs span
    const lo = out.a[c] + out.b[c] * 30, hi = out.a[c] + out.b[c] * 220;
    if (Math.abs(lo) > 28 || Math.abs(hi) > 28) {
      const s = 28 / Math.max(Math.abs(lo), Math.abs(hi));
      out.a[c] *= s;
      out.b[c] *= s;
    }
  }
  return out;
}
export function uncast(o: RGB, cast: Cast): RGB {
  const m = (o[0] + o[1] + o[2]) / 3;
  return [o[0] - (cast.a[0] + cast.b[0] * m), o[1] - (cast.a[1] + cast.b[1] * m), o[2] - (cast.a[2] + cast.b[2] * m)];
}
function median(v: number[]): number {
  const s = [...v].sort((p, q) => p - q), n = s.length;
  return n % 2 ? s[(n - 1) / 2] : (s[n / 2 - 1] + s[n / 2]) / 2;
}

/** NAIP's cast where a cell has too few roofs to say (the prior the fits lean on): measured over
 *  the 25,770 roofs of the baked shore pack (2026 bake, USGS NAIP ImageServer) — green throughout,
 *  cyan haze over the dark roofs, yellow over the light. */
export const NAIP_CAST: Cast = { a: [-18, 3, 15], b: [0.129, 0.018, -0.147], n: 0 };
/** When a cell's roofs are their own grey reference, the typical roof isn't quite grey: North
 *  American roofing leans warm (weathered-wood, driftwood, hickory and brown blends sell beside
 *  charcoal and pewter; blue-greys are the few). Balanced against the streets, a roof keeps
 *  whatever warmth it really has and needs none of this. */
export const ROOF_WARMTH: RGB = [3, 0.5, -3.5];
/** A cast that leaves a cell's typical roof `warm` instead of grey. */
export const toward = (cast: Cast, warm: RGB): Cast => ({ a: [cast.a[0] - warm[0], cast.a[1] - warm[1], cast.a[2] - warm[2]], b: cast.b, n: cast.n });

// ---------- the painter's roof ----------
// A balanced aerial colour → the roof colour the recipe uses. The photo is hazy and soft (a 0.6 m
// pixel mixes a roof with its gutters and shadow): a little contrast and colour go back in. Hue
// and lightness are the measurement and stay; chroma is held to what roofing comes in — clay and
// brown shingle can be strong, painted metal (greens, blues) only so far, and a sage or teal
// that's left is more likely a tree's shade than a copper roof. A light roof, and a flat one
// (membrane, gravel, tar), mirrors the sky: its blue is the sky's, not its own.
export function aerialRoof(c: number, flat: boolean): number {
  const [h, s, l] = rgbToHsl(((c >> 16) & 255) / 255, ((c >> 8) & 255) / 255, (c & 255) / 255);
  const deg = h * 360, warm = deg < 45 || deg >= 335;
  let cap = warm ? 0.36 : deg < 75 ? 0.2 : deg < 170 ? 0.1 : deg < 265 ? 0.11 : 0.08;
  if (!warm && (flat || l > 0.55)) cap *= 0.5;
  const s2 = Math.min(cap, s * 1.5);
  const l2 = clamp(0.5 + (l - 0.5) * 1.1, flat ? 0.2 : 0.12, flat ? 0.72 : 0.6);
  const [R, G, B] = hslToRgb(h, s2, l2);
  return hex([R * 255, G * 255, B * 255]);
}

// ---------- the baked shore's roofs ----------
// The bake (scripts/lib/colour.mjs paintFromAerial) lifted each sample for paint: saturation
// ×1.3 (to 0.55), lightness spread ×1.18 about the middle (to 0.16–0.88). Undone here, so the
// balance sees what the photo saw.
export function unpaint(c: number): RGB {
  const [h, s2, l2] = rgbToHsl(((c >> 16) & 255) / 255, ((c >> 8) & 255) / 255, (c & 255) / 255);
  const s = Math.min(1, s2 / 1.3), l = clamp(0.5 + (l2 - 0.5) / 1.18, 0, 1);
  const [R, G, B] = hslToRgb(h, s, l);
  return [R * 255, G * 255, B * 255];
}

/** What the region's roof colours are, when its pack says so (manifest `sources.roofColours`):
 *  'painted' — a baked pack whose `rc` are NAIP samples lifted by the bake's paintFromAerial
 *  (all but the few the map tags, which match a tag-table colour exactly). Set on the main
 *  thread and in the tile worker before anything builds. */
export type RoofSource = 'painted' | null;
let roofSrc: RoofSource = null;
let tagColours: ReadonlySet<number> = new Set();
export function setRoofSource(s: RoofSource, tags?: ReadonlySet<number>) {
  roofSrc = s;
  if (tags) tagColours = tags;
}
export const roofSource = () => roofSrc;

/** Each building's balanced aerial roof colour, or −1 (none: the recipe's own roof). Streamed
 *  tiles carry theirs in `ar` (balanced already, against the cell's streets); a baked pack's
 *  (`baked`) are decoded and balanced here, one cast per tile from all its roofs. Pure: a
 *  function of the tile (and the region's roof source). */
export function tileRoofs(bs: readonly Building[], baked = true): Int32Array {
  const out = new Int32Array(bs.length).fill(-1);
  let any = false;
  bs.forEach((b, i) => { if (b.ar != null) (out[i] = b.ar), (any = true); });
  if (any || !baked || roofSrc !== 'painted') return out;
  const idx: number[] = [], obs: RGB[] = [];
  bs.forEach((b, i) => {
    if (b.rc == null || tagColours.has(b.rc)) return;
    idx.push(i);
    obs.push(unpaint(b.rc));
  });
  if (!obs.length) return out;
  const cast = toward(fitCast(obs, undefined, NAIP_CAST), ROOF_WARMTH);
  idx.forEach((i, j) => (out[i] = hex(uncast(obs[j], cast))));
  return out;
}

// ---------- reading a photo ----------
type P2 = [number, number];
/** Pixel classes, on balanced values: no data (outside the survey), greenery, or usable. */
const NODATA = 0, VEG = 1, OK = 2;
function classify(r: number, g: number, b: number): number {
  if (r + g + b < 12) return NODATA;
  // excess green: lawns and canopy (NAIP is flown in leaf-on season), and the dark green-black
  // of a tree's own shade
  const exg = 2 * g - r - b;
  if (exg > 22 && g > r + 4) return VEG;
  if (exg > 10 && g > r + 2 && r + g + b < 180) return VEG;
  return OK;
}

/** The pixels whose centres lie inside a ring, at least `erode` metres in from its edges — as
 *  image indices (j·w + i), in scan order. */
export function ringPixels(img: Aerial, ring: readonly P2[], erode: number): number[] {
  let x0 = Infinity, z0 = Infinity, x1 = -Infinity, z1 = -Infinity;
  for (const [x, z] of ring) (x0 = Math.min(x0, x)), (x1 = Math.max(x1, x)), (z0 = Math.min(z0, z)), (z1 = Math.max(z1, z));
  const i0 = Math.max(0, Math.floor((x0 - img.x0) / img.dx - 0.5)), i1 = Math.min(img.w - 1, Math.ceil((x1 - img.x0) / img.dx - 0.5));
  const j0 = Math.max(0, Math.floor((z0 - img.z0) / img.dz - 0.5)), j1 = Math.min(img.h - 1, Math.ceil((z1 - img.z0) / img.dz - 0.5));
  const out: number[] = [];
  const n = ring.length;
  for (let j = j0; j <= j1; j++) {
    const z = img.z0 + (j + 0.5) * img.dz;
    for (let i = i0; i <= i1; i++) {
      const x = img.x0 + (i + 0.5) * img.dx;
      let ins = false, d2 = Infinity;
      for (let a = 0, b = n - 1; a < n; b = a++) {
        const [ax, az] = ring[a], [bx, bz] = ring[b];
        if (az > z !== bz > z && x < ((bx - ax) * (z - az)) / (bz - az) + ax) ins = !ins;
        const ex = bx - ax, ez = bz - az, L = ex * ex + ez * ez;
        const t = L > 0 ? clamp(((x - ax) * ex + (z - az) * ez) / L, 0, 1) : 0;
        const qx = ax + ex * t - x, qz = az + ez * t - z;
        d2 = Math.min(d2, qx * qx + qz * qz);
      }
      if (ins && d2 >= erode * erode) out.push(j * img.w + i);
    }
  }
  return out;
}

/** How a footprint's pixels read as one roof at a given shift (pixels): little greenery, one
 *  surface's worth of brightness spread. Higher is better. (`img` balanced already.) */
function roofScore(img: Aerial, mask: readonly number[], si: number, sj: number): number {
  const { px, ch, w, h } = img;
  let n = 0, veg = 0, s = 0, s2 = 0;
  for (const p of mask) {
    const i = (p % w) + si, j = Math.floor(p / w) + sj;
    if (i < 0 || j < 0 || i >= w || j >= h) continue;
    const o = (j * w + i) * ch, r = px[o], g = px[o + 1], b = px[o + 2];
    const k = classify(r, g, b);
    if (k === NODATA) continue;
    n++;
    if (k === VEG) { veg++; continue; }
    const m = (r + g + b) / 3;
    s += m;
    s2 += m * m;
  }
  if (n < 4) return -2;
  const ok = n - veg, sd = ok > 1 ? Math.sqrt(Math.max(0, s2 / ok - (s / ok) ** 2)) : 40;
  return 1 - (veg / n) * 1.5 - Math.min(1, sd / 45) * 0.5;
}

/** The photo with a cast taken out (a copy, RGB). No-data stays black. */
export function balanced(img: Aerial, cast: Cast): Aerial {
  const n = img.w * img.h, out = new Uint8ClampedArray(n * 3), { px, ch } = img;
  for (let p = 0; p < n; p++) {
    const o = p * ch, r = px[o], g = px[o + 1], b = px[o + 2];
    if (r + g + b < 12) continue;
    const m = (r + g + b) / 3;
    out[p * 3] = r - (cast.a[0] + cast.b[0] * m);
    out[p * 3 + 1] = g - (cast.a[1] + cast.b[1] * m);
    out[p * 3 + 2] = b - (cast.a[2] + cast.b[2] * m);
    // (a dark pixel the balance pushed to black is still data)
    if (out[p * 3] + out[p * 3 + 1] + out[p * 3 + 2] < 12) out[p * 3 + 1] = 12;
  }
  return { ...img, px: out, ch: 3 };
}

const erodeFor = (area: number) => clamp(0.1 * Math.sqrt(area), 0.7, 1.5);
const ringArea = (r: readonly P2[]) => {
  let a = 0;
  for (let i = 0, j = r.length - 1; i < r.length; j = i++) a += (r[j][0] - r[i][0]) * (r[j][1] + r[i][1]);
  return Math.abs(a / 2);
};

/** The cell's footprints slid together (pixels, ±`reach`) to where they sit best on roofs: the
 *  map's survey and the photo's disagree by a few metres over a whole neighbourhood. Ties go to
 *  the smaller shift, scanned in a fixed order — the same answer every time. */
export function registerCell(img: Aerial, masks: readonly number[][], reach = 6): [number, number] {
  const use = masks.filter((m) => m.length >= 12).slice(0, 120);
  if (use.length < 3) return [0, 0];
  const score = (si: number, sj: number) => {
    let s = 0;
    for (const m of use) s += roofScore(img, m, si, sj);
    return s / use.length - 0.004 * Math.hypot(si, sj);
  };
  // every other pixel out to `reach`, then the pixel round the best of those
  let best: [number, number] = [0, 0], bestS = -Infinity;
  for (let sj = -reach; sj <= reach; sj += 2)
    for (let si = -reach; si <= reach; si += 2) {
      const s = score(si, sj);
      if (s > bestS + 1e-9) (bestS = s), (best = [si, sj]);
    }
  const [ci, cj] = best;
  for (let sj = cj - 1; sj <= cj + 1; sj++)
    for (let si = ci - 1; si <= ci + 1; si++) {
      if (si === ci && sj === cj) continue;
      const s = score(si, sj);
      if (s > bestS + 1e-9) (bestS = s), (best = [si, sj]);
    }
  return best;
}

export interface RoofSample { c: RGB; n: number; veg: number }
/** One roof's colour from its pixels (shifted by si, sj): the greenery and the no-data dropped,
 *  then the sunlit middle kept — the darkest 35% (its shaded slope, a tree's or a chimney's
 *  shadow) and the brightest 15% (glints, skylights, vent stacks, white trim) left out — and the
 *  median of what's left, channel by channel. Null when there isn't a roof's worth to read
 *  (most of it under trees, or outside the survey). (`img` balanced already.) */
export function sampleRoof(img: Aerial, mask: readonly number[], si: number, sj: number): RoofSample | null {
  const { px, ch, w, h } = img;
  const ok: { m: number; c: RGB }[] = [];
  let n = 0, veg = 0;
  for (const p of mask) {
    const i = (p % w) + si, j = Math.floor(p / w) + sj;
    if (i < 0 || j < 0 || i >= w || j >= h) continue;
    const o = (j * w + i) * ch;
    const c: RGB = [px[o], px[o + 1], px[o + 2]];
    const k = classify(c[0], c[1], c[2]);
    if (k === NODATA) continue;
    n++;
    if (k === VEG) veg++;
    else ok.push({ m: (c[0] + c[1] + c[2]) / 3, c });
  }
  if (n < 5 || ok.length < 4 || veg / n > 0.6) return null;
  ok.sort((p, q) => p.m - q.m);
  const lo = Math.floor(ok.length * 0.35), hi = Math.max(lo + 1, Math.ceil(ok.length * 0.85));
  const band = ok.slice(lo, hi);
  const c: RGB = [median(band.map((q) => q.c[0])), median(band.map((q) => q.c[1])), median(band.map((q) => q.c[2]))];
  return { c, n: band.length, veg: veg / n };
}

// Streets the photo reads as grey: paved, above ground, wide enough to see.
const PAVED = new Set(['motorway', 'trunk', 'primary', 'secondary', 'tertiary', 'unclassified', 'residential', 'living_street', 'service', 'primary_link', 'secondary_link', 'tertiary_link', 'pedestrian']);
/** Grey references from the cell's streets: pixels down the middle of each paved street (the
 *  middle 60% of its width, every pixel's length), greenery and deep shade left out. Raw values. */
export function streetSamples(img: Aerial, roads: readonly { p: number[]; c: string; w: number; br?: unknown; tu?: unknown }[], cap = 12000): RGB[] {
  const out: RGB[] = [];
  const { px, ch, w, h } = img;
  const step = Math.min(Math.abs(img.dx), Math.abs(img.dz));
  for (const r of roads) {
    if (!PAVED.has(r.c) || r.br || r.tu || r.w < 3) continue;
    for (let k = 0; k + 3 < r.p.length; k += 2) {
      const ax = r.p[k] / 10, az = r.p[k + 1] / 10, bx = r.p[k + 2] / 10, bz = r.p[k + 3] / 10;
      const L = Math.hypot(bx - ax, bz - az);
      if (L < 0.5) continue;
      const ux = (bx - ax) / L, uz = (bz - az) / L, half = r.w * 0.3;
      for (let t = step / 2; t < L; t += step)
        for (let q = -half; q <= half; q += step) {
          const x = ax + ux * t - uz * q, z = az + uz * t + ux * q;
          const i = Math.floor((x - img.x0) / img.dx), j = Math.floor((z - img.z0) / img.dz);
          if (i < 0 || j < 0 || i >= w || j >= h) continue;
          const o = (j * w + i) * ch, c: RGB = [px[o], px[o + 1], px[o + 2]];
          if (classify(c[0], c[1], c[2]) !== OK) continue;
          const m = (c[0] + c[1] + c[2]) / 3;
          if (m < 30 || m > 235) continue; // a tree's shadow across the street, a white car
          out.push(c);
          if (out.length >= cap) return out;
        }
    }
  }
  return out;
}

export interface CellRoofs {
  cast: Cast;
  by: 'streets' | 'roofs' | 'prior';
  shift: [number, number]; // pixels
  roofs: Map<number, number>; // building index → balanced colour 0xRRGGBB
  nodata: boolean; // the photo doesn't cover this cell
}
/** A whole cell read off its photo: the cast (from its streets, else its roofs), the footprints
 *  registered, each building's balanced roof colour. Skips what has no roof of its own to see:
 *  guessed fills, building parts and the outlines they draw, canopies, lifted pieces. */
export function readCell(img: Aerial, tile: { buildings: readonly Building[]; roads: readonly { p: number[]; c: string; w: number; br?: unknown; tu?: unknown }[] }): CellRoofs {
  // no data at all (outside the survey): a few hundred pixels across the image tell
  let data = 0, seen = 0;
  for (let k = 0; k < 400; k++) {
    const i = Math.floor(((k % 20) + 0.5) * (img.w / 20)), j = Math.floor((Math.floor(k / 20) + 0.5) * (img.h / 20));
    const o = (j * img.w + i) * img.ch;
    seen++;
    if (img.px[o] + img.px[o + 1] + img.px[o + 2] >= 12) data++;
  }
  const roofs = new Map<number, number>();
  if (data < seen * 0.1) return { cast: NO_CAST, by: 'prior', shift: [0, 0], roofs, nodata: true };
  // the cast, from the streets when they show enough grey
  const st = streetSamples(img, tile.roads);
  let cast = NAIP_CAST, by: CellRoofs['by'] = 'prior';
  if (st.length >= 400) (cast = fitCast(st, undefined, NAIP_CAST, 400)), (by = 'streets');
  const todo: { i: number; mask: number[] }[] = [];
  tile.buildings.forEach((b, i) => {
    if (b.gen === 'fill' || b.pt || b.hp || b.cn || (b.lf ?? 0) > 1.5 || b.in) return;
    const ring: P2[] = [];
    for (let k = 0; k + 1 < b.r.length; k += 2) ring.push([b.r[k] / 10, b.r[k + 1] / 10]);
    if (ring.length < 3) return;
    const area = ringArea(ring);
    if (area < 12) return;
    let mask = ringPixels(img, ring, erodeFor(area));
    if (mask.length < 6) mask = ringPixels(img, ring, 0.3);
    if (mask.length >= 4) todo.push({ i, mask });
  });
  const bal = balanced(img, cast);
  const shift = registerCell(bal, todo.map((t) => t.mask));
  const raw: { i: number; c: RGB }[] = [];
  for (const t of todo) {
    // each house on its own: a pixel either way of the cell's shift (a tall one leans further)
    let bi = shift[0], bj = shift[1], bs = -Infinity;
    for (let dj = -1; dj <= 1; dj++)
      for (let di = -1; di <= 1; di++) {
        const s = roofScore(bal, t.mask, shift[0] + di, shift[1] + dj) - 0.02 * Math.hypot(di, dj);
        if (s > bs + 1e-9) (bs = s), (bi = shift[0] + di), (bj = shift[1] + dj);
      }
    const r = sampleRoof(bal, t.mask, bi, bj);
    if (r) raw.push({ i: t.i, c: r.c });
  }
  // no streets to balance against (a cell of private lanes, a campus): the roofs taken together
  if (by !== 'streets' && raw.length) {
    // (the samples are already balanced by the prior: fit what's left of the cast on top)
    const rest = toward(fitCast(raw.map((r) => r.c), undefined, NO_CAST), ROOF_WARMTH);
    for (const r of raw) r.c = uncast(r.c, rest);
    cast = { a: [0, 1, 2].map((c) => cast.a[c] + rest.a[c]) as RGB, b: [0, 1, 2].map((c) => cast.b[c] + rest.b[c]) as RGB, n: rest.n };
    by = 'roofs';
  }
  for (const r of raw) roofs.set(r.i, hex(r.c));
  return { cast, by, shift, roofs, nodata: false };
}
