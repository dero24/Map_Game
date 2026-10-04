// Arrival cards: cross into a new town and its name is painted across the top of the page —
// "<Town> / <County>, <State> / 7:42 pm · fair · first visit" (a phone paints it smaller, in the
// place name's spot, so the middle of the view stays clear). The town comes from our own place
// index's Census boundaries (geo.ts); at sea you're still where you were, and offline the region's
// own name (meta) stands in.
// A card also greets you at the start of a walk and after every teleport.
import type { GameCtx } from './ctx';
import { reverse, shortRegion } from './geo';
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
    // (the card fades on the wall clock, and the place name comes back as it goes — however slow
    // the frames, which the card's own countdown runs on)
    this.el.addEventListener('animationend', () => document.body.classList.remove('arriving'));
  }

  /** Show a card for wherever you are next (start of the walk, teleports). */
  greet() { this.force = true; this.lastX = Infinity; this.t = 0; }

  update(dt: number, blocked: boolean) {
    if (this.hideT > 0 && (this.hideT -= dt) <= 0) { this.el.classList.remove('show'); document.body.classList.remove('arriving'); }
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
      // no town here (out on the water, past the lower 48) or no answer (offline): you're still
      // where you were — only a greeting (the start, a teleport) says the region's own name
      if (!loc && !wasForced) return;
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
    // (a phone paints two lines: the name, then "Monmouth County, NJ · 7:42 pm" — the long region and
    // the sky's words are a PC's: style.css .a-long / .a-short / .a-more; review round 12, must-fix 4)
    const time = `${((hh + 11) % 12) + 1}:${String(mm).padStart(2, '0')} ${hh < 12 ? 'am' : 'pm'}`;
    const more = ` · ${sky} · ${first ? (postParams.sketchFar ? 'first visit — walk to paint it in' : 'first visit') : `${stats.km2 + stats.photoKm2 < 1 ? (stats.km2 + stats.photoKm2).toFixed(2) : (stats.km2 + stats.photoKm2).toFixed(1)} km² painted so far`}`;
    this.el.innerHTML = `<div class="a-name">${esc(name)}</div><div class="a-region"><span class="a-long">${esc(region)}</span><span class="a-short">${esc(shortRegion(region))}</span></div>`
      + `<div class="a-line"><span class="a-time">${time}</span><span class="a-more">${esc(more)}</span></div>`;
    this.el.classList.remove('show', 'a-tight', 'a-small');
    // (never cut off with "…" on a phone: a name too long for its line is painted a size smaller; a
    // region too long for the second line steps aside for the time — tools/hud-audit.mjs does the same)
    const nm = this.el.firstElementChild as HTMLElement;
    if (nm.scrollWidth > nm.clientWidth + 1) this.el.classList.add('a-small');
    if (this.el.scrollWidth > this.el.clientWidth + 1) this.el.classList.add('a-tight');
    void this.el.offsetWidth;
    this.el.classList.add('show');
    // (a phone paints the card where the place name stands, and the place name waits: style.css)
    document.body.classList.add('arriving');
    this.hideT = 5.5;
    this.g.sound('chime');
  }
}
const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);
