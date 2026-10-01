// Arrival cards: cross into a new town and its name is painted across the top of the page —
// "Monmouth Beach / Monmouth County, New Jersey / 7:42 pm · fair · first visit". The town comes from
// reverse geocoding (geo.ts, cached + throttled); offline the region's own name (meta) stands in.
// A card also greets you at the start of a walk and after every teleport.
import type { GameCtx } from './ctx';
import { reverse, isOffline } from './geo';
import { postParams } from '../render/post';

export class Arrival {
  private el: HTMLElement;
  private cur = '';
  private pendingName = '';
  private lastX = Infinity;
  private lastZ = Infinity;
  private t = 0;
  private hideT = 0;
  private force = false;
  locality = '';
  region = '';

  constructor(private g: GameCtx, private fallback: { name: string; sub: string }) {
    this.el = document.getElementById('arrival')!;
  }

  /** Show a card for wherever you are next (start of the walk, teleports). */
  greet() { this.force = true; this.lastX = Infinity; this.t = 0; }

  update(dt: number, blocked: boolean) {
    if (this.hideT > 0 && (this.hideT -= dt) <= 0) this.el.classList.remove('show');
    if ((this.t -= dt) > 0) return;
    this.t = 1;
    const w = this.g.walker;
    if (!this.force && Math.hypot(w.x - this.lastX, w.z - this.lastZ) < 350) return;
    this.lastX = w.x;
    this.lastZ = w.z;
    const [lat, lon] = this.g.toLatLon(w.x, w.z);
    const wasForced = this.force;
    const before = this.g.explore.paintedBefore(w.x, w.z); // saved paint, not this visit's bloom
    void Promise.all([reverse(lat, lon), before]).then(([loc, painted]) => {
      const first = !painted;
      // throttled (or offline mid-walk): look again soon — a greeting waits unless we're truly offline
      if (!loc && (!wasForced || !isOffline())) { this.lastX = Infinity; if (wasForced) this.force = true; return; }
      const name = loc?.locality || this.fallback.name;
      const region = loc ? loc.region : this.fallback.sub;
      // a new name must hold for two looks (borders are ragged) unless we were asked to greet
      if (name !== this.cur) {
        if (!wasForced && this.pendingName !== name) { this.pendingName = name; this.lastX = Infinity; return; }
        this.pendingName = '';
        this.cur = name;
        this.locality = name;
        this.region = region;
        if (!blocked) this.show(name, region, first);
      } else if (wasForced && !blocked) this.show(name, region, false);
      this.force = false;
    });
    if (wasForced) this.force = false;
  }

  private show(name: string, region: string, first: boolean) {
    const h = this.g.hour(), hh = Math.floor(h), mm = Math.floor((h - hh) * 60);
    const env = this.g.env();
    const sky = env.fog > 0.3 ? 'sea fog' : env.night > 0.6 ? 'night' : env.golden > 0.35 ? 'golden hour' : 'fair';
    const stats = this.g.explore.stats();
    this.el.innerHTML = `<div class="a-name">${esc(name)}</div><div class="a-region">${esc(region)}</div>`
      + `<div class="a-line">${((hh + 11) % 12) + 1}:${String(mm).padStart(2, '0')} ${hh < 12 ? 'am' : 'pm'} · ${sky} · ${first ? (postParams.sketchFar ? 'first visit — walk to paint it in' : 'first visit') : `${stats.km2 + stats.photoKm2 < 1 ? (stats.km2 + stats.photoKm2).toFixed(2) : (stats.km2 + stats.photoKm2).toFixed(1)} km² painted so far`}</div>`;
    this.el.classList.remove('show');
    void this.el.offsetWidth;
    this.el.classList.add('show');
    this.hideT = 5.5;
    this.g.sound('chime');
  }
}
const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);
