// Photo mode → a sketchbook. P frames the view (HUD away, viewfinder marks); the wheel zooms, [ and ]
// nudge the hour, H hides the frame; Space paints the page. A page is the rendered watercolor with a
// handwritten caption (place · time · commission), stored in the sketchbook (IndexedDB) with where it
// was painted — the map pins it and "go there" walks you back. With the far sketch on, a shot also
// paints everything in frame — the distance too — into the world (ctx.paintView).
import type { GameCtx } from './ctx';
import type { Commissions } from './commissions';
import { savePage, type Page } from './book';
import { walkParams } from '../player/controller';
import { PAINTABLE } from './brush';

const ZOOM_MIN = 18, ZOOM_MAX = 80;

export class PhotoMode {
  active = false;
  private pending = false;
  private fov = 62;
  private el: HTMLElement;
  private flashEl: HTMLElement;
  private info: HTMLElement;
  private pinchDistance = 0;
  private pinchIds = new Set<number>();
  onSaved: ((p: Page) => void) | null = null;

  constructor(private g: GameCtx, private com: Commissions) {
    this.el = document.getElementById('photo')!;
    this.flashEl = document.getElementById('photo-flash')!;
    this.info = document.getElementById('photo-info')!;
    window.addEventListener('wheel', (e) => {
      if (!this.active) return;
      e.stopImmediatePropagation();
      this.adjustZoom(e.deltaY > 0 ? 1.08 : 1 / 1.08);
    }, { capture: true, passive: true });
    window.addEventListener('keydown', (e) => {
      if (!this.active || (e.target as HTMLElement)?.closest?.('input,textarea,.lil-gui')) return;
      if (e.code === 'Space') { e.preventDefault(); e.stopImmediatePropagation(); if (!e.repeat) this.pending = true; }
      else if (e.code === 'BracketLeft' || e.code === 'BracketRight') this.adjustHour(e.code === 'BracketLeft' ? -0.25 : 0.25);
      else if (e.code === 'KeyH') this.toggleFrame();
      else if (e.code === 'Escape') this.toggle(false);
    }, { capture: true });
    document.getElementById('photo-shoot')?.addEventListener('click', () => (this.pending = true));
    document.getElementById('photo-exit')?.addEventListener('click', () => this.toggle(false));
    document.getElementById('photo-zoom-in')?.addEventListener('click', () => this.adjustZoom(1 / 1.12));
    document.getElementById('photo-zoom-out')?.addEventListener('click', () => this.adjustZoom(1.12));
    document.getElementById('photo-hour-back')?.addEventListener('click', () => this.adjustHour(-0.25));
    document.getElementById('photo-hour-forward')?.addEventListener('click', () => this.adjustHour(0.25));
    document.getElementById('photo-frame')?.addEventListener('click', () => this.toggleFrame());
    // A pinch zooms. Its two fingers are taken off the walking stick and the look drag the moment the
    // second lands (Walker.releaseTouches), so a zoom never walks or swings the view — and walking
    // with the stick while you frame stays yours, as WASD always has been.
    const canvas = this.g.canvas;
    canvas.addEventListener('touchstart', (e) => {
      if (!this.active) return;
      for (const t of Array.from(e.changedTouches)) this.pinchIds.add(t.identifier);
      if (this.pinchIds.size >= 2) { this.pinchDistance = this.distance(e.touches); this.g.walker.releaseTouches(); }
    }, { passive: true });
    canvas.addEventListener('touchmove', (e) => {
      if (!this.active || this.pinchIds.size < 2) return;
      const d = this.distance(e.touches);
      if (d > 0 && this.pinchDistance > 0) this.adjustZoom(this.pinchDistance / d);
      this.pinchDistance = d;
    }, { passive: true });
    const pinchEnd = (e: TouchEvent) => {
      for (const t of Array.from(e.changedTouches)) this.pinchIds.delete(t.identifier);
      if (this.pinchIds.size < 2) this.pinchDistance = 0;
    };
    canvas.addEventListener('touchend', pinchEnd);
    canvas.addEventListener('touchcancel', pinchEnd);
  }

  private distance(touches: TouchList) {
    const active = Array.from(touches).filter((t) => this.pinchIds.has(t.identifier)).slice(0, 2);
    return active.length < 2 ? 0 : Math.hypot(active[0].clientX - active[1].clientX, active[0].clientY - active[1].clientY);
  }

  adjustZoom(factor: number) {
    if (!this.active) return;
    walkParams.fov = Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, walkParams.fov * factor));
    this.status();
  }
  adjustHour(delta: number) {
    if (!this.active) return;
    this.g.setHour((this.g.hour() + delta + 24) % 24);
    this.status();
  }
  toggleFrame() {
    if (!this.active) return;
    this.el.classList.toggle('bare');
    const b = document.getElementById('photo-frame');
    if (b) { const hidden = this.el.classList.contains('bare'); b.textContent = hidden ? 'show frame' : 'hide frame'; b.setAttribute('aria-label', hidden ? 'show frame' : 'hide frame'); }
  }

  toggle(on = !this.active) {
    if (on === this.active) return;
    this.active = on;
    document.body.classList.toggle('postcard', on);
    this.el.classList.toggle('hidden', !on);
    this.el.classList.remove('bare');
    this.pinchIds.clear();
    this.pinchDistance = 0;
    const frame = document.getElementById('photo-frame');
    if (frame) { frame.textContent = 'hide frame'; frame.setAttribute('aria-label', 'hide frame'); }
    if (on) { this.fov = walkParams.fov; this.status(); }
    else walkParams.fov = this.fov;
  }

  private status() {
    const h = this.g.hour(), hh = Math.floor(h), mm = Math.floor((h - hh) * 60);
    const a = this.com.judge();
    // (the place label is the map's own text — a street, a town — escaped)
    this.info.innerHTML = `${esc(this.g.placeLabel())} · ${((hh + 11) % 12) + 1}:${String(mm).padStart(2, '0')} ${hh < 12 ? 'am' : 'pm'} · ${Math.round(50 / Math.tan((walkParams.fov * Math.PI) / 360) / 1.73)} mm`
      + (a ? `<br><span class="ok">✧ ${esc(a.title)} — in frame</span>` : '');
  }

  /** Call right after the frame is drawn: the WebGL canvas still holds this frame's pixels. */
  afterRender() {
    if (this.active && (this.statusT = (this.statusT ?? 0) - 1) <= 0) { this.statusT = 20; this.status(); }
    if (!this.pending) return;
    this.pending = false;
    void this.shoot();
  }
  private statusT?: number;

  private async shoot() {
    const src = this.g.canvas;
    const W = Math.min(1800, src.width), H = Math.round((W * src.height) / src.width);
    const cap = Math.round(H * 0.11);
    const page = document.createElement('canvas');
    page.width = W;
    page.height = H + cap;
    const ctx = page.getContext('2d')!;
    ctx.fillStyle = '#f5efe1';
    ctx.fillRect(0, 0, page.width, page.height);
    ctx.drawImage(src, 0, 0, W, H);
    // (the far sketch) whatever's in frame — the distance too — blooms into colour in the world,
    // read from this very frame's depth; the brush sounds as the colour runs out
    const framed = this.g.paintView().catch(() => null);
    void framed.then((s) => { if (s?.cells) this.g.sound('brush'); });
    // flash + brush right away (the encode below takes a moment)
    this.flashEl.classList.remove('go');
    void this.flashEl.offsetWidth;
    this.flashEl.classList.add('go');
    this.g.sound('shutter');

    const done = this.com.judge();
    const [lat, lon] = this.g.toLatLon(this.g.walker.x, this.g.walker.z);
    const h = this.g.hour(), hh = Math.floor(h), mm = Math.floor((h - hh) * 60);
    const env = this.g.env();
    const light = env.night > 0.6 ? 'night' : env.golden > 0.35 ? 'golden hour' : env.fog > 0.3 ? 'sea fog' : h < 10 ? 'morning' : h < 16 ? 'midday' : 'late afternoon';
    const town = this.g.locality();
    const label = this.g.placeLabel();
    const place = town && !label.includes(town) ? `${label}, ${town}` : label;
    const when = `${((hh + 11) % 12) + 1}:${String(mm).padStart(2, '0')} ${hh < 12 ? 'am' : 'pm'} · ${light}`;
    // caption, in a hand that sits on the paper
    ctx.fillStyle = '#3a3346';
    ctx.textBaseline = 'middle';
    ctx.font = `italic ${Math.round(cap * 0.36)}px Georgia, serif`;
    ctx.fillText(place, cap * 0.45, H + cap * 0.42);
    ctx.font = `${Math.round(cap * 0.22)}px Georgia, serif`;
    ctx.globalAlpha = 0.7;
    const date = new Date().toLocaleDateString(undefined, { month: 'long', day: 'numeric', year: 'numeric' });
    ctx.fillText(`${when} · ${date} · ${lat.toFixed(4)}, ${lon.toFixed(4)}`, cap * 0.45, H + cap * 0.78);
    if (done) {
      ctx.textAlign = 'right';
      ctx.fillStyle = '#a0503c';
      ctx.font = `italic ${Math.round(cap * 0.26)}px Georgia, serif`;
      ctx.fillText(`✦ ${done.title.replace(/^Paint /, '')}`, W - cap * 0.45, H + cap * 0.42);
    }
    ctx.globalAlpha = 1;
    const img = await new Promise<Blob | null>((r) => page.toBlob(r, 'image/jpeg', 0.88));
    const th = document.createElement('canvas');
    th.width = 360;
    th.height = Math.round((360 * page.height) / page.width);
    th.getContext('2d')!.drawImage(page, 0, 0, th.width, th.height);
    const thumb = await new Promise<Blob | null>((r) => th.toBlob(r, 'image/jpeg', 0.8));
    if (!img || !thumb) return this.g.toast('the paint would not dry — try again');
    const p: Page = { id: `pg-${Date.now().toString(36)}`, t: Date.now(), lat, lon, yaw: this.g.walker.yaw, place, when, commission: done?.title, img, thumb };
    await savePage(p);
    const painted = this.com.paintFrame(p.id);
    // a coloured card is a kind you can paint anywhere now (ui/brush.ts)
    const yours = this.com.fresh.some((k) => (PAINTABLE as readonly string[]).includes(k.split(':')[0]));
    const thumbs = document.body.classList.contains('nomouse'); // (a phone names its buttons, not keys)
    if (painted.length) setTimeout(() => this.g.toast(`almanac: painted in — ${painted.slice(0, 3).join(', ')}${painted.length > 3 ? ` and ${painted.length - 3} more` : ''}${yours ? ` · yours to paint now: ${thumbs ? '✎' : 'B'} for your brush` : ''}`), done ? 2600 : 1800);
    const seen = await framed;
    const inWorld = seen?.cells ? `painted in what you framed — out to ${far(seen.reach)}` : '';
    if (done) {
      this.com.complete(done, p.id);
      this.g.sound('chime');
      this.g.toast(`✦ commission complete — ${done.title}`);
      if (inWorld) setTimeout(() => this.g.toast(inWorld), painted.length ? 4600 : 2600);
    } else this.g.toast(inWorld ? `${inWorld} · ${thumbs ? '☰' : 'M'} for your sketchbook` : `painted into your sketchbook · ${thumbs ? '☰' : 'M'} to see it`);
    this.onSaved?.(p);
    this.status();
  }
}
const far = (m: number) => (m < 1000 ? `${Math.max(10, Math.round(m / 10) * 10)} m` : `${(m / 1000).toFixed(m < 9950 ? 1 : 0)} km`);
const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);
