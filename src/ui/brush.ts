// The brush (docs/GAME_DESIGN.md §4b, §5): paint anything you've painted from life, anywhere you aim.
//
// B takes it out. The chips along the bottom are the kinds whose Almanac cards you've coloured in
// (painted with P); the one that fits what you're aiming at comes first (water: a boat; a street:
// a car). A pencil sketch of it snaps to the nearest spot that fits (player/place.ts) — you aim,
// you never draw on the world. Click (on a phone: tap the sketch) and the colour washes in from
// where you touched it; rub to hurry it. When it dries it's real (vehicles.ts paint()) and it
// stays where you painted it. A kind you haven't painted from life shows as a pencil chip that
// says where to find one.
import * as THREE from 'three';
import type { GameCtx } from './ctx';
import type { Hint } from './hints';
import type { Commissions } from './commissions';
import { modelName, type Vehicles } from '../player/vehicles';
import type { WalkWorld } from '../player/collision';
import { propMaterial } from '../render/propMaterial';
import { placeBoat, placeCar, openWater, compass, type Placement, type Spot } from '../player/place';

/** The families the brush can paint. (Planes join once airfields have planes to paint from life.) */
export const PAINTABLE = ['boat', 'car'] as const;
type Fam = (typeof PAINTABLE)[number];
/** A chip: a kind you own, or (type '') a family you haven't painted from life yet. */
interface Kind { family: Fam; type: string }
type Site = 'water' | 'street' | 'ground';

const SWATCHES: Record<Fam, number[]> = {
  boat: [0xf4f1ea, 0x2d4a6a, 0x9b3b32, 0xd9e4ea, 0x3d5a46, 0xd8a03a],
  car: [0xf2f2ee, 0x26282c, 0x9c2a26, 0x2b3f63, 0x3d5a46, 0xcdbf9e],
};
const SAMPLE: Record<Fam, string> = { boat: 'skiff', car: 'sedan' }; // a pencil chip's picture
const FITS: Record<Site, Fam | null> = { water: 'boat', street: 'car', ground: null };
const RANGE = 160; // how far the brush reaches (m)
const WASH_S = 1.7; // an unhurried wash, seconds
const STORE = 'map-game.brush.v1';
interface Saved { recent: string[]; colors: Record<string, number>; used?: boolean }

const CSS = `
#brush { position: fixed; left: 50%; bottom: calc(32px + env(safe-area-inset-bottom)); /* (above the map credit: it stays readable) */ transform: translateX(-50%); z-index: 21; display: none; flex-direction: column; align-items: center; gap: 6px; pointer-events: none; color: #3a3346; font-family: Georgia, serif; }
#brush.on { display: flex; }
#brush .row { display: flex; gap: 6px; align-items: center; pointer-events: auto; background: rgba(245,239,225,0.88); border: 1px solid rgba(58,51,70,0.2); border-radius: 6px; padding: 6px 8px; max-width: 94vw; overflow-x: auto; box-shadow: 0 2px 14px rgba(40,30,60,0.12); }
#brush .chip { display: flex; flex-direction: column; align-items: center; gap: 2px; background: none; border: 1px solid transparent; border-radius: 4px; padding: 3px 4px; font: inherit; font-size: 12px; color: inherit; cursor: pointer; min-width: 66px; }
#brush .chip img { width: 64px; height: 44px; object-fit: cover; border-radius: 2px; }
#brush .chip.sel { border-color: rgba(58,51,70,0.55); background: rgba(255,255,255,0.4); }
#brush .chip.pencil { font-style: italic; opacity: 0.72; }
#brush .sws { display: flex; gap: 6px; padding: 0 6px; border-left: 1px solid rgba(58,51,70,0.15); }
#brush .sw { width: 22px; height: 22px; border-radius: 50%; border: 1.5px solid rgba(58,51,70,0.35); cursor: pointer; padding: 0; }
#brush .sw.sel { box-shadow: 0 0 0 2px rgba(245,239,225,0.95), 0 0 0 3.5px #3a3346; }
#brush .x { font: inherit; font-size: 18px; border: none; background: none; cursor: pointer; color: inherit; padding: 4px 8px; }
#brush .status { background: rgba(245,239,225,0.9); border: 1px solid rgba(58,51,70,0.15); border-radius: 12px; padding: 4px 14px; font-size: 14px; font-style: italic; white-space: nowrap; max-width: 92vw; overflow: hidden; text-overflow: ellipsis; }
#brush-dot { position: fixed; left: 50%; top: 50%; width: 12px; height: 12px; margin: -6px 0 0 -6px; border: 1.5px solid rgba(58,51,70,0.65); border-radius: 50%; display: none; pointer-events: none; z-index: 20; }
#brush-dot.on { display: block; }
body.touch #brush-dot, body.postcard #brush, body.postcard #brush-dot { display: none !important; }
body.brushing #hud { display: none; }
/* a phone: the bar keeps clear of the button column on the right, and the words wrap */
body.touch #brush { left: 8px; right: 76px; bottom: calc(44px + env(safe-area-inset-bottom)); transform: none; align-items: stretch; }
body.touch #brush .status { white-space: normal; text-align: center; }
@media (max-width: 640px) { #brush .chip { min-width: 54px; } #brush .chip img { width: 52px; height: 36px; } #brush .status { font-size: 13px; } }
`;

export class Brush {
  active = false;
  private kinds: Kind[] = [];
  private pick = 0;
  private picked = false; // chosen by hand: stop following the site
  private turn = 0; // R: a quarter-turn at a time for boats; a car turns to the other lane
  private saved: Saved = { recent: [], colors: {} };
  private ghost: { key: string; obj: THREE.Group; spot: Spot | null; shown: { x: number; z: number; yaw: number } | null } | null = null;
  private mat = propMaterial({ wash: true });
  private washing: { r: number; max: number; rub: number; rate: number; at: THREE.Vector3; kind: Kind; spot: Spot; color: number } | null = null;
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
    world: THREE.Object3D,
    private origin: THREE.Vector3, // the render origin (main.ts reanchor): render = world − origin
    private enabled: () => boolean, // false in menus, photo mode, a ride
  ) {
    this.root.name = 'brush';
    world.add(this.root);
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
    tb.textContent = '✎';
    tb.onclick = () => { if (this.active || this.enabled()) this.toggle(); };
    (document.getElementById('tphoto') ?? document.getElementById('touchui'))?.after?.(tb);

    window.addEventListener('keydown', (e) => {
      if ((e.target as HTMLElement)?.closest?.('input,textarea,.lil-gui')) return;
      if (e.code === 'KeyB' && !e.shiftKey && !e.repeat && (this.active || this.enabled())) return this.toggle();
      if (!this.active) return;
      if (e.code === 'Escape') this.toggle(false);
      else if (/^Digit[1-9]$/.test(e.code)) this.choose(+e.code.slice(5) - 1);
      else if (e.code === 'KeyR' && !e.repeat) this.turn += (e.shiftKey ? -1 : 1) * (Math.PI / 4);
      else if (e.code === 'KeyC' && !e.repeat) this.cycleColor();
    });
    window.addEventListener('wheel', (e) => {
      if (!this.active || (e.target as HTMLElement)?.closest?.('.lil-gui,#brush')) return;
      e.stopImmediatePropagation();
      if (this.kinds.length) this.choose((this.pick + (e.deltaY > 0 ? 1 : -1) + this.kinds.length) % this.kinds.length);
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
    const owned = this.com.owned(PAINTABLE) as Kind[];
    const rank = (k: Kind) => { const i = this.saved.recent.indexOf(`${k.family}:${k.type}`); return i < 0 ? 1e3 : i; };
    owned.sort((a, b) => rank(a) - rank(b)); // (a stable sort: newest-painted order otherwise)
    this.kinds = [...owned];
    for (const f of PAINTABLE) if (!owned.some((k) => k.family === f)) this.kinds.push({ family: f, type: '' });
    this.pick = Math.min(this.pick, this.kinds.length - 1);
    this.build();
  }
  private build() {
    this.rowEl.replaceChildren();
    this.kinds.forEach((k, i) => {
      const b = document.createElement('button');
      b.className = `chip${i === this.pick ? ' sel' : ''}${k.type ? '' : ' pencil'}`;
      const img = document.createElement('img');
      img.alt = '';
      try { img.src = this.g.cardArt(k.family, k.type || SAMPLE[k.family], !k.type); } catch { /* no art: the name will do */ }
      const s = document.createElement('span');
      s.textContent = k.type ? modelName(k.type) : `a ${k.family}?`;
      b.append(img, s);
      b.onclick = () => this.choose(i);
      this.rowEl.appendChild(b);
    });
    const k = this.kinds[this.pick];
    if (k?.type) {
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
      this.rowEl.appendChild(sws);
    }
    const x = document.createElement('button');
    x.className = 'x';
    x.textContent = '✕';
    x.title = 'put the brush away';
    x.onclick = () => this.toggle(false);
    this.rowEl.appendChild(x);
  }
  private choose(i: number, byHand = true) {
    if (i < 0 || i >= this.kinds.length || this.washing) return;
    if (byHand) this.picked = true;
    if (i === this.pick) return;
    this.pick = i;
    this.whereT = 0;
    this.build();
  }
  private color(k: Kind) { return this.saved.colors[`${k.family}:${k.type}`] ?? this.veh.defaultColor(k.family, this.veh.nextSeed); }
  private setColor(k: Kind, c: number) {
    this.saved.colors[`${k.family}:${k.type}`] = c;
    this.save();
    this.build();
  }
  private cycleColor() {
    const k = this.kinds[this.pick];
    if (!k?.type || this.washing) return;
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
    this.touches.clear();
    if (on) {
      this.picked = false;
      this.turn = 0;
      this.pick = 0; // (your last painted kind: then the site picks)
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
    // never on top of what's already there: the moored boats and your rides; the parked cars
    const R = k.family === 'boat' ? 6.5 : 4.2;
    const near = (k.family === 'boat' ? ['moored-boats:', 'life-boat:', 'ride-boat:'] : ['parked-cars:', 'kerb-cars:', 'life-car:', 'ride-car:'])
      .flatMap((p) => this.g.instances(p, x, z, (k.family === 'boat' ? 40 : 20) + R + 2));
    const w = { ...this.veh.placeWorld, free: (px: number, pz: number) => !near.some((q) => Math.hypot(q.x - px, q.z - pz) < R) };
    const yaw = this.g.walker.yaw;
    if (k.family === 'boat') {
      const p = placeBoat(w, x, z, yaw, 40, 0);
      if (p.ok) return { ok: true, spot: { ...p.spot, yaw: p.spot.yaw + this.turn } };
      // (where the water is: a long look, so kept while you sweep the same dry ground)
      if (!this.farWhy || Math.hypot(this.farWhy.x - x, this.farWhy.z - z) > 60) {
        const q = placeBoat(w, x, z, yaw, 40);
        this.farWhy = { x, z, why: q.ok ? 'a boat needs open water' : q.why };
      }
      return { ok: false, why: this.farWhy.why };
    }
    // a car turned round takes the other lane
    return placeCar(w, x, z, yaw + (Math.cos(this.turn) < 0 ? Math.PI : 0), 20);
  }
  /** Where a kind you haven't painted from life can be found near you. */
  private where(f: Fam) {
    const w = this.g.walker;
    const from = f === 'boat' ? ['moored-boats:', 'life-boat:'] : ['parked-cars:', 'kerb-cars:', 'life-car:'];
    let best: { x: number; z: number; d: number } | null = null;
    for (const p of from) for (const q of this.g.instances(p, w.x, w.z, f === 'boat' ? 2500 : 600)) {
      const d = Math.hypot(q.x - w.x, q.z - w.z);
      if (!best || d < best.d) best = { x: q.x, z: q.z, d };
    }
    const what = f === 'boat' ? 'boats' : 'cars';
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
    const c = this.color(k), key = `${k.family}:${k.type}:${c}`;
    if (this.ghost?.key === key) return this.ghost;
    this.dropGhost();
    const b = this.veh.build(k.family, k.type, c, this.veh.nextSeed, this.mat);
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
    const k = this.kinds[this.pick], gh = this.ghost;
    if (this.washing || !k?.type || !gh?.spot || !gh.obj.visible) return;
    const hit = this.hitsGhost(nx, ny);
    if (!hit && mustHit) return;
    const box = new THREE.Box3().setFromObject(gh.obj);
    box.min.add(this.origin);
    box.max.add(this.origin);
    const at = hit ?? box.getCenter(new THREE.Vector3());
    let max = 0;
    for (let i = 0; i < 8; i++) max = Math.max(max, at.distanceTo(new THREE.Vector3(i & 1 ? box.max.x : box.min.x, i & 2 ? box.max.y : box.min.y, i & 4 ? box.max.z : box.min.z)));
    const s = gh.shown ?? gh.spot;
    this.washing = { r: 0, max: max + 0.9, rub: 0, rate: 0, at, kind: k, spot: { ...gh.spot, x: s.x, z: s.z, yaw: s.yaw }, color: this.color(k) };
    this.g.sound('brush');
  }
  private dry() {
    const w = this.washing!;
    this.washing = null;
    const made = this.veh.paint(w.kind.family, w.kind.type, w.spot, w.color);
    const key = `${w.kind.family}:${w.kind.type}`;
    this.saved.recent = [key, ...this.saved.recent.filter((r) => r !== key)].slice(0, 12);
    this.saved.used = true;
    this.save();
    this.g.sound('chime');
    const near = Math.hypot(made.x - this.g.walker.x, made.z - this.g.walker.z) < 12;
    this.g.toast(`your ${modelName(made.model)} is real${near ? ` — E to ${w.kind.family === 'boat' ? 'go aboard' : 'get in'}` : ' — walk over, then E'}`);
    this.toggle(false);
  }

  // ---------------- per frame ----------------
  update(dt: number) {
    if (!this.active) return;
    if (!this.enabled()) return this.toggle(false);
    let k = this.kinds[this.pick];
    const W = this.washing;
    if (W) {
      // rubbing hurries the wash: up to three times the pace
      W.rate += (Math.min(2, W.rub / Math.max(dt, 1e-3) / 900) - W.rate) * Math.min(1, dt * 8);
      W.rub = 0;
      W.r += (dt * W.max * (1 + W.rate)) / WASH_S;
      this.mat.uniforms.uWashAt.value.set(W.at.x, W.at.y, W.at.z, W.r);
      if (W.r >= W.max) this.dry();
      else this.statusEl.textContent = this.g.walker.locked || !document.body.classList.contains('touch') ? 'the colour is going in — hold and rub to hurry it' : 'the colour is going in — rub it to hurry it';
      return;
    }
    // aim: the centre of the view (locked mouse), under the cursor (unlocked), or where you tapped
    if ((this.solveT -= dt) <= 0) {
      this.solveT = 0.12;
      const touch = document.body.classList.contains('touch');
      let hit: { x: number; z: number } | null = null;
      if (touch) hit = this.tap ?? this.cast(0, -0.1);
      else if (!this.g.walker.locked && this.mouse) hit = this.cast((this.mouse.x / innerWidth) * 2 - 1, -(this.mouse.y / innerHeight) * 2 + 1);
      else hit = this.cast(0, 0);
      this.aim = hit ? { x: hit.x, z: hit.z, site: this.site(hit.x, hit.z) } : null;
      // follow the site until you choose by hand: the water picks a boat, a street a car
      if (this.aim && !this.picked) {
        const fam = FITS[this.aim.site];
        const cur = this.kinds[this.pick];
        if (fam && cur?.family !== fam) {
          const i = this.kinds.findIndex((q) => q.family === fam);
          if (i >= 0) this.choose(i, false);
        }
      }
      const kk = this.kinds[this.pick];
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
    k = this.kinds[this.pick];
    if (gh?.spot && k?.type) {
      const s = gh.spot;
      if (!gh.shown || Math.hypot(gh.shown.x - s.x, gh.shown.z - s.z) > 40) gh.shown = { x: s.x, z: s.z, yaw: s.yaw };
      const a = Math.min(1, dt * 12);
      gh.shown.x += (s.x - gh.shown.x) * a;
      gh.shown.z += (s.z - gh.shown.z) * a;
      gh.shown.yaw += Math.atan2(Math.sin(s.yaw - gh.shown.yaw), Math.cos(s.yaw - gh.shown.yaw)) * a;
      this.pose(gh.obj, k.family, gh.shown.x, gh.shown.z, gh.shown.yaw);
      this.mat.uniforms.uWashAt.value.set(0, 0, 0, -1);
    }
    const touch = document.body.classList.contains('touch');
    this.statusEl.textContent = gh?.spot && gh.obj.visible && k?.type
      ? touch ? `tap the sketch to paint your ${modelName(k.type)} in · tap elsewhere to move it` : `click to paint your ${modelName(k.type)} in · R turn · C colour · wheel: another · right-click: put away`
      : this.why;
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
    const [key, text] = this.hintNear.split('|');
    return key === 'B' ? { key, text, pri: 4, once: 'brush' } : { key, text, pri: 5, once: 'fromlife' };
  }

  /** For the harness: drive the brush without a mouse (tools, the hidden browser pane). */
  private hook() {
    (window as unknown as Record<string, unknown>).__BRUSH__ = {
      open: () => { this.toggle(true); return this.active; },
      close: () => this.toggle(false),
      aim: (x: number, z: number) => { this.tap = { x, z }; this.solveT = 0; },
      choose: (family: string, type: string) => { const i = this.kinds.findIndex((k) => k.family === family && k.type === type); if (i >= 0) this.choose(i); return i >= 0; },
      paint: () => { const gh = this.ghost; if (!gh?.spot) return false; const tap = this.tap; this.start(0, 0); this.tap = tap; return !!this.washing; },
      state: () => ({ active: this.active, kinds: this.kinds.map((k) => `${k.family}:${k.type}`), pick: this.pick, why: this.why, aim: this.aim, spot: this.ghost?.spot ?? null, washing: this.washing ? { r: this.washing.r, max: this.washing.max } : null }),
    };
  }
}
