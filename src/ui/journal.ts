// The journal: a watercolor map that paints itself in where you've walked (fog of war), stamps for
// the places you've found, and the key legend. Persists to IndexedDB so tomorrow's walk continues today's.
import { openDB, type IDBPDatabase } from 'idb';
import type { World, Poi } from '../world/data';

const CELL = 8;
const REVEAL = 42;
const FIND = 30;

interface Save { explored: Uint8Array; found: string[] }

export class Journal {
  private w: number;
  private h: number;
  private explored: Uint8Array;
  private land: Uint8Array;
  private landCount = 0;
  private found = new Set<string>();
  private pois: Poi[];
  private db: Promise<IDBPDatabase> | null = null;
  private dirty = false;
  private saveTimer = 0;
  private mapImg: HTMLCanvasElement;

  constructor(private world: World, sliceCanvas: HTMLCanvasElement, private toast: (msg: string) => void) {
    const S = world.json.slice;
    this.w = Math.ceil((S.x1 - S.x0) / CELL);
    this.h = Math.ceil((S.z1 - S.z0) / CELL);
    this.explored = new Uint8Array(this.w * this.h);
    this.land = new Uint8Array(this.w * this.h);
    for (let j = 0; j < this.h; j++)
      for (let i = 0; i < this.w; i++) {
        const l = world.terrain.slice.sdfAt(S.x0 + (i + 0.5) * CELL, S.z0 + (j + 0.5) * CELL) > 0 ? 1 : 0;
        this.land[j * this.w + i] = l;
        this.landCount += l;
      }
    // Named places worth a stamp: POIs in the slice, one per name.
    const seen = new Set<string>();
    this.pois = world.json.pois.filter((p) => p.slice && !['monitoring_station'].includes(p.kind) && !seen.has(p.name) && seen.add(p.name));
    // Cache a map-sized copy of the ground painting.
    const mw = 1400, mh = Math.round(mw * ((S.z1 - S.z0) / (S.x1 - S.x0)));
    this.mapImg = document.createElement('canvas');
    this.mapImg.width = mw;
    this.mapImg.height = mh;
    this.mapImg.getContext('2d')!.drawImage(sliceCanvas, 0, 0, mw, mh);
    try {
      this.db = openDB(`${world.json.meta?.id ?? 'world'}-walk`, 1, { upgrade: (db) => db.createObjectStore('save') });
    } catch { this.db = null; }
  }

  async load() {
    if (!this.db) return;
    try {
      const s = (await (await this.db).get('save', 'journal')) as Save | undefined;
      if (s?.explored?.length === this.explored.length) this.explored.set(s.explored);
      s?.found?.forEach((f) => this.found.add(f));
    } catch { /* private mode etc. */ }
  }
  private async save() {
    if (!this.db) return;
    try { await (await this.db).put('save', { explored: this.explored, found: [...this.found] } satisfies Save, 'journal'); } catch { /* ignore */ }
  }
  async reset() {
    this.explored.fill(0);
    this.found.clear();
    await this.save();
  }

  update(x: number, z: number, dt: number) {
    const S = this.world.json.slice;
    const ci = Math.floor((x - S.x0) / CELL), cj = Math.floor((z - S.z0) / CELL);
    const r = Math.ceil(REVEAL / CELL);
    for (let j = cj - r; j <= cj + r; j++)
      for (let i = ci - r; i <= ci + r; i++) {
        if (i < 0 || j < 0 || i >= this.w || j >= this.h) continue;
        if ((i - ci) ** 2 + (j - cj) ** 2 > r * r) continue;
        const k = j * this.w + i;
        if (!this.explored[k]) (this.explored[k] = 1), (this.dirty = true);
      }
    for (const p of this.pois) {
      if (this.found.has(p.name)) continue;
      if (Math.hypot(p.x - x, p.z - z) < FIND) {
        this.found.add(p.name);
        this.dirty = true;
        this.toast(`✦ ${p.name}`);
      }
    }
    if ((this.saveTimer -= dt) <= 0 && this.dirty) {
      this.saveTimer = 4;
      this.dirty = false;
      void this.save();
    }
  }

  percent() {
    let n = 0;
    for (let k = 0; k < this.explored.length; k++) n += this.explored[k] & this.land[k];
    return (100 * n) / Math.max(1, this.landCount);
  }

  /** Named places you've found (the atlas map stamps them). */
  stamps() { return this.pois.filter((p) => this.found.has(p.name)); }

  /** The atlas's Journal page: how much of the baked town you've walked + the places found. */
  render(extra = '') {
    document.getElementById('journal-stats')!.innerHTML = `${extra}${this.percent().toFixed(1)}% of the baked town walked · ${this.found.size} of ${this.pois.length} places found`;
    const list = document.getElementById('journal-stamps')!;
    if (list.childElementCount !== this.pois.length || list.dataset.found !== String(this.found.size)) {
      list.dataset.found = String(this.found.size);
      list.innerHTML = this.pois
        .slice()
        .sort((p, q) => Number(this.found.has(q.name)) - Number(this.found.has(p.name)))
        .map((p) => (this.found.has(p.name) ? `<li class="found">${esc(p.name)}</li>` : `<li class="unknown">? ? ?</li>`))
        .join('');
    }
  }
}
// (a place's name is the map's own text)
const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);
