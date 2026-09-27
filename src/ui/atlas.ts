// The atlas (M): one overlay with four pages — the painted Map (with search + teleport), the
// Sketchbook (your paintings), Commissions (offers + the spotting log) and the Journal (keys,
// places found, how much you've painted). G opens it straight to the search box.
import type { GameCtx } from './ctx';
import { MapView, type Pin } from './mapview';
import { listPages, deletePage, type Page } from './book';
import type { Commissions } from './commissions';
import { searchRemote, searchLocal, parseLatLon, type Place } from './geo';
import { modelName } from '../player/vehicles';

type Tab = 'map' | 'book' | 'jobs' | 'journal';

export class Atlas {
  open = false;
  private tab: Tab = 'map';
  readonly map: MapView;
  private pages: Page[] = [];
  private urls = new Map<string, string>();
  private results: Place[] = [];
  private $ = (id: string) => document.getElementById(id)!;
  private renderT = 0;
  private searchSeq = 0;
  /** more pins from the game (your garden) */
  extraPins: () => Pin[] = () => [];

  constructor(private g: GameCtx, private com: Commissions, private stamps: () => { name: string; x: number; z: number }[]) {
    this.map = new MapView(g, this.$('atlas-map') as HTMLCanvasElement);
    this.map.pins = () => this.pins();
    this.map.onPick = (x, z, sx, sy) => {
      const [lat, lon] = g.toLatLon(x, z);
      this.pop(sx, sy, `<b>${lat.toFixed(5)}, ${lon.toFixed(5)}</b>`, () => this.go(lat, lon));
    };
    this.map.onPin = (p, sx, sy) => {
      if (p.kind === 'page') { const pg = this.pages.find((q) => q.id === p.id); if (pg) this.lightbox(pg); return; }
      const [lat, lon] = g.toLatLon(p.x, p.z);
      this.pop(sx, sy, `<b>${esc(p.label)}</b>`, () => this.go(lat, lon));
    };
    for (const b of document.querySelectorAll<HTMLElement>('#atlas-tabs [data-tab]')) b.onclick = () => this.show(b.dataset.tab as Tab);
    this.$('atlas-close').onclick = () => this.toggle(false);
    const input = this.$('atlas-search') as HTMLInputElement;
    let deb = 0;
    input.addEventListener('input', () => { clearTimeout(deb); deb = window.setTimeout(() => void this.search(input.value), 350); });
    input.addEventListener('keydown', (e) => {
      e.stopPropagation();
      if (e.key === 'Enter') { clearTimeout(deb); void this.search(input.value, true); }
      if (e.key === 'Escape') { if (input.value) { input.value = ''; this.results = []; this.drawResults(); } else this.toggle(false); }
    });
    this.$('atlas-here').onclick = () => this.map.centerOn(g.walker.x, g.walker.z);
    this.$('lb-close').onclick = () => this.$('lightbox').classList.add('hidden');
    com.onChange = () => { if (this.open && this.tab === 'jobs') this.drawJobs(); this.map.invalidate(); };
  }

  toggle(force?: boolean, tab?: Tab) {
    this.open = force ?? !this.open;
    this.$('atlas').classList.toggle('hidden', !this.open);
    document.body.classList.toggle('atlas-open', this.open);
    this.$('atlas-pop').classList.add('hidden');
    if (this.open) {
      document.exitPointerLock?.();
      const town = this.g.locality();
      if (town) this.$('journal-title').textContent = town;
      this.map.centerOn(this.g.walker.x, this.g.walker.z, this.map.scale);
      this.show(tab ?? this.tab);
      void this.refreshPages();
      this.g.sound('page');
    } else {
      this.$('lightbox').classList.add('hidden');
      this.g.lock();
    }
  }
  focusSearch() {
    this.toggle(true, 'map');
    setTimeout(() => (this.$('atlas-search') as HTMLInputElement).focus(), 30);
  }

  private show(tab: Tab) {
    this.tab = tab;
    for (const b of document.querySelectorAll<HTMLElement>('#atlas-tabs [data-tab]')) b.classList.toggle('on', b.dataset.tab === tab);
    for (const p of document.querySelectorAll<HTMLElement>('#atlas .page')) p.classList.toggle('hidden', p.id !== `page-${tab}`);
    if (tab === 'book') this.drawBook();
    if (tab === 'jobs') this.drawJobs();
    if (tab === 'map') this.map.invalidate();
  }

  update(dt: number) {
    if (!this.open) return;
    if (this.tab === 'map') {
      this.map.render();
      if ((this.renderT -= dt) <= 0) { this.renderT = 0.5; this.map.invalidate(); } // your arrow moves
    }
  }

  // ---------------- map ----------------
  private pins(): Pin[] {
    const out: Pin[] = [];
    for (const p of this.pages) { const [x, z] = this.g.fromLatLon(p.lat, p.lon); out.push({ x, z, kind: 'page', label: p.place, id: p.id }); }
    for (const t of this.com.targets()) out.push({ x: t.x, z: t.z, kind: 'commission', label: t.title });
    for (const s of this.stamps()) out.push({ x: s.x, z: s.z, kind: 'stamp', label: s.name });
    out.push(...this.extraPins());
    for (const r of this.results) { const [x, z] = this.g.fromLatLon(r.lat, r.lon); out.push({ x, z, kind: 'result', label: r.name }); }
    return out;
  }
  private pop(sx: number, sy: number, html: string, go: () => void) {
    const el = this.$('atlas-pop');
    el.innerHTML = `${html}<button>walk here</button>`;
    el.style.left = `${sx}px`;
    el.style.top = `${sy}px`;
    el.classList.remove('hidden');
    el.querySelector('button')!.onclick = go;
  }
  private go(lat: number, lon: number) {
    this.toggle(false);
    void this.g.teleport(lat, lon);
  }

  private localItems() {
    const items: { name: string; detail: string; lat: number; lon: number; kind: string }[] = [];
    const seen = new Set<string>();
    for (const r of this.g.roads()) {
      if (!r.n || r.lod || seen.has(r.n) || r.p.length < 2) continue;
      seen.add(r.n);
      const mid = Math.floor(r.p.length / 4) * 2;
      const [lat, lon] = this.g.toLatLon(r.p[mid] / 10, r.p[mid + 1] / 10);
      items.push({ name: r.n, detail: 'street nearby', lat, lon, kind: 'street' });
    }
    for (const f of this.g.footprints()) {
      const label = f.name ?? f.addr;
      if (!label) continue;
      const [lat, lon] = this.g.toLatLon(f.ring[0][0], f.ring[0][1]);
      items.push({ name: label, detail: f.name && f.addr ? f.addr : f.kind === 'house' ? 'house' : f.kind, lat, lon, kind: 'building' });
    }
    for (const p of this.g.json.pois ?? []) { const [lat, lon] = this.g.toLatLon(p.x, p.z); items.push({ name: p.name, detail: p.kind, lat, lon, kind: 'poi' }); }
    return items;
  }
  private async search(q: string, jump = false) {
    const seq = ++this.searchSeq;
    const box = this.$('atlas-results');
    if (q.trim().length < 2) { this.results = []; this.drawResults(); return; }
    const ll = parseLatLon(q);
    const local = ll ? [ll] : searchLocal(q, this.localItems(), 5);
    this.results = local;
    this.drawResults();
    if (!ll) {
      box.dataset.state = 'searching';
      try {
        const [lat, lon] = this.g.toLatLon(this.g.walker.x, this.g.walker.z);
        const remote = await searchRemote(q, { lat, lon });
        if (seq !== this.searchSeq) return;
        const keys = new Set(local.map((p) => p.name.toLowerCase()));
        this.results = [...local, ...remote.filter((p) => !keys.has(p.name.toLowerCase()))].slice(0, 9);
        box.dataset.state = '';
      } catch {
        if (seq !== this.searchSeq) return;
        box.dataset.state = 'offline';
      }
      this.drawResults();
    }
    if (jump && this.results[0]) this.pick(this.results[0]);
  }
  private drawResults() {
    const box = this.$('atlas-results');
    const off = box.dataset.state === 'offline' ? '<li class="note">offline — showing streets and places already loaded</li>' : box.dataset.state === 'searching' ? '<li class="note">searching…</li>' : '';
    box.innerHTML = this.results.map((r, i) => `<li data-i="${i}"><b>${esc(r.name)}</b><span>${esc(r.detail)}${r.local ? ' · nearby' : ''}</span></li>`).join('') + off;
    for (const li of box.querySelectorAll<HTMLElement>('li[data-i]')) li.onclick = () => this.pick(this.results[+li.dataset.i!]);
    this.map.invalidate();
  }
  private pick(r: Place) {
    const [x, z] = this.g.fromLatLon(r.lat, r.lon);
    const far = Math.hypot(x - this.g.walker.x, z - this.g.walker.z) > 60000;
    if (!far) this.map.centerOn(x, z, Math.max(this.map.scale, 0.8));
    const el = this.$('atlas-pop');
    const cv = this.$('atlas-map');
    const [sx, sy] = far ? [cv.clientWidth / 2, cv.clientHeight / 2] : this.map.toScreen(x, z).map((v) => v / devicePixelRatio);
    this.pop(sx, sy, `<b>${esc(r.name)}</b><br><span>${esc(r.detail)}</span>${far ? '<br><span>far from here — the world will repaint around you</span>' : ''}`, () => this.go(r.lat, r.lon));
    el.classList.remove('hidden');
  }

  // ---------------- sketchbook ----------------
  async refreshPages() {
    this.pages = await listPages();
    for (const p of this.pages) if (!this.urls.has(p.id)) this.urls.set(p.id, URL.createObjectURL(p.thumb));
    if (this.tab === 'book') this.drawBook();
    this.map.invalidate();
  }
  private drawBook() {
    const el = this.$('page-book');
    if (!this.pages.length) {
      el.innerHTML = `<div class="empty"><h3>An empty sketchbook</h3><p>Press <kbd>P</kbd> anywhere to frame a view, then <kbd>Space</kbd> to paint it in. The wheel zooms; <kbd>[</kbd> <kbd>]</kbd> move the sun.</p></div>`;
      return;
    }
    el.innerHTML = `<div class="book">${this.pages.map((p) => `<figure data-id="${p.id}"><img src="${this.urls.get(p.id)}" alt=""><figcaption>${esc(p.place)}<span>${esc(p.when)}${p.commission ? ' · ✦' : ''}</span></figcaption></figure>`).join('')}</div>`;
    for (const f of el.querySelectorAll<HTMLElement>('figure')) f.onclick = () => { const p = this.pages.find((q) => q.id === f.dataset.id); if (p) this.lightbox(p); };
  }
  private lightbox(p: Page) {
    const lb = this.$('lightbox');
    const url = URL.createObjectURL(p.img);
    (this.$('lb-img') as HTMLImageElement).src = url;
    this.$('lb-cap').innerHTML = `<b>${esc(p.place)}</b> · ${esc(p.when)} · ${new Date(p.t).toLocaleDateString()}${p.commission ? `<br>✦ ${esc(p.commission)}` : ''}`;
    const dl = this.$('lb-dl') as HTMLAnchorElement;
    dl.href = url;
    dl.download = `${p.place.replace(/[^\w]+/g, '-').toLowerCase()}-${p.id}.jpg`;
    this.$('lb-go').onclick = () => { lb.classList.add('hidden'); this.go(p.lat, p.lon); };
    const del = this.$('lb-del');
    del.textContent = 'remove';
    del.onclick = async () => {
      if (del.textContent !== 'remove — sure?') { del.textContent = 'remove — sure?'; return; }
      await deletePage(p.id);
      lb.classList.add('hidden');
      await this.refreshPages();
    };
    lb.classList.remove('hidden');
  }

  // ---------------- commissions + spotting ----------------
  private drawJobs() {
    const el = this.$('page-jobs');
    const w = this.g.walker;
    const dirOf = (x: number, z: number) => {
      const d = Math.hypot(x - w.x, z - w.z);
      const a = (Math.atan2(x - w.x, -(z - w.z)) * 180) / Math.PI;
      const dir = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'][Math.round(((a + 360) % 360) / 45) % 8];
      return d < 1000 ? `${Math.round(d / 10) * 10} m ${dir}` : `${(d / 1000).toFixed(1)} km ${dir}`;
    };
    const act = this.com.state.active.map((a) => {
      let where = '';
      if (a.lat !== undefined) { const [x, z] = this.g.fromLatLon(a.lat, a.lon!); where = dirOf(x, z); }
      return `<li><b>✧ ${esc(a.title)}</b><span>${esc(a.hint)}${where ? ` · ${where}` : ''}</span></li>`;
    }).join('') || '<li class="note">new commissions appear as you explore</li>';
    const done = this.com.state.done.slice(-12).reverse().map((d) => `<li class="done">✦ ${esc(d.title.replace(/^Paint /, ''))}</li>`).join('');
    const spot = this.com.spottedSummary().map((f) => `<div class="spot"><h4>${f.label}s · ${f.seen.length} of ${f.all.length}</h4>${f.all.map((t) => (f.seen.includes(t) ? `<span class="chip">${esc(modelName(t))}</span>` : '<span class="chip unseen">?</span>')).join('')}</div>`).join('');
    el.innerHTML = `<div class="cols"><div><h3>Commissions</h3><ul class="jobs">${act}</ul>${done ? `<h3>Completed</h3><ul class="jobs">${done}</ul>` : ''}</div><div><h3>Spotted</h3><p class="note">Walk near a car, boat or plane (and look at it) to note its type.</p>${spot}</div></div>`;
  }
}
const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);
