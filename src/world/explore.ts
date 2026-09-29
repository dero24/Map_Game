// Paint-as-you-explore: every place starts as a pencil underdrawing and blooms into watercolor once
// you've been there. The record is a sparse bitmap on a GLOBAL grid (Web-Mercator metres, 8 m cells,
// 32×32-cell blocks) so it survives re-anchoring, teleports and every region — Sea Bright and
// Santa Fe share one sketchbook. Blocks persist to IndexedDB; a walker-centred R8 texture window
// (4 km, 8 m texels) feeds the post pass (U.uExplore / U.uExploreBox), which draws unpainted
// ground as graphite on paper and blooms colour in with a wet, noisy edge.
//
// Far away, a coarser record: 64 m "far cells" (8×8 fine cells; 32×32 of them to a block, keyed
// `f:bx,by`), each holding what a photo painted there (paintSeen — the distance in frame) and the
// painted share of the fine cells under it. A second, RG window (~32 km, 64 m texels: R photo, G
// share → U.uExploreFar / U.uExploreFarBox) lets the far sketch (postParams.sketchFar) show a
// painted far place as paint.
import * as THREE from 'three';
import { openDB, type IDBPDatabase } from 'idb';
import { U } from '../render/shared';
import type { SeenGrid } from '../render/seen';

const R_EARTH = 6378137;
const K = (Math.PI / 180) * R_EARTH;
export const CELL = 8; // mercator metres per cell (≈ 6 m on the ground at 40°N)
export const BLOCK = 32; // cells per block side
const WIN = 4096; // local metres covered by the texture window
const TEX = 512; // texels per side (8 m each)
const FULL = 200; // a cell counts as "painted" at this value
const AREA = BLOCK * BLOCK; // cells per block (a far block holds two layers: photo paint, then the share)
export const FAR = 8; // fine cells per far cell side (64 mercator m)
const FAR_WIN = 32768; // local metres covered by the far window
const FAR_TEX = 512; // its texels per side (64 m each)
const FAR_STEP = 1024; // the far window re-centres (snapped to this) once you're this far off its centre
/** How far out (m, level) a photo paints: inside the far window wherever you stand in it. */
export const SEEN_REACH = 15000;
/** Nearer than this (m, level) a photo paints the 8 m cells; past it, the 64 m far cells. */
export const SEEN_SPLIT = 2000;
const SEEN_DUR = 1.1; // s: one cell's bloom, blank to full
const SEEN_DELAY = 0.8; // s: the colour runs out from you — the farthest cells start this much later

export const mercX = (lon: number) => lon * K;
export const mercY = (lat: number) => R_EARTH * Math.log(Math.tan(Math.PI / 4 + (lat * Math.PI) / 360));
export const blockKey = (bx: number, by: number) => `${bx},${by}`;
export const farKey = (bx: number, by: number) => `f:${bx},${by}`;

/** Reveal radius (m) for the eye's height above the ground: walking `reach` (45 m), a plane paints
 *  wide. */
export function revealRadius(heightAboveGround: number, reach = 45) {
  return Math.min(Math.max(450, reach), reach + Math.max(0, heightAboveGround - 2) * 0.7);
}
/** Bloom rate (value/s) for a cell `d` m from the walker inside radius `r`: fast near, slow at the rim. */
export function bloomRate(d: number, r: number) {
  if (d >= r) return 0;
  return 320 * Math.sqrt(1 - d / r) + 40;
}

/** Do two neighbouring samples of a frame (inverse view depths `a`, `b`; `p` before a and `n` after
 *  b along the same row or column, 0 = none) lie on one surface, so what's between them was seen?
 *  Yes within ~8% in depth, or on a smooth ramp in 1/depth: a plane is affine in 1/depth across the
 *  screen, so the ground running away at a grazing angle steps evenly (on one side of the pair at
 *  least — the other may be where it meets a wall or a hill's foot), while a silhouette (a roof
 *  against the far hills) jumps far more than the steps either side of it. */
export function joined(a: number, b: number, p: number, n: number) {
  if (!(a > 0 && b > 0)) return false;
  const g = a - b;
  if (Math.abs(g) <= 0.08 * Math.max(a, b)) return true;
  const gp = p > 0 ? p - a : 0, gn = n > 0 ? b - n : 0;
  if (gp * g < 0 || gn * g < 0) return false; // the steps turn: not one ramp
  return Math.abs(g) <= 2.5 * Math.max(Math.abs(gp), Math.abs(gn));
}

export interface ExploreStats { painted: number; session: number; km2: number }
/** What a photo painted: cells newly coloured (fine and far), their area, how far out it reached (m). */
export interface SeenPaint { cells: number; km2: number; reach: number }
/** Where a photo was taken from (world metres; `y` the eye's height, for `ground`). */
export interface SeenEye { x: number; z: number; y?: number }
export interface SeenOpts {
  reach?: number; // m, level (SEEN_REACH)
  ground?: (x: number, z: number) => number; // the terrain's height: ground past the frame's sky cut shows only while in sight
}

// a photo's bloom, per block: each stamped cell's start (1/100 s after the shot; 255 = not stamped)
interface Stamp { k: string; far: boolean; st: Uint8Array; lo: number; hi: number }
interface SeenJob { t: number; stamps: Stamp[]; at: number }
// numeric block ids while stamping (a string key per cell is slow)
const NOFF = 1 << 20, NSPAN = 1 << 21;
// One grid's stamps while a frame is laid in (cells `cs` mercator m): each cell's bloom start, by block.
class Stamps {
  readonly m = new Map<number, Uint8Array>();
  private id = NaN;
  private st: Uint8Array | undefined;
  constructor(readonly cs: number) {}
  /** mark every cell whose centre lies within `rm` of (mx, my), keeping its earliest start */
  disc(mx: number, my: number, rm: number, code: number) {
    const cs = this.cs, cx = mx / cs, cy = my / cs, r = rm / cs, r2 = r * r;
    for (let j = Math.floor(cy - r), j1 = Math.floor(cy + r); j <= j1; j++) {
      const dy = j + 0.5 - cy, by = Math.floor(j / BLOCK), ry = (j - by * BLOCK) * BLOCK;
      for (let i = Math.floor(cx - r), i1 = Math.floor(cx + r); i <= i1; i++) {
        const dx = i + 0.5 - cx;
        if (dx * dx + dy * dy > r2) continue;
        const bx = Math.floor(i / BLOCK), id = (bx + NOFF) * NSPAN + (by + NOFF);
        if (id !== this.id) {
          let st = this.m.get(id);
          if (!st) this.m.set(id, (st = new Uint8Array(AREA).fill(255)));
          this.id = id;
          this.st = st;
        }
        const n = ry + i - bx * BLOCK;
        if (code < this.st![n]) this.st![n] = code;
      }
    }
  }
}

export class Explore {
  readonly texture: THREE.DataTexture;
  readonly farTexture: THREE.DataTexture;
  private data = new Uint8Array(TEX * TEX);
  private farData = new Uint8Array(FAR_TEX * FAR_TEX * 2);
  private blocks = new Map<string, Uint8Array>();
  private requested = new Set<string>();
  private dirtyBlocks = new Set<string>();
  private db: Promise<IDBPDatabase> | null = null;
  // local → mercator affine (the region's tangent plane is linear to cm over a window)
  private m0x = 0; private m0y = 0; private sx = 1; private sy = -1;
  private cosLat = 1;
  private winX0 = Infinity; private winZ0 = Infinity;
  private winDirty = true;
  private texDirty = false;
  private tick = 0;
  private saveT = 3;
  private painted = 0;
  private session = 0;
  private fineDirty = new Set<string>(); // fine blocks whose texels need a refill
  // the far layer
  private farX0 = Infinity; private farZ0 = Infinity;
  private farWinDirty = true;
  private farTexDirty = false;
  private farShown = false;
  private farDirty = new Set<string>(); // far blocks whose far-window texels need a refill
  private farT = 0;
  private sumDirty = new Set<string>(); // fine blocks whose share in their far cells is stale
  private sumT = 0;
  private jobs: SeenJob[] = [];
  private upT = 0;
  private seenQueue: { it: Generator<void, SeenPaint>; res: (p: SeenPaint) => void }[] = [];
  private colCx = new Int32Array(TEX);
  private colFx = new Int32Array(FAR_TEX);
  enabled = true;
  /** Keep the far window filled (main: while the far sketch is on). Off, the record still keeps its far cells. */
  far = false;
  /** called with the number of cells that just crossed into "painted" (brush sounds, stats) */
  onBloom: ((n: number) => void) | null = null;

  constructor(origin: { lat: number; lon: number }) {
    this.setOrigin(origin);
    this.texture = new THREE.DataTexture(this.data, TEX, TEX, THREE.RedFormat, THREE.UnsignedByteType);
    this.texture.minFilter = THREE.LinearFilter;
    this.texture.magFilter = THREE.LinearFilter;
    this.texture.needsUpdate = true;
    U.uExplore.value = this.texture;
    this.farTexture = new THREE.DataTexture(this.farData, FAR_TEX, FAR_TEX, THREE.RGFormat, THREE.UnsignedByteType);
    this.farTexture.minFilter = THREE.LinearFilter;
    this.farTexture.magFilter = THREE.LinearFilter;
    this.farTexture.needsUpdate = true;
    U.uExploreFar.value = this.farTexture;
    try {
      if (typeof indexedDB !== 'undefined')
        this.db = openDB('map-game-explore', 1, { upgrade: (db) => { db.createObjectStore('blocks'); db.createObjectStore('meta'); } });
    } catch { this.db = null; }
    void this.loadMeta();
  }

  setOrigin(o: { lat: number; lon: number }) {
    // x east → mercator x; z south → mercator −y. d(merc)/d(ground metre) = 1/cos(lat).
    this.cosLat = Math.cos((o.lat * Math.PI) / 180);
    this.m0x = mercX(o.lon);
    this.m0y = mercY(o.lat);
    this.sx = 1 / this.cosLat;
    this.sy = -1 / this.cosLat;
    this.winX0 = Infinity;
    this.farX0 = Infinity;
  }
  private toCell(x: number, z: number): [number, number] {
    return [Math.floor((this.m0x + x * this.sx) / CELL), Math.floor((this.m0y + z * this.sy) / CELL)];
  }

  /** 0..255 paint amount at a local point (0 where the block isn't loaded or never visited): walked,
   *  or painted by a photo — its far cells too. */
  valueAt(x: number, z: number) {
    const [cx, cy] = this.toCell(x, z);
    return Math.max(this.cell(cx, cy), this.farPhoto(cx, cy));
  }
  private cell(cx: number, cy: number) {
    const bx = Math.floor(cx / BLOCK), by = Math.floor(cy / BLOCK);
    const b = this.blocks.get(blockKey(bx, by));
    return b ? b[(cy - by * BLOCK) * BLOCK + (cx - bx * BLOCK)] : 0;
  }
  // what photos painted in the far cell over fine cell (cx, cy)
  private farPhoto(cx: number, cy: number) {
    const fx = Math.floor(cx / FAR), fy = Math.floor(cy / FAR);
    const bx = Math.floor(fx / BLOCK), by = Math.floor(fy / BLOCK);
    const b = this.blocks.get(farKey(bx, by));
    return b ? b[(fy - by * BLOCK) * BLOCK + (fx - bx * BLOCK)] : 0;
  }
  /** What the post pass reads at a local point: the fine window's texel, or (`far`) the far
   *  window's — the more of photo paint and walked share; -1 outside the window. (Tests, console.) */
  texelAt(x: number, z: number, far = false) {
    const w = far ? FAR_WIN : WIN, n = far ? FAR_TEX : TEX;
    const i = Math.floor(((x - (far ? this.farX0 : this.winX0)) / w) * n), j = Math.floor(((z - (far ? this.farZ0 : this.winZ0)) / w) * n);
    if (!(i >= 0 && j >= 0 && i < n && j < n)) return -1;
    return far ? Math.max(this.farData[(j * n + i) * 2], this.farData[(j * n + i) * 2 + 1]) : this.data[j * n + i];
  }

  /** Had this spot been painted on an earlier walk (or by an earlier photo)? (reads the saved blocks,
   *  not today's paint) */
  async paintedBefore(x: number, z: number): Promise<boolean> {
    if (!this.db) return false;
    const [cx, cy] = this.toCell(x, z);
    const bx = Math.floor(cx / BLOCK), by = Math.floor(cy / BLOCK);
    const fx = Math.floor(cx / FAR), fy = Math.floor(cy / FAR), fbx = Math.floor(fx / BLOCK), fby = Math.floor(fy / BLOCK);
    const unsaved = (k: string) => this.dirtyBlocks.has(k) && !this.requested.has(k); // made today, never on disk
    try {
      const db = await this.db, k = blockKey(bx, by), fk = farKey(fbx, fby);
      const b = unsaved(k) ? undefined : ((await db.get('blocks', k)) as Uint8Array | undefined);
      if (b && b[(cy - by * BLOCK) * BLOCK + (cx - bx * BLOCK)] >= FULL) return true;
      const f = unsaved(fk) ? undefined : ((await db.get('blocks', fk)) as Uint8Array | undefined);
      return !!f && f[(fy - fby * BLOCK) * BLOCK + (fx - fbx * BLOCK)] >= FULL;
    } catch { return false; }
  }

  stats(): ExploreStats {
    const a = (CELL * this.cosLat) ** 2;
    return { painted: this.painted, session: this.session, km2: (this.painted * a) / 1e6 };
  }

  /** Load every stored block covering a local rectangle (the map screen asks before drawing). */
  async ensureRect(x0: number, z0: number, x1: number, z1: number, cap = 4000) {
    const keys: string[] = [];
    this.keysIn(x0, z0, x1, z1, true, cap, keys); // (the far blocks first: few, and they cover the most)
    this.keysIn(x0, z0, x1, z1, false, cap, keys);
    await this.fetchBlocks(keys);
  }
  // the not-yet-requested block keys (fine, or far) covering a local rectangle
  private keysIn(x0: number, z0: number, x1: number, z1: number, far: boolean, cap: number, keys: string[]) {
    const [ax, ay] = this.toCell(x0, z1), [bx, by] = this.toCell(x1, z0);
    const s = far ? BLOCK * FAR : BLOCK, key = far ? farKey : blockKey;
    for (let j = Math.floor(ay / s); j <= Math.floor(by / s); j++)
      for (let i = Math.floor(ax / s); i <= Math.floor(bx / s); i++) {
        const k = key(i, j);
        if (!this.blocks.has(k) && !this.requested.has(k)) keys.push(k);
        if (keys.length >= cap) return;
      }
  }
  private async fetchBlocks(keys: string[]) {
    if (!keys.length) return;
    for (const k of keys) this.requested.add(k);
    if (!this.db) return;
    try {
      const tx = (await this.db).transaction('blocks');
      const got = await Promise.all(keys.map((k) => tx.store.get(k) as Promise<Uint8Array | undefined>));
      keys.forEach((k, i) => {
        const v = got[i];
        if (!v) return;
        const cur = this.blocks.get(k);
        if (cur) for (let n = 0; n < cur.length; n++) cur[n] = Math.max(cur[n], v[n]);
        else this.blocks.set(k, v);
        // refill its texels; a fine block's share in its far cells too
        if (k.startsWith('f:')) this.farDirty.add(k);
        else { this.fineDirty.add(k); this.sumDirty.add(k); }
      });
    } catch { /* private mode: live-only */ }
  }
  // a block's local rectangle, from its key
  private keyRect(k: string): [number, number, number, number] {
    const far = k.startsWith('f:'), c = k.indexOf(',');
    const s = BLOCK * CELL * (far ? FAR : 1), bx = +k.slice(far ? 2 : 0, c), by = +k.slice(c + 1);
    const xa = (bx * s - this.m0x) / this.sx, xb = ((bx + 1) * s - this.m0x) / this.sx;
    const za = (by * s - this.m0y) / this.sy, zb = ((by + 1) * s - this.m0y) / this.sy;
    return [Math.min(xa, xb), Math.min(za, zb), Math.max(xa, xb), Math.max(za, zb)];
  }
  // a block not read from disk yet: fetch it, and paint a fresh one meanwhile (merged by max)
  private blockFor(k: string, size: number) {
    let b = this.blocks.get(k);
    if (!b) {
      if (!this.requested.has(k)) void this.fetchBlocks([k]);
      this.blocks.set(k, (b = new Uint8Array(size)));
    }
    return b;
  }
  private async loadMeta() {
    if (!this.db) return;
    try { this.painted = ((await (await this.db).get('meta', 'stats')) as number | undefined) ?? 0; } catch { /* ignore */ }
  }
  private async save() {
    if (!this.db || !this.dirtyBlocks.size) return;
    const keys = [...this.dirtyBlocks];
    this.dirtyBlocks.clear();
    try {
      const tx = (await this.db).transaction(['blocks', 'meta'], 'readwrite');
      for (const k of keys) void tx.objectStore('blocks').put(this.blocks.get(k)!, k);
      void tx.objectStore('meta').put(this.painted, 'stats');
      await tx.done;
    } catch { /* ignore */ }
  }
  async reset() {
    this.blocks.clear();
    this.requested.clear();
    this.dirtyBlocks.clear();
    this.fineDirty.clear();
    this.farDirty.clear();
    this.sumDirty.clear();
    this.jobs.length = 0;
    for (const q of this.seenQueue.splice(0)) q.res({ cells: 0, km2: 0, reach: 0 });
    this.painted = this.session = 0;
    this.winDirty = this.farWinDirty = true;
    if (!this.db) return;
    try {
      const db = await this.db;
      await db.clear('blocks');
      await db.put('meta', 0, 'stats');
    } catch { /* ignore */ }
  }

  /** Paint around the walker and keep the texture windows current. `h` = eye height above ground;
   *  `reach` = the radius painted on foot. */
  update(x: number, z: number, h: number, dt: number, reach = 45) {
    // window: re-centre (snapped to 512 m) when the walker nears its edge
    if (Math.abs(x - (this.winX0 + WIN / 2)) > WIN / 4 || Math.abs(z - (this.winZ0 + WIN / 2)) > WIN / 4) {
      this.winX0 = Math.round(x / 512) * 512 - WIN / 2;
      this.winZ0 = Math.round(z / 512) * 512 - WIN / 2;
      U.uExploreBox.value.set(this.winX0, this.winZ0, 1 / WIN, 1 / WIN);
      void this.ensureRect(this.winX0, this.winZ0, this.winX0 + WIN, this.winZ0 + WIN);
      this.winDirty = true;
    }
    if (this.winDirty) { this.winDirty = false; this.fineDirty.clear(); this.fill(this.winX0, this.winZ0, this.winX0 + WIN, this.winZ0 + WIN); }
    if ((this.tick -= dt) <= 0 && this.enabled) {
      const step = 0.1 - this.tick; // accumulated time since the last paint tick
      this.tick = 0.1;
      const r = revealRadius(h, reach);
      this.paint(x, z, r, Math.min(0.5, step));
      this.fill(x - r - 16, z - r - 16, x + r + 16, z + r + 16);
    }
    // a photo being laid in (paintSeenSliced), ~4 ms a frame…
    if (this.seenQueue.length)
      for (const t0 = performance.now(); this.seenQueue.length && performance.now() - t0 < 4;) {
        const q = this.seenQueue[0], r = q.it.next();
        if (r.done) { this.seenQueue.shift(); q.res(r.value); }
      }
    // …and blooming (paintSeen)
    const blooming = this.jobs.length > 0;
    if (blooming) this.bloomJobs(Math.min(0.1, dt));
    if (this.fineDirty.size) {
      for (const k of this.fineDirty) { const r = this.keyRect(k); this.fill(r[0], r[1], r[2], r[3]); }
      this.fineDirty.clear();
    }
    // far cells: the fine paint's share (twice a second; every beat while a photo blooms)…
    if (this.sumDirty.size && ((this.sumT -= dt) <= 0 || this.jobs.length)) { this.sumT = 0.5; this.flushShares(); }
    // …and the far window, while it's shown
    if (this.far) this.updateFar(x, z, dt);
    this.farShown = this.far;
    // (uploads: as they come, but at 10 Hz while a photo blooms — it touches texels every frame)
    const up = !blooming || (this.upT -= dt) <= 0;
    if (up && blooming) this.upT = 0.1;
    if (this.texDirty && up) { this.texDirty = false; this.texture.needsUpdate = true; }
    if (this.farTexDirty && up) { this.farTexDirty = false; this.farTexture.needsUpdate = true; }
    if ((this.saveT -= dt) <= 0) { this.saveT = 4; void this.save(); }
  }

  private paint(x: number, z: number, r: number, dt: number) {
    const [cx, cy] = this.toCell(x, z);
    const rc = Math.ceil((r / this.cosLat) / CELL) + 1; // radius in cells (mercator cells are smaller)
    const cm = CELL * this.cosLat; // ground metres per cell
    let bloomed = 0;
    let lastKey = '', blk: Uint8Array | undefined;
    for (let j = cy - rc; j <= cy + rc; j++)
      for (let i = cx - rc; i <= cx + rc; i++) {
        const d = Math.hypot(i - cx, j - cy) * cm;
        const rate = bloomRate(d, r);
        if (rate <= 0) continue;
        const bx = Math.floor(i / BLOCK), by = Math.floor(j / BLOCK), k = blockKey(bx, by);
        if (k !== lastKey) {
          lastKey = k;
          blk = this.blockFor(k, AREA);
        }
        const n = (j - by * BLOCK) * BLOCK + (i - bx * BLOCK);
        const v = blk![n];
        if (v >= 255) continue;
        const nv = Math.min(255, v + rate * dt);
        blk![n] = nv;
        if (v < FULL && nv >= FULL) bloomed++;
        this.dirtyBlocks.add(k);
        this.sumDirty.add(k);
      }
    if (bloomed) {
      this.painted += bloomed;
      this.session += bloomed;
      this.onBloom?.(bloomed);
    }
  }

  /** Paint what a frame sees (render/seen.ts) from the eye (world metres): every visible surface
   *  within `reach` m (level; SEEN_REACH) blooms into colour over ~2 s, the near first. Each sample
   *  paints a disc as wide as its footprint (at least 1.5 cells, so the texture reads it whole), and
   *  neighbouring samples on one surface (`joined`) are filled between — the ground running away at
   *  a grazing angle is seen whole though its samples lie far apart; where it runs on into the sky,
   *  on to the frame's sky cut (while `ground`, the terrain's height, keeps it in sight). Within
   *  SEEN_SPLIT the 8 m cells take the paint, past it the 64 m far cells. Where the samples are much
   *  finer than a disc (the near field) every s-th column is read, the discs still overlapping.
   *  Deterministic: the same frame paints the same cells. */
  paintSeen(g: SeenGrid, eye: SeenEye, opts: SeenOpts = {}): SeenPaint {
    const it = this.seen(g, eye, opts);
    let r = it.next();
    while (!r.done) r = it.next();
    return r.value;
  }
  /** paintSeen, laid in a slice at a time (update() gives it ~4 ms a frame) so a photo never
   *  hitches the walk; resolves once it's all in and blooming. */
  paintSeenSliced(g: SeenGrid, eye: SeenEye, opts: SeenOpts = {}): Promise<SeenPaint> {
    return new Promise((res) => this.seenQueue.push({ it: this.seen(g, eye, opts), res }));
  }
  private *seen(g: SeenGrid, eye: SeenEye, opts: SeenOpts): Generator<void, SeenPaint> {
    const { w, h, pos, depth } = g, N = w * h, reach = opts.reach ?? SEEN_REACH;
    const fine = new Stamps(CELL), far = new Stamps(CELL * FAR);
    const cm = CELL * this.cosLat, fineMin = 1.5 * cm, farMin = 1.5 * cm * FAR;
    const R = 0.75 * g.foot; // a disc's radius per metre of depth: neighbours' discs overlap
    let out = 0;
    const stamp = (x: number, z: number, r: number, d: number) => {
      const f = d > SEEN_SPLIT;
      const code = Math.round(100 * SEEN_DELAY * Math.sqrt(Math.min(1, d / reach)));
      (f ? far : fine).disc(this.m0x + x * this.sx, this.m0y + z * this.sy, Math.max(r, f ? farMin : fineMin) * this.sx, code);
      if (d > out) out = d;
    };
    // Where the samples are much finer than a disc, only every s-th column needs to paint: the
    // bands of discs from the columns that do still meet between them (s·footprint ≤ 1.5 r).
    const strideAt = (r0: number, r: number) => {
      let s = 1;
      while (s < 8 && (2 * s * r0) / 0.75 <= 1.5 * r) s *= 2;
      return s;
    };
    // discs from (ax, az) to (bx, bz) inside the reach, radius ra → rb (footprint-wide, each at least
    // its floor); along the view (column `col`) each disc decides its own stride, as the footprint
    // grows toward the far end
    const line = (ax: number, az: number, ra: number, bx: number, bz: number, rb: number, col: number) => {
      const span = clipSegment(ax, az, bx, bz, eye.x, eye.z, reach);
      const L = Math.sqrt((bx - ax) ** 2 + (bz - az) ** 2);
      if (!span || L < 1e-3) return;
      for (let t = span[0]; t <= span[1];) {
        const x = ax + (bx - ax) * t, z = az + (bz - az) * t, d = Math.sqrt((x - eye.x) ** 2 + (z - eye.z) ** 2);
        const r0 = ra + (rb - ra) * t, r = Math.max(r0, d > SEEN_SPLIT ? farMin : fineMin);
        if (col < 0 || col % strideAt(r0, r) === 0) stamp(x, z, r, d);
        t += r / L;
      }
    };
    // each sample's level distance from the eye, its disc's radius and column stride
    const dist = new Float32Array(N), rad = new Float32Array(N), stride = new Uint8Array(N);
    for (let k = 0; k < N; k++) {
      if (!(depth[k] > 0)) continue;
      dist[k] = Math.sqrt((pos[k * 3] - eye.x) ** 2 + (pos[k * 3 + 2] - eye.z) ** 2);
      rad[k] = Math.max(depth[k] * R, dist[k] > SEEN_SPLIT ? farMin : fineMin);
      stride[k] = strideAt(depth[k] * R, rad[k]);
    }
    const inv = (k: number) => (depth[k] > 0 ? 1 / depth[k] : 0);
    // how far straight on from the eye, past sample a, the ground stays in sight (to D): the
    // farthest point where no nearer ground rises above it
    const sight = (a: number, ux: number, uz: number, D: number) => {
      const H = opts.ground, ey = eye.y;
      if (!H || ey === undefined) return D;
      let top = (pos[a * 3 + 1] - ey) / dist[a]; // the steepest rise seen so far (tan of its elevation)
      for (let d = dist[a] * 1.05; d < D; d *= 1.05) {
        const e = (H(eye.x + ux * d, eye.z + uz * d) - ey) / d;
        if (e < top - 0.5 * g.foot) return d / 1.05; // under what's nearer: hidden from here on
        if (e > top) top = e;
      }
      return D;
    };
    const join = (a: number, b: number, col: number) => {
      const ax = pos[a * 3], az = pos[a * 3 + 2], bx = pos[b * 3], bz = pos[b * 3 + 2];
      if ((bx - ax) ** 2 + (bz - az) ** 2 > Math.max(rad[a], rad[b]) ** 2) line(ax, az, depth[a] * R, bx, bz, depth[b] * R, col); // (else their discs cover it)
    };
    const wCut = 1 / g.cut;
    for (let j = 0; j < h; j++)
      for (let i = 0; i < w; i++) {
        if ((i & 15) === 15) yield; // (a slice: 16 columns)
        const a = j * w + i;
        if (!(depth[a] > 0)) continue;
        const s = stride[a];
        if (i % s === 0) {
          if (dist[a] <= reach) stamp(pos[a * 3], pos[a * 3 + 2], rad[a], dist[a]);
          if (i + s < w && joined(inv(a), inv(a + s), i >= s ? inv(a - s) : 0, i + 2 * s < w ? inv(a + 2 * s) : 0)) join(a, a + s, -1);
        }
        if (j + 1 < h && joined(inv(a), inv(a + w), j > 0 ? inv(a - w) : 0, j + 2 < h ? inv(a + 2 * w) : 0)) join(a, a + w, i);
        // ground running on into the sky (the last row before it) as a plane does, its steps in
        // 1/depth even and the next one landing past the sky cut (or the horizon): the readback
        // lost it there, but the frame shows it on to the cut — the sea to the horizon. (A crest
        // ends where it's drawn.) With the ground's height known, it stops where the ground drops
        // out of sight: a plateau's edge.
        if (j > 1 && j + 1 < h && !(depth[a + w] > 0) && depth[a - w] > 0 && depth[a - 2 * w] > 0) {
          const g2 = inv(a - w) - inv(a), g1 = inv(a - 2 * w) - inv(a - w);
          if (g2 > 0 && Math.abs(g2 - g1) <= 0.35 * g1 && inv(a) - g2 <= wCut) {
            const ux = (pos[a * 3] - eye.x) / dist[a], uz = (pos[a * 3 + 2] - eye.z) / dist[a];
            const D = sight(a, ux, uz, Math.min(reach, dist[a] * g.cut * inv(a)));
            if (D > dist[a] + rad[a]) line(pos[a * 3], pos[a * 3 + 2], depth[a] * R, eye.x + ux * D, eye.z + uz * D, (depth[a] * R * D) / dist[a], i);
          }
        }
      }
    // queue the bloom; count what's new
    const job: SeenJob = { t: 0, stamps: [], at: 0 };
    let nFine = 0, nFar = 0;
    for (const [lvl, m] of [[0, fine.m], [1, far.m]] as const)
      for (const [id, st] of m) {
        const bx = Math.floor(id / NSPAN) - NOFF, by = (id % NSPAN) - NOFF;
        const k = lvl ? farKey(bx, by) : blockKey(bx, by), blk = this.blocks.get(k);
        let lo = 255, hi = 0, fresh = 0;
        for (let n = 0; n < AREA; n++) {
          const c = st[n];
          if (c === 255) continue;
          if (c < lo) lo = c;
          if (c > hi) hi = c;
          if (!blk || blk[n] < FULL) fresh++;
        }
        job.stamps.push({ k, far: lvl === 1, st, lo, hi });
        if (lvl) nFar += fresh;
        else nFine += fresh;
      }
    if (job.stamps.length) this.jobs.push(job);
    return { cells: nFine + nFar, km2: (nFine * cm * cm + nFar * (cm * FAR) ** 2) / 1e6, reach: out };
  }

  // Each frame a sixth of every blooming photo's blocks (so each is seen to ~10 times a second),
  // every stamped cell raised to where its own bloom has got to.
  private bloomJobs(dt: number) {
    const D = SEEN_DUR * 100;
    for (let q = this.jobs.length - 1; q >= 0; q--) {
      const job = this.jobs[q], list = job.stamps;
      const t = (job.t += dt) * 100;
      for (let n = Math.ceil(list.length / 6); n > 0 && list.length; n--) {
        if (job.at >= list.length) job.at = 0;
        if (this.bloomStamp(list[job.at], t, D)) job.at++;
        else list[job.at] = list[list.length - 1], list.pop(); // all there: done with it
      }
      if (!list.length) this.jobs.splice(q, 1);
    }
  }
  // one block's stamped cells; false once they're all there
  private bloomStamp(s: Stamp, t: number, D: number) {
    if (t <= s.lo) return true; // not started
    const far = s.far, blk = this.blockFor(s.k, far ? 2 * AREA : AREA);
    let changed = false;
    for (let n = 0; n < AREA; n++) {
      const c = s.st[n];
      if (c === 255 || t <= c) continue;
      const a = (t - c) / D, v = a >= 1 ? 255 : Math.floor(a * 255);
      if (v > blk[n]) { blk[n] = v; changed = true; }
    }
    if (changed) {
      this.dirtyBlocks.add(s.k);
      if (far) this.farDirty.add(s.k);
      else { this.fineDirty.add(s.k); this.sumDirty.add(s.k); }
    }
    return t < s.hi + D;
  }

  // Each far cell keeps the painted share of the 8×8 fine cells under it (a rounded mean, only ever
  // raised: paint never fades), so the far window shows your walks as well as your photos.
  private flushShares() {
    const per = BLOCK / FAR; // far cells per fine block side (4); a far block spans FAR fine blocks
    for (const k of this.sumDirty) {
      const blk = this.blocks.get(k);
      if (!blk) continue;
      const c = k.indexOf(','), bx = +k.slice(0, c), by = +k.slice(c + 1);
      const fbx = Math.floor(bx / FAR), fby = Math.floor(by / FAR), fk = farKey(fbx, fby);
      const fb = this.blockFor(fk, 2 * AREA);
      const ox = (bx - fbx * FAR) * per, oy = (by - fby * FAR) * per;
      let changed = false;
      for (let q = 0; q < per; q++)
        for (let p = 0; p < per; p++) {
          let s = 0;
          for (let y = 0; y < FAR; y++) {
            const row = (q * FAR + y) * BLOCK + p * FAR;
            for (let x = 0; x < FAR; x++) s += blk[row + x];
          }
          const n = AREA + (oy + q) * BLOCK + ox + p, v = Math.round(s / (FAR * FAR));
          if (v > fb[n]) { fb[n] = v; changed = true; }
        }
      if (changed) { this.dirtyBlocks.add(fk); this.farDirty.add(fk); }
    }
    this.sumDirty.clear();
  }

  // The far window: re-centred (snapped) when you're FAR_STEP off its centre, so it always reaches
  // SEEN_REACH round you; walks refill it about once a second, a photo's bloom every beat.
  private updateFar(x: number, z: number, dt: number) {
    if (!this.farShown) this.farWinDirty = true; // just switched on: whatever it held is stale
    if (Math.abs(x - (this.farX0 + FAR_WIN / 2)) > FAR_STEP || Math.abs(z - (this.farZ0 + FAR_WIN / 2)) > FAR_STEP) {
      this.farX0 = Math.round(x / FAR_STEP) * FAR_STEP - FAR_WIN / 2;
      this.farZ0 = Math.round(z / FAR_STEP) * FAR_STEP - FAR_WIN / 2;
      U.uExploreFarBox.value.set(this.farX0, this.farZ0, 1 / FAR_WIN, 1 / FAR_WIN);
      const keys: string[] = [];
      this.keysIn(this.farX0, this.farZ0, this.farX0 + FAR_WIN, this.farZ0 + FAR_WIN, true, 4000, keys);
      void this.fetchBlocks(keys);
      this.farWinDirty = true;
    }
    if (this.farWinDirty) {
      this.farWinDirty = false;
      this.farDirty.clear();
      this.fillFar(this.farX0, this.farZ0, this.farX0 + FAR_WIN, this.farZ0 + FAR_WIN);
    } else if (this.farDirty.size && ((this.farT -= dt) <= 0 || this.jobs.length)) {
      this.farT = 1;
      for (const k of this.farDirty) { const r = this.keyRect(k); this.fillFar(r[0], r[1], r[2], r[3]); }
      this.farDirty.clear();
    }
  }

  // Resample the global cells into the texel window over a local rectangle.
  private fill(x0: number, z0: number, x1: number, z1: number) {
    const i0 = Math.max(0, Math.floor(((x0 - this.winX0) / WIN) * TEX)), i1 = Math.min(TEX - 1, Math.ceil(((x1 - this.winX0) / WIN) * TEX));
    const j0 = Math.max(0, Math.floor(((z0 - this.winZ0) / WIN) * TEX)), j1 = Math.min(TEX - 1, Math.ceil(((z1 - this.winZ0) / WIN) * TEX));
    if (i1 < i0 || j1 < j0) return;
    const t = WIN / TEX, col = this.colCx;
    for (let i = i0; i <= i1; i++) col[i] = Math.floor((this.m0x + (this.winX0 + (i + 0.5) * t) * this.sx) / CELL);
    for (let j = j0; j <= j1; j++) {
      const z = this.winZ0 + (j + 0.5) * t;
      const cy = Math.floor((this.m0y + z * this.sy) / CELL);
      const by = Math.floor(cy / BLOCK), ry = (cy - by * BLOCK) * BLOCK;
      let lb = NaN, blk: Uint8Array | undefined;
      for (let i = i0; i <= i1; i++) {
        const cx = col[i], bx = Math.floor(cx / BLOCK);
        if (bx !== lb) { lb = bx; blk = this.blocks.get(blockKey(bx, by)); }
        this.data[j * TEX + i] = blk ? blk[ry + cx - bx * BLOCK] : 0;
      }
    }
    this.texDirty = true;
  }
  // …and the far window: each texel the far cell under it (R what photos painted, G the walked share)
  private fillFar(x0: number, z0: number, x1: number, z1: number) {
    const T = FAR_WIN / FAR_TEX, fc = CELL * FAR;
    const i0 = Math.max(0, Math.floor((x0 - this.farX0) / T)), i1 = Math.min(FAR_TEX - 1, Math.ceil((x1 - this.farX0) / T));
    const j0 = Math.max(0, Math.floor((z0 - this.farZ0) / T)), j1 = Math.min(FAR_TEX - 1, Math.ceil((z1 - this.farZ0) / T));
    if (i1 < i0 || j1 < j0) return;
    const col = this.colFx, d = this.farData;
    for (let i = i0; i <= i1; i++) col[i] = Math.floor((this.m0x + (this.farX0 + (i + 0.5) * T) * this.sx) / fc);
    for (let j = j0; j <= j1; j++) {
      const fy = Math.floor((this.m0y + (this.farZ0 + (j + 0.5) * T) * this.sy) / fc);
      const by = Math.floor(fy / BLOCK), ry = (fy - by * BLOCK) * BLOCK;
      let lb = NaN, fb: Uint8Array | undefined;
      for (let i = i0; i <= i1; i++) {
        const fx = col[i], bx = Math.floor(fx / BLOCK), o = (j * FAR_TEX + i) * 2;
        if (bx !== lb) { lb = bx; fb = this.blocks.get(farKey(bx, by)); }
        if (fb) { const n = ry + fx - bx * BLOCK; d[o] = fb[n]; d[o + 1] = fb[n + AREA]; }
        else d[o] = d[o + 1] = 0;
      }
    }
    this.farTexDirty = true;
  }
}

/** The part [t0, t1] of the segment a→b (t in 0..1) within `r` of (cx, cz), or null. */
export function clipSegment(ax: number, az: number, bx: number, bz: number, cx: number, cz: number, r: number): [number, number] | null {
  const dx = bx - ax, dz = bz - az, fx = ax - cx, fz = az - cz;
  const A = dx * dx + dz * dz, B = 2 * (fx * dx + fz * dz), C = fx * fx + fz * fz - r * r;
  if (A < 1e-9) return C <= 0 ? [0, 1] : null;
  const disc = B * B - 4 * A * C;
  if (disc < 0) return null;
  const s = Math.sqrt(disc), t0 = Math.max(0, (-B - s) / (2 * A)), t1 = Math.min(1, (-B + s) / (2 * A));
  return t0 <= t1 ? [t0, t1] : null;
}
