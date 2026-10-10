// The brush (a prototype of placing — docs/GAMEPLAY_VISION.md §6–§7; the solvers are docs/GAME_DESIGN.md §5):
// paint anything you've painted from life, anywhere you aim.
//
// B takes it out. The chips along the bottom are the kinds whose Almanac cards you've coloured in
// (painted with P); the one that fits what you're aiming at comes first (water: a boat; a street:
// a car). A pencil sketch of it snaps to the nearest spot that fits (player/place.ts) — you aim,
// you never draw on the world. Click (on a phone: tap the sketch) and the colour washes in from
// where you touched it, wet and rich; rub to hurry it. Then it dries (it's real: vehicles.ts
// paint()), lightens and settles — a ring on the water, the view leaning in — and it stays where
// you painted it. A kind you haven't painted from life shows as a pencil chip that says where to
// find one. The sketch is drawn in a pass of its own over the painting (render/post.ts): paper and
// a boiling graphite line, the world paling round it, never lost behind whatever stands in front.
// Your van (src/van/) is among the cars, always yours to paint: there's only the one, so painting it
// brings it — room and all — to where you painted it (`van`).
import * as THREE from 'three';
import type { GameCtx } from './ctx';
import type { Hint } from './hints';
import type { Commissions } from './commissions';
import { modelName, type Vehicles } from '../player/vehicles';
import type { WalkWorld } from '../player/collision';
import { propMaterial } from '../render/propMaterial';
import { U } from '../render/shared';
import { postParams } from '../render/post';
import { placeBoat, placeCar, placeBalloon, openWater, compass, HULL, type Placement, type Spot } from '../player/place';
import { boatDims, BOAT_TYPES, type BoatType } from '../assets/kit';
import { camperPicture, camperRecipe } from '../assets/camper';

import { PAINTABLE } from './commissions';
export { PAINTABLE };
type Fam = (typeof PAINTABLE)[number];
/** A chip: a kind you own, or (type '') a family you haven't painted from life yet. */
interface Kind { family: Fam; type: string }
/** Your van's chip (a car's: it goes on a street). */
const VAN = 'camper';
/** What the brush needs of your van: whether you can paint it now (outside it, parked), and painting
 *  it there (main.ts: the van parks at the spot) — the van's own group, which the drying rides. */
export interface VanHook { available(): boolean; place(spot: Spot): { x: number; z: number; obj: THREE.Object3D } }
type Site = 'water' | 'street' | 'ground';

// Your own colours: a painted thing is bold by default (Round 9: "the default white and green is
// the moored skiff's livery — the boat isn't yours"), each kind its own of the four, then the classics.
const BOLD = [0xc8432c, 0x2f5f9e, 0xe2a52a, 0x3f7f52];
const SWATCHES: Record<Fam, number[]> = {
  boat: [...BOLD, 0xf4f1ea, 0x2a2c30],
  car: [...BOLD, 0xf2f2ee, 0x26282c],
  balloon: [0xd8412f, 0xf2b632, 0x2f6fb5, 0x3f9a5c, 0x7b3f9e, 0xe86a92],
};
const boldFor = (type: string) => { let h = 7; for (let i = 0; i < type.length; i++) h = (h * 31 + type.charCodeAt(i)) >>> 0; return BOLD[h % BOLD.length]; };
const SAMPLE: Record<Fam, string> = { boat: 'skiff', car: 'sedan', balloon: 'gores' }; // a pencil chip's picture
const FITS: Record<Site, Fam | null> = { water: 'boat', street: 'car', ground: 'balloon' };
const hex = (c: number) => `#${c.toString(16).padStart(6, '0')}`;
const RANGE = 160; // how far the brush reaches (m)
const WASH_S = 1.3; // an unhurried wash, seconds (rubbing: up to three times the pace)…
const DRY_S = 0.9; // …then it dries: the wet colour lightens into the real thing…
const FX_S = 1.8; // …as it settles onto the water (a ring runs out) and the view leans in
const STORE = 'map-game.brush.v1';
interface Saved { recent: string[]; colors: Record<string, number>; stripes?: Record<string, number>; used?: boolean }

const CSS = `
#brush { position: fixed; left: 50%; bottom: calc(32px + env(safe-area-inset-bottom)); /* (above the map credit: it stays readable) */ transform: translateX(-50%); z-index: 21; display: none; flex-direction: column; align-items: center; gap: 6px; pointer-events: none; color: #3a3346; font-family: Georgia, serif; }
#brush.on { display: flex; }
#brush .row { display: flex; gap: 6px; align-items: center; pointer-events: auto; background: rgba(245,239,225,0.88); border: 1px solid rgba(58,51,70,0.2); border-radius: 6px; padding: 6px 8px; max-width: 94vw; overflow-x: auto; box-shadow: 0 2px 14px rgba(40,30,60,0.12); }
#brush .chips { display: flex; gap: 6px; align-items: center; }
#brush .chip { display: flex; flex-direction: column; align-items: center; gap: 2px; background: none; border: 1px solid transparent; border-radius: 4px; padding: 3px 4px; font: inherit; font-size: 12px; color: inherit; cursor: pointer; min-width: 66px; }
#brush .chip img { width: 64px; height: 44px; object-fit: cover; border-radius: 2px; }
#brush .chip.sel { border-color: rgba(58,51,70,0.55); background: rgba(255,255,255,0.4); }
#brush .chip.pencil { font-style: italic; opacity: 0.72; }
#brush .sws { display: flex; gap: 6px; padding: 0 6px; border-left: 1px solid rgba(58,51,70,0.15); }
#brush .sw { width: 22px; height: 22px; border-radius: 50%; border: 1.5px solid rgba(58,51,70,0.35); cursor: pointer; padding: 0; }
#brush .sw.sel { box-shadow: 0 0 0 2px rgba(245,239,225,0.95), 0 0 0 3.5px #3a3346; }
#brush .rotate { min-width: 42px; min-height: 40px; border: 1px solid rgba(58,51,70,0.2); border-radius: 4px; background: rgba(255,255,255,0.5); color: inherit; font: 22px Georgia, serif; touch-action: manipulation; }
#brush .pick { width: 26px; height: 26px; padding: 0; border: 1.5px dashed rgba(58,51,70,0.45); border-radius: 50%; background: conic-gradient(#d8412f, #f2b632, #3f9a5c, #2f6fb5, #7b3f9e, #d8412f); cursor: pointer; }
#brush .pick::-webkit-color-swatch-wrapper { padding: 0; opacity: 0; }
#brush .stripe { display: flex; align-items: center; gap: 4px; font-size: 11px; font-style: italic; opacity: 0.85; }
#brush .x { font: inherit; font-size: 18px; border: none; background: none; cursor: pointer; color: inherit; padding: 4px 8px; }
#brush .status { background: rgba(245,239,225,0.9); border: 1px solid rgba(58,51,70,0.15); border-radius: 12px; padding: 4px 14px; font-size: 14px; font-style: italic; white-space: nowrap; max-width: 92vw; overflow: hidden; text-overflow: ellipsis; }
#brush-dot { position: fixed; left: 50%; top: 50%; width: 12px; height: 12px; margin: -6px 0 0 -6px; border: 1.5px solid rgba(58,51,70,0.65); border-radius: 50%; display: none; pointer-events: none; z-index: 20; }
#brush-dot.on { display: block; }
body.touch #brush-dot, body.postcard #brush, body.postcard #brush-dot { display: none !important; }
body.brushing #hud { display: none; }
/* a phone: the bar goes to the top — the walking thumb and the buttons keep the bottom — kept
   short (one line of chips that scrolls sideways, the colours a line of their own) so the sketch
   has the rest of the screen */
body.touch #brush { top: calc(64px + env(safe-area-inset-top)); bottom: auto; left: 8px; right: 8px; transform: none; align-items: stretch; gap: 4px; }
body.touch #brush .row { flex-wrap: wrap; overflow-x: visible; padding: 4px 6px; row-gap: 2px; }
body.touch #brush .chips { flex: 1 1 0; min-width: 0; overflow-x: auto; scrollbar-width: none; }
body.touch #brush .chip { min-width: 50px; padding: 2px 3px; font-size: 11px; }
body.touch #brush .chip img { width: 46px; height: 30px; }
body.touch #brush .x { order: 2; }
body.touch #brush .sws { order: 3; width: 100%; justify-content: center; border-left: none; padding: 3px 0 1px; }
body.touch #brush .status { white-space: normal; text-align: center; font-size: 13px; padding: 3px 12px; }
@media (max-width: 640px) { body:not(.touch) #brush .chip { min-width: 54px; } body:not(.touch) #brush .chip img { width: 52px; height: 36px; } #brush .status { font-size: 13px; } }
/* a phone on its side: the bar is a narrow column at the left, clear of the buttons on the right */
@media (orientation: landscape) and (max-height: 500px) {
  body.touch #brush { top: calc(8px + env(safe-area-inset-top)); left: calc(8px + env(safe-area-inset-left)); right: auto; width: 208px; }
  body.touch #brush .chips { flex-wrap: wrap; overflow-x: visible; }
}
`;

export class Brush {
  active = false;
  /** Your van (main.ts sets it with ?poc's van): a chip among the cars. */
  van: VanHook | null = null;
  private kinds: Kind[] = [];
  private view: number[] = []; // the chips shown: the kinds (indices) of the family that fits your aim
  private viewFam: Fam | null = null;
  private pick = 0; // (into view)
  private soundT = 0;
  private turn = 0; // R: a quarter-turn at a time for boats; a car turns to the other lane
  private saved: Saved = { recent: [], colors: {} };
  private ghost: { key: string; obj: THREE.Group; spot: Spot | null; shown: { x: number; z: number; yaw: number } | null } | null = null;
  private mat = propMaterial({ wash: true });
  private washing: { r: number; max: number; rub: number; rate: number; at: THREE.Vector3; kind: Kind; spot: Spot; color: number; colors?: number[] } | null = null;
  private drying: { t: number; x: number; z: number; boat: boolean; toast: string; obj: THREE.Object3D; splash: boolean } | null = null;
  private pale = 0; // how far the world has paled round the sketch
  /** The sketch pass's scene (post.ts draws it over the painting); its root follows the world's. */
  readonly scene = new THREE.Scene();
  private why = '';
  private whereT = 0;
  private solveT = 0;
  private aim: { x: number; z: number; site: Site } | null = null;
  private lastSolve = { x: NaN, z: NaN, key: '', turn: 0 };
  private tap: { x: number; z: number } | null = null; // touch: where you tapped (it stays put)
  private mouse: { x: number; y: number } | null = null; // an unlocked mouse aims under the cursor
  private held = false;
  private touches = new Map<number, { x: number; y: number; t: number; moved: number }>();
  private root = new THREE.Group();
  private el: HTMLElement;
  private rowEl: HTMLElement;
  private statusEl: HTMLElement;
  private dot: HTMLElement;
  private ray = new THREE.Raycaster();
  private v3 = new THREE.Vector3();
  private hintT = 0;
  private hintNear: string | null = null;
  private farWhy: { x: number; z: number; why: string } | null = null;

  constructor(
    private g: GameCtx,
    private com: Commissions,
    private veh: Vehicles,
    private walk: WalkWorld,
    private world: THREE.Object3D,
    private origin: THREE.Vector3, // the render origin (main.ts reanchor): render = world − origin
    private enabled: () => boolean, // false in menus, photo mode, a ride
  ) {
    this.root.name = 'brush';
    this.scene.add(this.root);
    try { this.saved = { ...this.saved, ...(JSON.parse(localStorage.getItem(STORE) ?? 'null') ?? {}) }; } catch { /* fresh */ }
    const st = document.createElement('style');
    st.textContent = CSS;
    document.head.appendChild(st);
    this.el = document.createElement('div');
    this.el.id = 'brush';
    this.rowEl = document.createElement('div');
    this.rowEl.className = 'row';
    this.statusEl = document.createElement('div');
    this.statusEl.className = 'status';
    this.el.append(this.rowEl, this.statusEl);
    document.body.appendChild(this.el);
    this.dot = document.createElement('div');
    this.dot.id = 'brush-dot';
    document.body.appendChild(this.dot);
    // the phone's brush button, beside the others
    const tb = document.createElement('button');
    tb.id = 'tbrush';
    tb.className = 'tbtn';
    tb.title = 'your brush';
    tb.setAttribute('aria-label', 'open your brush');
    tb.dataset.label = 'Brush';
    tb.innerHTML = '<svg class="ic" viewBox="0 0 24 24" aria-hidden="true"><path d="M14.2 4.6 19.4 9.8 11.3 17.9 6.1 12.7z"/><path d="M6.1 12.7c-2 .4-3.1 2.1-3.3 6.5 4.4-.2 6.1-1.3 6.5-3.3"/><path d="m16.8 2 5.2 5.2"/></svg>';
    tb.onclick = () => { if (this.active || this.enabled()) this.toggle(); };
    (document.getElementById('tphoto') ?? document.getElementById('touchui'))?.after?.(tb);

    window.addEventListener('keydown', (e) => {
      if ((e.target as HTMLElement)?.closest?.('input,textarea,.lil-gui')) return;
      if (e.code === 'KeyB' && !e.shiftKey && !e.repeat && (this.active || this.enabled())) return this.toggle();
      if (!this.active) return;
      if (e.code === 'Escape') this.toggle(false);
      else if (/^Digit[1-9]$/.test(e.code)) this.choose(+e.code.slice(5) - 1);
      else if (e.code === 'KeyR' && !e.repeat) this.rotate((e.shiftKey ? -1 : 1) * (Math.PI / 4));
      else if (e.code === 'KeyC' && !e.repeat) this.cycleColor();
    });
    window.addEventListener('wheel', (e) => {
      if (!this.active || (e.target as HTMLElement)?.closest?.('.lil-gui,#brush')) return;
      e.stopImmediatePropagation();
      if (this.view.length) this.choose((this.pick + (e.deltaY > 0 ? 1 : -1) + this.view.length) % this.view.length);
    }, { capture: true, passive: true });
    const cv = g.canvas;
    cv.addEventListener('mousedown', (e) => {
      if (!this.active) return;
      if (e.button === 2) return this.toggle(false);
      if (e.button !== 0) return;
      if (g.walker.locked) this.start(0, 0);
      else if (this.mouse) this.start((e.clientX / innerWidth) * 2 - 1, -(e.clientY / innerHeight) * 2 + 1, true);
      this.held = !!this.washing;
      g.walker.holdLook = this.held;
    });
    window.addEventListener('mouseup', () => { this.held = false; g.walker.holdLook = false; });
    cv.addEventListener('mousemove', (e) => {
      if (!this.active) return;
      if (this.held && this.washing) this.washing.rub += Math.abs(e.movementX) + Math.abs(e.movementY);
      this.mouse = g.walker.locked ? null : { x: e.clientX, y: e.clientY };
    });
    cv.addEventListener('contextmenu', (e) => { if (this.active) e.preventDefault(); });
    // touch: a tap on the world says where; a tap on the sketch starts the wash; rub it to hurry.
    // (Anywhere on the screen: a tap never moves the walking stick, which only walks when dragged.)
    cv.addEventListener('touchstart', (e) => {
      if (!this.active) return;
      for (const t of Array.from(e.changedTouches)) this.touches.set(t.identifier, { x: t.clientX, y: t.clientY, t: performance.now(), moved: 0 });
      if (this.washing) g.walker.holdLook = true; // (rubbing the sketch doesn't turn your head)
    }, { passive: true });
    cv.addEventListener('touchmove', (e) => {
      for (const t of Array.from(e.changedTouches)) {
        const s = this.touches.get(t.identifier);
        if (!s) continue;
        const d = Math.hypot(t.clientX - s.x, t.clientY - s.y);
        s.moved += d;
        s.x = t.clientX;
        s.y = t.clientY;
        if (this.washing) this.washing.rub += d;
      }
    }, { passive: true });
    cv.addEventListener('touchend', (e) => {
      for (const t of Array.from(e.changedTouches)) {
        const s = this.touches.get(t.identifier);
        this.touches.delete(t.identifier);
        if (!s || !this.active || s.moved > 14 || performance.now() - s.t > 450) continue;
        const nx = (t.clientX / innerWidth) * 2 - 1, ny = -(t.clientY / innerHeight) * 2 + 1;
        if (this.washing) continue;
        if (this.hitsGhost(nx, ny)) this.start(nx, ny, true);
        else {
          const h = this.cast(nx, ny);
          if (h) this.tap = { x: h.x, z: h.z };
        }
      }
      if (!this.touches.size) g.walker.holdLook = false;
    });
    this.hook();
  }

  // ---------------- chips ----------------
  private refresh() {
    const real = this.com.owned(PAINTABLE) as Kind[]; // (painted from life: your van isn't, it's yours)
    const owned = [...real, ...(this.van?.available() ? [{ family: 'car' as Fam, type: VAN }] : [])];
    const rank = (k: Kind) => { const i = this.saved.recent.indexOf(`${k.family}:${k.type}`); return i < 0 ? 1e3 : i; };
    owned.sort((a, b) => rank(a) - rank(b)); // (a stable sort: newest-painted order otherwise)
    this.kinds = [...owned];
    for (const f of PAINTABLE) if (!real.some((k) => k.family === f)) this.kinds.push({ family: f, type: '' });
    this.setView(this.viewFam, true);
  }
  /** Show the family that fits what you aim at (water: boats; a street: cars), else them all. */
  private setView(fam: Fam | null, force = false) {
    if (!force && fam === this.viewFam) return;
    this.viewFam = fam;
    const v = this.kinds.map((_, i) => i).filter((i) => !fam || this.kinds[i].family === fam);
    this.view = v.length ? v : this.kinds.map((_, i) => i);
    this.pick = 0;
    this.whereT = 0;
    this.build();
  }
  private get cur(): Kind | undefined { return this.kinds[this.view[this.pick]]; }
  private build() {
    this.rowEl.replaceChildren();
    const chips = document.createElement('div');
    chips.className = 'chips';
    this.rowEl.appendChild(chips);
    this.view.map((i) => this.kinds[i]).forEach((k, i) => {
      const b = document.createElement('button');
      b.className = `chip${i === this.pick ? ' sel' : ''}${k.type ? '' : ' pencil'}`;
      const img = document.createElement('img');
      img.alt = '';
      try { img.src = this.g.cardArt(k.family, k.type || SAMPLE[k.family], !k.type); } catch { /* no art: the name will do */ }
      const s = document.createElement('span');
      s.textContent = k.type === VAN ? 'your van' : k.type ? modelName(k.type) : `a ${k.family}?`;
      b.append(img, s);
      b.onclick = () => this.choose(i);
      chips.appendChild(b);
    });
    const k = this.cur;
    if (k?.type && k.type !== VAN) { // (your van keeps its own paint)
      const sws = document.createElement('div');
      sws.className = 'sws';
      const cur = this.color(k);
      for (const c of SWATCHES[k.family]) {
        const b = document.createElement('button');
        b.className = `sw${c === cur ? ' sel' : ''}`;
        b.style.background = `#${c.toString(16).padStart(6, '0')}`;
        b.title = 'paint it this colour';
        b.onclick = () => this.setColor(k, c);
        sws.appendChild(b);
      }
      // …or any colour at all (your own, not a livery)
      const any = document.createElement('input');
      any.type = 'color';
      any.className = 'pick';
      any.value = hex(cur);
      any.title = 'any colour';
      any.setAttribute('aria-label', 'paint it any colour');
      any.onchange = () => this.setColor(k, parseInt(any.value.slice(1), 16));
      sws.appendChild(any);
      if (k.family === 'balloon') {
        // a balloon has a second colour: its stripes, bands or diamonds
        const st = document.createElement('label');
        st.className = 'stripe';
        const p2 = document.createElement('input');
        p2.type = 'color';
        p2.className = 'pick';
        p2.value = hex(this.stripe(k));
        p2.setAttribute('aria-label', 'the balloon\'s second colour');
        p2.onchange = () => { (this.saved.stripes ??= {})[`${k.family}:${k.type}`] = parseInt(p2.value.slice(1), 16); this.save(); this.build(); };
        st.append('stripes', p2);
        sws.appendChild(st);
      }
      this.rowEl.appendChild(sws);
    }
    const rotate = document.createElement('button');
    rotate.className = 'rotate';
    rotate.textContent = '↻';
    rotate.title = 'turn the painting 45°';
    rotate.setAttribute('aria-label', 'turn the painting 45 degrees');
    rotate.onclick = () => this.rotate();
    this.rowEl.appendChild(rotate);
    const x = document.createElement('button');
    x.className = 'x';
    x.textContent = '✕';
    x.title = 'put the brush away';
    x.onclick = () => this.toggle(false);
    this.rowEl.appendChild(x);
  }
  private choose(i: number) {
    if (i < 0 || i >= this.view.length || this.washing || this.drying || i === this.pick) return;
    this.pick = i;
    this.whereT = 0;
    this.build();
  }
  rotate(step = Math.PI / 4) { if (!this.washing && !this.drying) this.turn += step; }
  private color(k: Kind) { return k.type === VAN ? camperRecipe(1).paint : this.saved.colors[`${k.family}:${k.type}`] ?? (k.family === 'balloon' ? 0xd8412f : boldFor(k.type)); }
  /** A balloon's second colour (its stripes): chosen, else one that sits well with the first. */
  private stripe(k: Kind) { const c = this.color(k); return this.saved.stripes?.[`${k.family}:${k.type}`] ?? (c === 0xf2b632 ? 0x2f6fb5 : 0xf2b632); }
  private colors(k: Kind) { return k.family === 'balloon' ? [this.color(k), this.stripe(k), 0xf4f1ea] : undefined; }
  private setColor(k: Kind, c: number) {
    this.saved.colors[`${k.family}:${k.type}`] = c;
    this.save();
    this.build();
  }
  private cycleColor() {
    const k = this.cur;
    if (!k?.type || k.type === VAN || this.washing || this.drying) return;
    const S = SWATCHES[k.family], i = S.indexOf(this.color(k));
    this.setColor(k, S[(i + 1) % S.length]);
  }
  private save() { try { localStorage.setItem(STORE, JSON.stringify(this.saved)); } catch { /* ignore */ } }

  toggle(on = !this.active) {
    if (on === this.active) return;
    if (on && !this.enabled()) return;
    this.active = on;
    this.el.classList.toggle('on', on);
    document.body.classList.toggle('brushing', on);
    this.dot.classList.toggle('on', on);
    this.g.walker.holdLook = false;
    this.held = false;
    this.tap = null;
    this.mouse = null;
    this.washing = null;
    this.drying = null;
    this.touches.clear();
    this.pale = 0;
    U.uBrush.value.w = 0;
    U.uGhost.value.y = U.uGhost.value.z = 0;
    U.uRipple.value.w = 0;
    this.g.walker.zoom = 0;
    this.mat.uniforms.uWash.value.set(0, 1, 0, 0);
    if (on) {
      this.turn = 0;
      this.viewFam = null;
      this.refresh();
      this.g.sound('page');
    } else this.dropGhost();
  }

  // ---------------- aiming ----------------
  /** The world point under screen point (nx, ny) — ground, water or a roof — within the brush's reach. */
  private cast(nx: number, ny: number) {
    const cam = this.g.camera;
    const o = this.v3.copy(cam.position).add(this.origin).clone();
    const d = new THREE.Vector3(nx, ny, 0.5).unproject(cam).sub(cam.position).normalize();
    const T = this.g.terrain, walk = this.walk;
    const above = (t: number) => {
      const x = o.x + d.x * t, y = o.y + d.y * t, z = o.z + d.z * t;
      const b = walk.buildingAt(x, z);
      if (b >= 0) {
        const f = walk.floorsOf(b);
        return y - (f ? f.floor0 + f.levels * f.floorH + 2.5 : Math.max(T.heightAt(x, z), 0) + 10);
      }
      return y - Math.max(T.heightAt(x, z), 0);
    };
    let t = 0.4, step = 0.5;
    if (above(t) < 0) return null; // (a wall in your face)
    while (t < RANGE) {
      const next = t + step;
      if (above(next) < 0) {
        let lo = t, hi = next;
        for (let i = 0; i < 14; i++) { const m = (lo + hi) / 2; if (above(m) < 0) hi = m; else lo = m; }
        return { x: o.x + d.x * hi, y: o.y + d.y * hi, z: o.z + d.z * hi, t: hi };
      }
      t = next;
      step = Math.min(3, 0.5 + t * 0.025);
    }
    return null;
  }
  private site(x: number, z: number): Site {
    const w = this.veh.placeWorld;
    if (openWater(w, x, z) || w.sdf(x, z) < 0) return 'water';
    return placeCar(w, x, z, 0, 6).ok ? 'street' : 'ground';
  }
  private solve(k: Kind, x: number, z: number): Placement {
    // a boat asks for the room its own hull needs: a skiff lies near the bank, a cruiser further out
    const dims = k.family === 'boat' && (BOAT_TYPES as string[]).includes(k.type) ? boatDims(k.type as BoatType) : null;
    const hull = dims ? { room: dims.L / 2 + 0.8, depth: dims.draft + 0.15 } : HULL;
    // never on top of what's already there: the moored boats and your rides; the parked cars
    const van = k.type === VAN, me = this.g.walker; // (your van: longer than a car, and never on top of you)
    const R = k.family === 'boat' ? hull.room + 3.2 : k.family === 'balloon' ? 18 : van ? 5.2 : 4.2;
    const near = (k.family === 'boat' ? ['moored-boats:', 'life-boat:', 'ride-boat:'] : k.family === 'balloon' ? ['balloon:', 'ride-balloon:'] : ['parked-cars:', 'kerb-cars:', 'life-car:', 'ride-car:'])
      .flatMap((p) => this.g.instances(p, x, z, (k.family === 'boat' ? 40 : 20) + R + 2));
    const clear = (px: number, pz: number) => !near.some((q) => Math.hypot(q.x - px, q.z - pz) < R) && (!van || Math.hypot(px - me.x, pz - me.z) > 4.5);
    // the sketch where you can see it (Round 9: "never snap it out of view"), clear of the brush's
    // own bar (a phone's is at the top, or down the side held landscape; a desktop's at the bottom)…
    const touch = document.body.classList.contains('touch'), bar = this.el.getBoundingClientRect(), xr = touch ? 0.72 : 0.75;
    const bx0 = (2 * bar.left) / innerWidth - 1 - 0.1, bx1 = (2 * bar.right) / innerWidth - 1 + 0.1;
    const by0 = 1 - (2 * bar.bottom) / innerHeight - 0.12, by1 = 1 - (2 * bar.top) / innerHeight + 0.12;
    const seen = (px: number, pz: number) => {
      const n = this.g.toNdc(px, 0.6, pz);
      if (n.z >= 1 || Math.abs(n.x) > xr || n.y < -0.7 || n.y > 0.8) return false;
      return !(bar.width > 0 && n.x > bx0 && n.x < bx1 && n.y > by0 && n.y < by1);
    };
    // …and a boat where you can step aboard: footing within its boarding reach (vehicles.ts walkIn)
    const aboard = (px: number, pz: number) => {
      for (let r = Math.min(hull.room + 0.3, 6.5); r <= 6.6; r += 1) for (let a = 0; a < 12; a++) {
        const qx = px + Math.sin((a / 12) * Math.PI * 2) * r, qz = pz + Math.cos((a / 12) * Math.PI * 2) * r;
        if (this.walk.walkable(qx, qz) && this.walk.buildingAt(qx, qz) < 0) return true;
      }
      return false;
    };
    // …in front of what's there, not behind it (Round 9: "the ghost goes missing"): on screen, no
    // nearer boat or car over the heart of it, and no building between you and it…
    const cam = this.g.camera, cp = cam.position.clone().add(this.origin), th = Math.tan((cam.fov * Math.PI) / 360);
    const half = (name: string) => { const t = name.slice(name.indexOf(':') + 1); return (BOAT_TYPES as string[]).includes(t) ? boatDims(t as BoatType).L / 2 : k.family === 'boat' ? 3 : 2.3; };
    const occl = (k.family === 'boat' ? ['moored-boats:', 'life-boat:', 'ride-boat:'] : ['parked-cars:', 'kerb-cars:', 'life-car:', 'ride-car:'])
      .flatMap((p) => this.g.instances(p, (cp.x + x) / 2, (cp.z + z) / 2, Math.hypot(x - cp.x, z - cp.z) / 2 + 45))
      .map((q) => ({ x: q.x, z: q.z, r: half(q.name) * 0.85 }));
    const disc = (px: number, py: number, pz: number, r: number) => {
      const n = this.g.toNdc(px, py, pz), d = Math.max(1, Math.hypot(px - cp.x, py - cp.y, pz - cp.z));
      return { X: n.x * cam.aspect, Y: n.y, R: r / d / th, d, front: n.z < 1 };
    };
    const gR = dims ? dims.L / 2 : 2.3;
    const open = (px: number, pz: number, loose = false) => {
      const G = disc(px, 0.6, pz, gR);
      for (const q of occl) {
        const O = disc(q.x, 0.8, q.z, q.r);
        if (O.front && O.d < G.d - 1 && Math.hypot(O.X - G.X, O.Y - G.Y) < (loose ? O.R * 0.55 : O.R + G.R * 0.4)) return false;
      }
      const dx = px - cp.x, dz = pz - cp.z, L = Math.hypot(dx, dz);
      for (let d = 2; d < L - 3; d += 2.5) if (this.walk.buildingAt(cp.x + (dx / L) * d, cp.z + (dz / L) * d) >= 0) return false;
      return true;
    };
    const w = this.veh.placeWorld, yaw = this.g.walker.yaw;
    const tries = [
      (px: number, pz: number) => clear(px, pz) && seen(px, pz) && open(px, pz) && (k.family !== 'boat' || aboard(px, pz)),
      (px: number, pz: number) => clear(px, pz) && seen(px, pz) && open(px, pz),
      (px: number, pz: number) => clear(px, pz) && seen(px, pz) && open(px, pz, true), // (at worst, only its edge behind something)
      (px: number, pz: number) => clear(px, pz) && seen(px, pz),
    ];
    if (k.family === 'boat') {
      // near and in the clear first; then near with only an edge hidden; then further out
      for (const [free, reach] of [[tries[0], 20], [tries[1], 20], [tries[2], 25], [tries[1], 40], [tries[3], 40]] as const) {
        const p = placeBoat({ ...w, free }, x, z, yaw, reach, 0, hull);
        if (p.ok) return { ok: true, spot: { ...p.spot, yaw: p.spot.yaw + this.turn } };
      }
      // (room for one, just not where you can see it: say where to look, not that there's no water)
      if (placeBoat({ ...w, free: clear }, x, z, yaw, 40, 0, hull).ok) return { ok: false, why: touch ? 'tap the water where you can see it' : 'aim at the water where you can see it' };
      // (where the water is: a long look, so kept while you sweep the same dry ground)
      if (!this.farWhy || Math.hypot(this.farWhy.x - x, this.farWhy.z - z) > 60) {
        const q = placeBoat(w, x, z, yaw, 40, 1500, hull);
        this.farWhy = { x, z, why: q.ok ? 'a boat needs open water' : q.why };
      }
      return { ok: false, why: this.farWhy.why };
    }
    if (k.family === 'balloon') {
      for (const free of [tries[1], tries[2], tries[3]]) {
        const p = placeBalloon({ ...w, free }, x, z, yaw + this.turn, 30);
        if (p.ok) return p;
      }
      if (placeBalloon({ ...w, free: clear }, x, z, yaw, 30).ok) return { ok: false, why: touch ? 'tap open ground where you can see it' : 'aim at open ground where you can see it' };
      return placeBalloon(w, x, z, yaw, 30);
    }
    // a car turned round takes the other lane
    const cy = yaw + (Math.cos(this.turn) < 0 ? Math.PI : 0);
    let c = placeCar({ ...w, free: tries[1] }, x, z, cy, 20);
    if (!c.ok) c = placeCar({ ...w, free: tries[2] }, x, z, cy, 20);
    if (!c.ok) c = placeCar({ ...w, free: tries[3] }, x, z, cy, 20);
    if (!c.ok && placeCar({ ...w, free: clear }, x, z, cy, 20).ok) return { ok: false, why: touch ? 'tap the street where you can see it' : 'aim at the street where you can see it' };
    return c;
  }
  /** Where a kind you haven't painted from life can be found near you. */
  private where(f: Fam) {
    const w = this.g.walker;
    const from = f === 'boat' ? ['moored-boats:', 'life-boat:'] : f === 'balloon' ? ['balloon:'] : ['parked-cars:', 'kerb-cars:', 'life-car:'];
    let best: { x: number; z: number; d: number } | null = null;
    for (const p of from) for (const q of this.g.instances(p, w.x, w.z, f === 'boat' ? 2500 : f === 'balloon' ? 8000 : 600)) {
      const d = Math.hypot(q.x - w.x, q.z - w.z);
      if (!best || d < best.d) best = { x: q.x, z: q.z, d };
    }
    const what = f === 'boat' ? 'boats' : 'cars';
    if (f === 'balloon') {
      if (!best) return 'paint a balloon from life first (P) — they fly at dawn and dusk and come down on beaches';
      return `paint a balloon from life first (P) — one is ${best.d < 950 ? `${Math.round(best.d / 10) * 10} m` : `${(best.d / 1000).toFixed(1)} km`} ${compass(best.x - w.x, best.z - w.z)}`;
    }
    if (!best) return `paint a ${f} from life first (P) — ${f === 'boat' ? 'boats moor at docks and marinas' : 'cars park along streets and driveways'}`;
    const far = best.d < 30 ? 'right here' : `${best.d < 950 ? `${Math.round(best.d / 10) * 10} m` : `${(best.d / 1000).toFixed(1)} km`} ${compass(best.x - w.x, best.z - w.z)}`;
    return `paint a ${f} from life first (P) — ${f === 'boat' ? 'moored' : 'parked'} ${what} ${far}`;
  }

  // ---------------- the sketch and the wash ----------------
  private dropGhost() {
    if (!this.ghost) return;
    this.root.remove(this.ghost.obj);
    this.ghost.obj.traverse((m) => (m as THREE.Mesh).geometry?.dispose?.());
    this.ghost = null;
  }
  private sketch(k: Kind) {
    const c = this.color(k), key = `${k.family}:${k.type}:${c}:${this.colors(k)?.join(',') ?? ''}`;
    if (this.ghost?.key === key) return this.ghost;
    this.dropGhost();
    const b = k.type === VAN ? { obj: new THREE.Group().add(new THREE.Mesh(camperPicture(camperRecipe(1)), this.mat)) } : this.veh.build(k.family, k.type, c, this.veh.nextSeed, this.mat, this.colors(k));
    b.obj.traverse((m) => m.layers.enable(1));
    b.obj.visible = false;
    this.root.add(b.obj);
    return (this.ghost = { key, obj: b.obj, spot: null, shown: null });
  }
  private pose(obj: THREE.Object3D, family: Fam, x: number, z: number, yaw: number) {
    obj.position.set(x, family === 'boat' ? 0 : this.walk.surfaceAt(x, z), z);
    obj.rotation.set(0, yaw, 0, 'YXZ');
  }
  private hitsGhost(nx: number, ny: number) {
    if (!this.ghost?.spot || !this.ghost.obj.visible) return null;
    this.ray.setFromCamera(new THREE.Vector2(nx, ny), this.g.camera);
    const h = this.ray.intersectObject(this.ghost.obj, true)[0];
    return h ? h.point.clone().add(this.origin) : null;
  }
  /** Start the wash where the brush touches the sketch (the screen point (nx, ny)). */
  private start(nx: number, ny: number, mustHit = false) {
    const k = this.cur, gh = this.ghost;
    if (this.washing || this.drying || !k?.type || !gh?.spot || !gh.obj.visible) return;
    const hit = this.hitsGhost(nx, ny);
    if (!hit && mustHit) return;
    const box = new THREE.Box3().setFromObject(gh.obj);
    box.min.add(this.origin);
    box.max.add(this.origin);
    const at = hit ?? box.getCenter(new THREE.Vector3());
    let max = 0;
    for (let i = 0; i < 8; i++) max = Math.max(max, at.distanceTo(new THREE.Vector3(i & 1 ? box.max.x : box.min.x, i & 2 ? box.max.y : box.min.y, i & 4 ? box.max.z : box.min.z)));
    const s = gh.shown ?? gh.spot;
    this.washing = { r: 0, max: max + 0.9, rub: 0, rate: 0, at, kind: k, spot: { ...gh.spot, x: s.x, z: s.z, yaw: s.yaw }, color: this.color(k), colors: this.colors(k) };
    this.g.sound('brush');
  }
  /** The wash has covered it: it's real now (the sketch pass fades off it as it dries). */
  private dry() {
    const w = this.washing!;
    this.washing = null;
    const made = w.kind.type === VAN && this.van ? { ...this.van.place(w.spot), model: VAN } : this.veh.paint(w.kind.family, w.kind.type, w.spot, w.color, w.colors);
    const key = `${w.kind.family}:${w.kind.type}`;
    this.saved.recent = [key, ...this.saved.recent.filter((r) => r !== key)].slice(0, 12);
    this.saved.used = true;
    this.save();
    const boat = w.kind.family === 'boat';
    this.g.sound('chime');
    // (the bar goes as it dries: nothing between you and it)
    this.el.classList.remove('on');
    this.dot.classList.remove('on');
    document.body.classList.remove('brushing');
    this.g.walker.holdLook = false;
    this.held = false;
    const near = Math.hypot(made.x - this.g.walker.x, made.z - this.g.walker.z) < 12;
    const name = modelName(made.model);
    this.drying = {
      t: 0, x: made.x, z: made.z, boat, obj: made.obj, splash: false,
      toast: made.model === VAN ? 'your van, here — its back doors open as you come to them' : boat ? `your ${name} — walk out to it to go aboard` : `your ${name} — ${document.body.classList.contains('nomouse') ? (near ? `tap ${w.kind.family === 'balloon' ? 'Step in' : 'Drive'} to get in` : `walk over, then tap ${w.kind.family === 'balloon' ? 'Step in' : 'Drive'}`) : near ? 'E to get in' : 'walk over, then E'}`,
    };
  }

  // ---------------- per frame ----------------
  update(dt: number) {
    if (!this.active) return;
    if (!this.enabled()) return this.toggle(false);
    this.root.position.copy(this.world.position); // (the floating origin: the sketch's hit tests)
    this.mat.uniforms.uExposure.value = postParams.exposure;
    const D = this.drying;
    if (D) {
      // drying: the wet colour lightens into the real thing and the sketch lifts off it; a ring runs
      // out over the water and the view leans in, then eases back
      D.t += dt;
      const k = Math.min(1, D.t / DRY_S), sm = (a: number, b: number, x: number) => { const t = Math.max(0, Math.min(1, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
      this.mat.uniforms.uWash.value.set(k, 1 - sm(0.25, 1, k), 0, 0);
      U.uGhost.value.y = 1 - sm(0, 0.6, k);
      U.uGhost.value.z = 1 - sm(0, 0.5, k);
      this.pale = 1 - sm(0.2, 1, D.t / FX_S);
      U.uBrush.value.w = this.pale;
      // (the wet sketch rides the real thing down as it settles)
      if (this.ghost) { this.ghost.obj.position.copy(D.obj.position); this.ghost.obj.quaternion.copy(D.obj.quaternion); }
      if (D.boat && D.t > 0.3) {
        if (!D.splash) { D.splash = true; this.g.sound('settle'); }
        const f = Math.min(1, (D.t - 0.3) / (FX_S - 0.3));
        U.uRipple.value.set(D.x, D.z, 1.5 + 8 * (1 - (1 - f) * (1 - f)), Math.pow(1 - f, 1.3));
      }
      this.g.walker.zoom = 6 * (D.t < 0.45 ? 1 - Math.pow(1 - D.t / 0.45, 3) : 1 - sm(0.45, FX_S, D.t));
      if (D.t > 0.55 && D.toast) { this.g.toast(D.toast); D.toast = ''; }
      if (D.t >= FX_S) this.toggle(false);
      return;
    }
    let k = this.cur;
    const W = this.washing;
    if (W) {
      // rubbing hurries the wash: up to three times the pace
      W.rate += (Math.min(2, W.rub / Math.max(dt, 1e-3) / 900) - W.rate) * Math.min(1, dt * 8);
      W.rub = 0;
      if (W.rate > 0.25 && (this.soundT -= dt) <= 0) { this.soundT = 0.38; this.g.sound('brush'); } // (the bristles on the paper while you rub)
      W.r += (dt * W.max * (1 + W.rate)) / WASH_S;
      this.mat.uniforms.uWashAt.value.set(W.at.x, W.at.y, W.at.z, W.r);
      U.uGhost.value.y = 1;
      U.uGhost.value.z = 1;
      if (W.r >= W.max) this.dry();
      else this.statusEl.textContent = document.body.classList.contains('touch') ? 'rub it to hurry the colour' : 'hold and rub to hurry the colour';
      return;
    }
    // aim: the centre of the view (locked mouse), under the cursor (unlocked), or where you tapped
    if ((this.solveT -= dt) <= 0) {
      this.solveT = 0.12;
      const touch = document.body.classList.contains('touch');
      let hit: { x: number; z: number } | null = null;
      if (touch) hit = this.tap ?? this.cast(0, -0.2);
      else if (!this.g.walker.locked && this.mouse) hit = this.cast((this.mouse.x / innerWidth) * 2 - 1, -(this.mouse.y / innerHeight) * 2 + 1);
      else hit = this.cast(0, 0);
      this.aim = hit ? { x: hit.x, z: hit.z, site: this.site(hit.x, hit.z) } : null;
      // the chips follow the site: the water shows your boats, a street your cars
      if (this.aim) this.setView(FITS[this.aim.site]);
      const kk = this.cur;
      if (!kk) { this.why = 'nothing to paint'; this.dropGhost(); }
      else if (!kk.type) {
        this.dropGhost();
        if ((this.whereT -= 0.12) <= 0) { this.whereT = 2; this.why = this.where(kk.family); }
      } else if (!this.aim) {
        this.why = touch ? 'tap the ground or the water where it should go' : 'aim at the ground or the water';
        if (this.ghost) this.ghost.obj.visible = false;
      } else {
        const gh = this.sketch(kk);
        const moved = Math.hypot(this.aim.x - this.lastSolve.x, this.aim.z - this.lastSolve.z) > 1.2 || this.lastSolve.key !== gh.key || this.lastSolve.turn !== this.turn || !gh.spot;
        if (moved) {
          this.lastSolve = { x: this.aim.x, z: this.aim.z, key: gh.key, turn: this.turn };
          const p = this.solve(kk, this.aim.x, this.aim.z);
          gh.spot = p.ok ? p.spot : null;
          this.why = p.ok ? '' : p.why;
        }
        gh.obj.visible = !!gh.spot;
      }
    }
    // the sketch glides to its spot
    const gh = this.ghost;
    k = this.cur;
    if (gh?.spot && k?.type) {
      const s = gh.spot;
      if (!gh.shown || Math.hypot(gh.shown.x - s.x, gh.shown.z - s.z) > 40) gh.shown = { x: s.x, z: s.z, yaw: s.yaw };
      const a = Math.min(1, dt * 12);
      gh.shown.x += (s.x - gh.shown.x) * a;
      gh.shown.z += (s.z - gh.shown.z) * a;
      gh.shown.yaw += Math.atan2(Math.sin(s.yaw - gh.shown.yaw), Math.cos(s.yaw - gh.shown.yaw)) * a;
      this.pose(gh.obj, k.family, gh.shown.x, gh.shown.z, gh.shown.yaw);
      this.mat.uniforms.uWashAt.value.set(0, 0, 0, -1);
      this.mat.uniforms.uWash.value.set(0, 1, 0, 0);
      U.uBrush.value.set(gh.shown.x, gh.shown.z, k.family === 'boat' ? 18 : 12, U.uBrush.value.w);
    }
    // the world pales round a sketch that's showing
    this.pale += ((gh?.spot && gh.obj.visible ? 1 : 0) - this.pale) * Math.min(1, dt * 5);
    U.uBrush.value.w = this.pale;
    U.uGhost.value.y = 1;
    U.uGhost.value.z = 0;
    const touch = document.body.classList.contains('touch');
    this.statusEl.textContent = gh?.spot && gh.obj.visible && k?.type
      ? touch ? 'tap the sketch to paint it in' : 'click to paint it in'
      : this.why;
  }

  /** What the sketch pass draws this frame (null: nothing — post.ts skips the pass). */
  get overlay(): THREE.Scene | null {
    if (!(this.active && this.ghost?.obj.visible && (this.ghost.spot || this.drying))) return null;
    this.root.position.copy(this.world.position); // (the floating origin, as of this frame)
    return this.scene;
  }

  // ---------------- hints (at most two, ever: paint something from life; then your brush) ----------------
  hint(): Hint | null {
    if (this.active || this.veh.driving) return null;
    if ((this.hintT -= 0.2) <= 0) {
      this.hintT = 1;
      this.hintNear = null;
      const owned = this.com.owned(PAINTABLE);
      if (owned.length) this.hintNear = this.saved.used ? null : `B|your brush — paint a ${modelName(owned[0].type)} where you aim`;
      else {
        // nothing painted from life yet: the nearest boat or car in view
        const w = this.g.walker;
        for (const [p, f] of [['moored-boats:', 'boat'], ['parked-cars:', 'car'], ['kerb-cars:', 'car']] as const) {
          const q = this.g.instances(p, w.x, w.z, 40).find((i) => { const n = this.g.toNdc(i.x, i.y + 0.8, i.z); return n.z < 1 && Math.abs(n.x) < 0.6 && Math.abs(n.y) < 0.7; });
          if (q) { this.hintNear = `P|paint that ${f} from life — then you can paint one anywhere`; break; }
        }
      }
    }
    if (!this.hintNear) return null;
    const [k, text] = this.hintNear.split('|');
    const key = document.body.classList.contains('nomouse') ? (k === 'B' ? 'Brush' : 'Paint') : k; // (a phone names its buttons)
    return k === 'B' ? { key, text, pri: 4, once: 'brush' } : { key, text, pri: 5, once: 'fromlife' };
  }

  /** For the harness: drive the brush without a mouse (tools, the hidden browser pane). */
  private hook() {
    (window as unknown as Record<string, unknown>).__BRUSH__ = {
      open: () => { this.toggle(true); return this.active; },
      close: () => this.toggle(false),
      aim: (x: number, z: number) => { this.tap = { x, z }; this.solveT = 0; },
      choose: (family: string, type: string) => { const i = this.view.findIndex((j) => this.kinds[j].family === family && this.kinds[j].type === type); if (i >= 0) this.choose(i); return i >= 0; },
      paint: () => { const gh = this.ghost; if (!gh?.spot) return false; const tap = this.tap; this.start(0, 0); this.tap = tap; return !!this.washing; },
      state: () => ({ active: this.active, kinds: this.view.map((i) => `${this.kinds[i].family}:${this.kinds[i].type}`), pick: this.pick, why: this.why, aim: this.aim, spot: this.ghost?.spot ?? null, washing: this.washing ? { r: this.washing.r, max: this.washing.max } : null, drying: this.drying ? +this.drying.t.toFixed(2) : null }),
    };
  }
}
