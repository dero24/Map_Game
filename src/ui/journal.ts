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
  open = false;

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

  toggle(force?: boolean) {
    this.open = force ?? !this.open;
    document.getElementById('journal')!.classList.toggle('hidden', !this.open);
  }

  render(px: number, pz: number, yaw: number) {
    if (!this.open) return;
    const S = this.world.json.slice;
    const cv = document.getElementById('journal-map') as HTMLCanvasElement;
    const W = cv.clientWidth, H = cv.clientHeight;
    if (cv.width !== W || cv.height !== H) (cv.width = W), (cv.height = H);
    const ctx = cv.getContext('2d')!;
    // Frame the walked area (plus you), at least ~650 m across, clamped to the town sheet.
    let bx0 = px, bz0 = pz, bx1 = px, bz1 = pz;
    for (let j = 0; j < this.h; j++)
      for (let i = 0; i < this.w; i++)
        if (this.explored[j * this.w + i]) {
          const x = S.x0 + i * CELL, z = S.z0 + j * CELL;
          bx0 = Math.min(bx0, x); bz0 = Math.min(bz0, z); bx1 = Math.max(bx1, x + CELL); bz1 = Math.max(bz1, z + CELL);
        }
    const pad = 110;
    let vw = Math.max(650, bx1 - bx0 + pad * 2), vh = Math.max(650 * (H / W), bz1 - bz0 + pad * 2);
    if (vw / vh < W / H) vw = vh * (W / H); else vh = vw * (H / W);
    vw = Math.min(vw, S.x1 - S.x0); vh = Math.min(vh, S.z1 - S.z0);
    let vx0 = (bx0 + bx1) / 2 - vw / 2, vz0 = (bz0 + bz1) / 2 - vh / 2;
    vx0 = Math.max(S.x0, Math.min(S.x1 - vw, vx0));
    vz0 = Math.max(S.z0, Math.min(S.z1 - vh, vz0));
    const k = Math.min(W / vw, H / vh); // px per metre
    const ox = (W - vw * k) / 2, oy = (H - vh * k) / 2;
    const toMap = (x: number, z: number): [number, number] => [ox + (x - vx0) * k, oy + (z - vz0) * k];
    const mw = this.mapImg.width, mh = this.mapImg.height;
    const sxm = mw / (S.x1 - S.x0), szm = mh / (S.z1 - S.z0);
    const src: [number, number, number, number] = [(vx0 - S.x0) * sxm, (vz0 - S.z0) * szm, vw * sxm, vh * szm];
    const dst: [number, number, number, number] = [ox, oy, vw * k, vh * k];
    const placed: [number, number, number, number][] = [];
    const free = (x: number, y: number, w: number, h: number) => {
      for (const [a, b, c, d] of placed) if (x < a + c && x + w > a && y < b + d && y + h > b) return false;
      placed.push([x, y, w, h]);
      return true;
    };

    ctx.clearRect(0, 0, W, H);
    ctx.fillStyle = '#f1e9d6';
    ctx.fillRect(0, 0, W, H);
    // faint pencil grid, like a surveyor's sheet
    ctx.strokeStyle = 'rgba(90,80,110,0.08)';
    ctx.lineWidth = 1;
    for (let gx = Math.ceil(vx0 / 100) * 100; gx < vx0 + vw; gx += 100) { const [a] = toMap(gx, 0); ctx.beginPath(); ctx.moveTo(a, oy); ctx.lineTo(a, oy + vh * k); ctx.stroke(); }
    for (let gz = Math.ceil(vz0 / 100) * 100; gz < vz0 + vh; gz += 100) { const [, b] = toMap(0, gz); ctx.beginPath(); ctx.moveTo(ox, b); ctx.lineTo(ox + vw * k, b); ctx.stroke(); }

    // reveal mask: explored cells, blurred into soft wet-edged washes
    const m = document.createElement('canvas');
    m.width = this.w;
    m.height = this.h;
    const mctx = m.getContext('2d')!;
    const img = mctx.createImageData(this.w, this.h);
    for (let i = 0; i < this.explored.length; i++) if (this.explored[i]) img.data[i * 4 + 3] = 255;
    mctx.putImageData(img, 0, 0);
    const layer = document.createElement('canvas');
    layer.width = W;
    layer.height = H;
    const lctx = layer.getContext('2d')!;
    lctx.filter = `blur(${Math.max(3, CELL * k * 0.9)}px)`;
    lctx.imageSmoothingEnabled = true;
    const msrc: [number, number, number, number] = [(vx0 - S.x0) / CELL, (vz0 - S.z0) / CELL, vw / CELL, vh / CELL];
    lctx.drawImage(m, ...msrc, ...dst);
    lctx.drawImage(m, msrc[0], msrc[1], msrc[2], msrc[3], dst[0] + 3, dst[1] - 2, dst[2], dst[3]);
    lctx.filter = 'none';
    lctx.globalCompositeOperation = 'source-in';
    lctx.drawImage(this.mapImg, ...src, ...dst);
    ctx.drawImage(layer, 0, 0);

    // street names you've walked
    ctx.font = 'italic 14px Georgia, serif';
    ctx.fillStyle = 'rgba(58,51,70,0.75)';
    ctx.textAlign = 'center';
    const labelled = new Set<string>();
    for (const r of this.world.json.roads) {
      if (!r.n || r.lod || labelled.has(r.n) || r.p.length < 4) continue;
      const mid = Math.floor(r.p.length / 4) * 2;
      const x = r.p[mid] / 10, z = r.p[mid + 1] / 10;
      if (!this.isExplored(x, z)) continue;
      const [a, b] = toMap(x, z);
      const tw = ctx.measureText(r.n).width;
      if (!free(a - tw / 2, b - 16, tw, 18)) continue;
      labelled.add(r.n);
      const [a2, b2] = toMap(r.p[mid + 2] / 10, r.p[mid + 3] / 10);
      let ang = Math.atan2(b2 - b, a2 - a);
      if (ang > Math.PI / 2) ang -= Math.PI;
      if (ang < -Math.PI / 2) ang += Math.PI;
      ctx.save();
      ctx.translate(a, b);
      ctx.rotate(ang);
      ctx.fillText(r.n, 0, -3);
      ctx.restore();
    }
    // stamps
    for (const p of this.pois) {
      if (!this.found.has(p.name)) continue;
      const [a, b] = toMap(p.x, p.z);
      ctx.fillStyle = '#a0503c';
      ctx.font = '16px Georgia, serif';
      ctx.fillText('✦', a, b + 5);
      ctx.font = '12px Georgia, serif';
      const tw = ctx.measureText(p.name).width;
      if (!free(a - tw / 2, b + 8, tw, 14)) continue;
      ctx.fillStyle = 'rgba(120,50,40,0.9)';
      ctx.fillText(p.name, a, b + 18);
    }
    // you are here
    const [a, b] = toMap(px, pz);
    ctx.save();
    ctx.translate(a, b);
    ctx.rotate(-yaw);
    ctx.fillStyle = '#2e2a3a';
    ctx.beginPath();
    ctx.moveTo(0, -11); ctx.lineTo(7, 8); ctx.lineTo(0, 4); ctx.lineTo(-7, 8); ctx.closePath();
    ctx.fill();
    ctx.restore();
    // compass rose
    ctx.fillStyle = 'rgba(58,51,70,0.7)';
    ctx.font = 'italic 15px Georgia, serif';
    ctx.fillText('N', W - 34, 34);
    ctx.beginPath(); ctx.moveTo(W - 34, 40); ctx.lineTo(W - 29, 60); ctx.lineTo(W - 39, 60); ctx.closePath(); ctx.fill();

    document.getElementById('journal-stats')!.innerHTML = `${this.percent().toFixed(1)}% of the town walked<br>${this.found.size} of ${this.pois.length} places found`;
    const list = document.getElementById('journal-stamps')!;
    if (list.childElementCount !== this.pois.length || list.dataset.found !== String(this.found.size)) {
      list.dataset.found = String(this.found.size);
      list.innerHTML = this.pois
        .slice()
        .sort((p, q) => Number(this.found.has(q.name)) - Number(this.found.has(p.name)))
        .map((p) => (this.found.has(p.name) ? `<li class="found">${p.name}</li>` : `<li class="unknown">? ? ?</li>`))
        .join('');
    }
  }

  private isExplored(x: number, z: number) {
    const S = this.world.json.slice;
    const i = Math.floor((x - S.x0) / CELL), j = Math.floor((z - S.z0) / CELL);
    return i >= 0 && j >= 0 && i < this.w && j < this.h && this.explored[j * this.w + i] === 1;
  }
}
