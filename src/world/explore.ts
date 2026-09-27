// Paint-as-you-explore: every place starts as a pencil underdrawing and blooms into watercolor once
// you've been there. The record is a sparse bitmap on a GLOBAL grid (Web-Mercator metres, 8 m cells,
// 32×32-cell blocks) so it survives re-anchoring, teleports and every region — Sea Bright and
// Santa Fe share one sketchbook. Blocks persist to IndexedDB; a walker-centred R8 texture window
// (4 km, 8 m texels) feeds the post pass (U.uExplore / U.uExploreBox), which draws unpainted
// ground as graphite on paper and blooms colour in with a wet, noisy edge.
import * as THREE from 'three';
import { openDB, type IDBPDatabase } from 'idb';
import { U } from '../render/shared';

const R_EARTH = 6378137;
const K = (Math.PI / 180) * R_EARTH;
export const CELL = 8; // mercator metres per cell (≈ 6 m on the ground at 40°N)
export const BLOCK = 32; // cells per block side
const WIN = 4096; // local metres covered by the texture window
const TEX = 512; // texels per side (8 m each)
const FULL = 200; // a cell counts as "painted" at this value

export const mercX = (lon: number) => lon * K;
export const mercY = (lat: number) => R_EARTH * Math.log(Math.tan(Math.PI / 4 + (lat * Math.PI) / 360));
export const blockKey = (bx: number, by: number) => `${bx},${by}`;

/** Reveal radius (m) for the eye's height above the ground: walking ~45 m, a plane paints wide. */
export function revealRadius(heightAboveGround: number) {
  return Math.min(450, 45 + Math.max(0, heightAboveGround - 2) * 0.7);
}
/** Bloom rate (value/s) for a cell `d` m from the walker inside radius `r`: fast near, slow at the rim. */
export function bloomRate(d: number, r: number) {
  if (d >= r) return 0;
  return 320 * Math.sqrt(1 - d / r) + 40;
}

export interface ExploreStats { painted: number; session: number; km2: number }

export class Explore {
  readonly texture: THREE.DataTexture;
  private data = new Uint8Array(TEX * TEX);
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
  enabled = true;
  /** called with the number of cells that just crossed into "painted" (brush sounds, stats) */
  onBloom: ((n: number) => void) | null = null;

  constructor(origin: { lat: number; lon: number }) {
    this.setOrigin(origin);
    this.texture = new THREE.DataTexture(this.data, TEX, TEX, THREE.RedFormat, THREE.UnsignedByteType);
    this.texture.minFilter = THREE.LinearFilter;
    this.texture.magFilter = THREE.LinearFilter;
    this.texture.needsUpdate = true;
    U.uExplore.value = this.texture;
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
  }
  private toCell(x: number, z: number): [number, number] {
    return [Math.floor((this.m0x + x * this.sx) / CELL), Math.floor((this.m0y + z * this.sy) / CELL)];
  }

  /** 0..255 paint amount at a local point (0 where the block isn't loaded or never visited). */
  valueAt(x: number, z: number) {
    const [cx, cy] = this.toCell(x, z);
    return this.cell(cx, cy);
  }
  private cell(cx: number, cy: number) {
    const bx = Math.floor(cx / BLOCK), by = Math.floor(cy / BLOCK);
    const b = this.blocks.get(blockKey(bx, by));
    return b ? b[(cy - by * BLOCK) * BLOCK + (cx - bx * BLOCK)] : 0;
  }

  /** Had this spot been painted on an earlier walk? (reads the saved block, not today's paint) */
  async paintedBefore(x: number, z: number): Promise<boolean> {
    if (!this.db) return false;
    const [cx, cy] = this.toCell(x, z);
    const bx = Math.floor(cx / BLOCK), by = Math.floor(cy / BLOCK);
    if (this.dirtyBlocks.has(blockKey(bx, by)) && !this.requested.has(blockKey(bx, by))) return false;
    try {
      const b = (await (await this.db).get('blocks', blockKey(bx, by))) as Uint8Array | undefined;
      return !!b && b[(cy - by * BLOCK) * BLOCK + (cx - bx * BLOCK)] >= FULL;
    } catch { return false; }
  }

  stats(): ExploreStats {
    const a = (CELL * this.cosLat) ** 2;
    return { painted: this.painted, session: this.session, km2: (this.painted * a) / 1e6 };
  }

  /** Load every stored block covering a local rectangle (the map screen asks before drawing). */
  async ensureRect(x0: number, z0: number, x1: number, z1: number, cap = 4000) {
    const [ax, ay] = this.toCell(x0, z1), [bx, by] = this.toCell(x1, z0);
    const keys: string[] = [];
    for (let j = Math.floor(ay / BLOCK); j <= Math.floor(by / BLOCK); j++)
      for (let i = Math.floor(ax / BLOCK); i <= Math.floor(bx / BLOCK); i++) {
        const k = blockKey(i, j);
        if (!this.blocks.has(k) && !this.requested.has(k)) keys.push(k);
        if (keys.length >= cap) break;
      }
    await this.fetchBlocks(keys);
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
      });
      this.winDirty = true;
    } catch { /* private mode: live-only */ }
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
    this.painted = this.session = 0;
    this.winDirty = true;
    if (!this.db) return;
    try {
      const db = await this.db;
      await db.clear('blocks');
      await db.put('meta', 0, 'stats');
    } catch { /* ignore */ }
  }

  /** Paint around the walker and keep the texture window current. `h` = eye height above ground. */
  update(x: number, z: number, h: number, dt: number) {
    // window: re-centre (snapped to 512 m) when the walker nears its edge
    if (Math.abs(x - (this.winX0 + WIN / 2)) > WIN / 4 || Math.abs(z - (this.winZ0 + WIN / 2)) > WIN / 4) {
      this.winX0 = Math.round(x / 512) * 512 - WIN / 2;
      this.winZ0 = Math.round(z / 512) * 512 - WIN / 2;
      U.uExploreBox.value.set(this.winX0, this.winZ0, 1 / WIN, 1 / WIN);
      void this.ensureRect(this.winX0, this.winZ0, this.winX0 + WIN, this.winZ0 + WIN);
      this.winDirty = true;
    }
    if (this.winDirty) { this.winDirty = false; this.fill(this.winX0, this.winZ0, this.winX0 + WIN, this.winZ0 + WIN); }
    if ((this.tick -= dt) <= 0 && this.enabled) {
      const step = 0.1 - this.tick; // accumulated time since the last paint tick
      this.tick = 0.1;
      const r = revealRadius(h);
      this.paint(x, z, r, Math.min(0.5, step));
      this.fill(x - r - 16, z - r - 16, x + r + 16, z + r + 16);
    }
    if (this.texDirty) { this.texDirty = false; this.texture.needsUpdate = true; }
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
          blk = this.blocks.get(k);
          if (!blk) {
            // a block we haven't read from disk yet: fetch it, paint a fresh one meanwhile (merged by max)
            if (!this.requested.has(k)) void this.fetchBlocks([k]);
            this.blocks.set(k, (blk = new Uint8Array(BLOCK * BLOCK)));
          }
        }
        const n = (j - by * BLOCK) * BLOCK + (i - bx * BLOCK);
        const v = blk![n];
        if (v >= 255) continue;
        const nv = Math.min(255, v + rate * dt);
        blk![n] = nv;
        if (v < FULL && nv >= FULL) bloomed++;
        this.dirtyBlocks.add(k);
      }
    if (bloomed) {
      this.painted += bloomed;
      this.session += bloomed;
      this.onBloom?.(bloomed);
    }
  }

  // Resample the global cells into the texel window over a local rectangle.
  private fill(x0: number, z0: number, x1: number, z1: number) {
    const i0 = Math.max(0, Math.floor(((x0 - this.winX0) / WIN) * TEX)), i1 = Math.min(TEX - 1, Math.ceil(((x1 - this.winX0) / WIN) * TEX));
    const j0 = Math.max(0, Math.floor(((z0 - this.winZ0) / WIN) * TEX)), j1 = Math.min(TEX - 1, Math.ceil(((z1 - this.winZ0) / WIN) * TEX));
    if (i1 < i0 || j1 < j0) return;
    const t = WIN / TEX;
    for (let j = j0; j <= j1; j++) {
      const z = this.winZ0 + (j + 0.5) * t;
      const cy = Math.floor((this.m0y + z * this.sy) / CELL);
      for (let i = i0; i <= i1; i++) {
        const cx = Math.floor((this.m0x + (this.winX0 + (i + 0.5) * t) * this.sx) / CELL);
        this.data[j * TEX + i] = this.cell(cx, cy);
      }
    }
    this.texDirty = true;
  }
}
