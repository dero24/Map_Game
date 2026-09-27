// Commissions + the spotting log — the sketchbook's gentle goals, generated from what's really here.
// Commission subjects come from the real world around you (named buildings: churches, lighthouses, shops;
// baked POIs; the boat types moored at the piers) plus scenes the place can offer (the sea at golden
// hour, the shore in fog, a street under the lamps). No per-town lists: anywhere with named buildings
// or a coastline produces its own. Everything is deterministic per subject (ids hash position/name).
import type { GameCtx } from './ctx';
import { loadState, saveState, type BookState } from './book';
import { CAR_TYPES, BOAT_TYPES, PLANE_TYPES } from '../assets/kit';
import { modelName } from '../player/vehicles';

type Active = BookState['active'][number];
const ACTIVE = 3;
const FAMILY: Record<string, { label: string; all: string[] }> = {
  car: { label: 'car', all: CAR_TYPES },
  boat: { label: 'boat', all: BOAT_TYPES },
  plane: { label: 'plane', all: PLANE_TYPES },
};
const art = (s: string) => (/^[aeiou]/i.test(s) || /^SUV/.test(s) ? 'an' : 'a');
const hash = (s: string) => { let h = 2166136261; for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619); return (h >>> 0) / 4294967296; };

export class Commissions {
  state: BookState = { done: [], active: [], spotted: {} };
  private dirty = false;
  private genT = 2;
  private spotT = 1;
  private nearT = 0;
  private lastNear = '';
  onChange: (() => void) | null = null;

  constructor(private g: GameCtx) {}
  async load() {
    this.state = await loadState();
    const doneT = new Set(this.state.done.map((d) => d.title.replace(/ at golden hour$/, '').toLowerCase()));
    this.state.active = this.state.active.filter((a) => !doneT.has(a.title.replace(/ at golden hour$/, '').toLowerCase()));
    this.onChange?.();
  }
  private save() { this.dirty = true; }

  update(dt: number) {
    if ((this.genT -= dt) <= 0) { this.genT = 8; this.generate(); }
    if ((this.spotT -= dt) <= 0) { this.spotT = 0.5; this.spot(); }
    if ((this.nearT -= dt) <= 0) { this.nearT = 1; this.nudge(); }
    if (this.dirty) { this.dirty = false; void saveState(this.state); this.onChange?.(); }
  }

  // ---------------- offers ----------------
  private generate() {
    const s = this.state;
    const w = this.g.walker;
    // drop offers that are now very far away (you moved on — new ones come from where you are)
    const before = s.active.length;
    s.active = s.active.filter((a) => a.lat === undefined || this.dist(a) < 6000);
    if (s.active.length >= ACTIVE && s.active.length === before) return;
    // the same place can arrive as a named building and as a POI — one subject, one commission
    const subj = (t: string) => t.replace(/ at golden hour$/, '').toLowerCase();
    const done = new Set([...s.done.map((d) => d.id), ...s.done.map((d) => subj(d.title))]);
    const have = new Set([...s.active.map((a) => a.id), ...s.active.map((a) => subj(a.title))]);
    const cands: (Active & { d: number })[] = [];
    const add = (c: Active, d: number) => {
      if (done.has(c.id) || have.has(c.id) || done.has(subj(c.title)) || have.has(subj(c.title))) return;
      have.add(subj(c.title));
      cands.push({ ...c, d });
    };
    const ll = (x: number, z: number) => this.g.toLatLon(x, z);
    // named buildings: churches and lighthouses first, then shops/landmarks
    for (const f of this.g.footprints()) {
      if (!f.name) continue;
      let cx = 0, cz = 0;
      for (const [x, z] of f.ring) { cx += x; cz += z; }
      cx /= f.ring.length; cz /= f.ring.length;
      const d = Math.hypot(cx - w.x, cz - w.z);
      if (d > 1500) continue;
      const [lat, lon] = ll(cx, cz);
      const id = `b:${f.name}:${lat.toFixed(4)}:${lon.toFixed(4)}`;
      const golden = hash(id) < 0.35;
      const weight = f.kind === 'church' || f.kind === 'lighthouse' ? 0.4 : f.kind === 'commercial' ? 1 : 1.3;
      add({ id, title: `Paint ${f.name}${golden ? ' at golden hour' : ''}`, hint: golden ? 'when the light turns gold' : 'frame it and press Space', kind: 'poi', lat, lon, y: (f.base + f.top) / 2, cond: golden ? 'golden' : undefined }, d * weight);
    }
    for (const p of this.g.json.pois ?? []) {
      const d = Math.hypot(p.x - w.x, p.z - w.z);
      if (d > 1500 || !p.name) continue;
      const [lat, lon] = ll(p.x, p.z);
      add({ id: `p:${p.name}:${lat.toFixed(4)}`, title: `Paint ${p.name}`, hint: 'frame it and press Space', kind: 'poi', lat, lon, y: this.g.terrain.heightAt(p.x, p.z) + 3 }, d * 1.1);
    }
    for (const b of this.g.instances('moored-boats:', w.x, w.z, 1500)) {
      const type = b.name.split(':')[1];
      const [lat, lon] = ll(b.x, b.z);
      const id = `k:boat:${type}:${Math.round(lat * 200)}:${Math.round(lon * 200)}`;
      add({ id, title: `Paint ${art(modelName(type))} ${modelName(type)} at its mooring`, hint: 'down at the piers', kind: 'kit', type: `moored-boats:${type}`, lat, lon }, Math.hypot(b.x - w.x, b.z - w.z) * 1.4 + 200);
    }
    const env = this.g.env();
    const [wl, wn] = ll(w.x, w.z);
    const cell = `${Math.round(wl * 50)}:${Math.round(wn * 50)}`; // ~2 km scenes: one of each per area
    if (env.oceanDist < 1500) {
      add({ id: `s:sea-gold:${cell}`, title: 'Paint the sea at golden hour', hint: 'face the water near sunset', kind: 'scene', cond: 'golden,sea' }, 700);
      add({ id: `s:sea-fog:${cell}`, title: 'Paint the shore in sea fog', hint: 'wait for the fog to roll in (T skips an hour)', kind: 'scene', cond: 'fog,sea' }, 1400);
      add({ id: `s:sunrise:${cell}`, title: 'Paint a sunrise over the water', hint: 'early morning, facing the sea', kind: 'scene', cond: 'morning,sea' }, 1100);
    }
    add({ id: `s:lamps:${cell}`, title: 'Paint a street under the lamps', hint: 'after dark', kind: 'scene', cond: 'night,street' }, 900);
    add({ id: `s:roofs:${cell}`, title: 'Paint the rooftops from above', hint: 'F to fly up', kind: 'scene', cond: 'high' }, 1000);
    cands.sort((a, b) => a.d - b.d || a.id.localeCompare(b.id));
    let added = 0;
    while (s.active.length < ACTIVE && cands.length) {
      // mix it up: at most two scenes on the board at once
      const i = cands.findIndex((c) => c.kind !== 'scene' || s.active.filter((a) => a.kind === 'scene').length < 2);
      if (i < 0) break;
      const [c] = cands.splice(i, 1);
      const { d: _d, ...a } = c;
      s.active.push(a);
      added++;
    }
    if (added) {
      this.save();
      if (before > 0 || s.done.length) this.g.toast(`✧ new commission — ${s.active[s.active.length - 1].title}`);
    }
  }

  private dist(a: Active) {
    if (a.lat === undefined) return 0;
    const [x, z] = this.g.fromLatLon(a.lat, a.lon!);
    return Math.hypot(x - this.g.walker.x, z - this.g.walker.z);
  }
  /** Commission targets in world coords (the map pins them). */
  targets() {
    return this.state.active.filter((a) => a.lat !== undefined).map((a) => { const [x, z] = this.g.fromLatLon(a.lat!, a.lon!); return { x, z, title: a.title }; });
  }

  // "you're close": a hint when a commission subject is within reach
  private nudge() {
    for (const a of this.state.active) {
      if (a.lat === undefined) continue;
      const d = this.dist(a);
      if (d < 70 && this.lastNear !== a.id) {
        this.lastNear = a.id;
        this.g.toast(`✧ ${a.title} — P, frame it, Space`);
        return;
      }
    }
  }

  // ---------------- judging a painting ----------------
  /** Which active commission (if any) the current view fulfils. */
  judge(): Active | null {
    const env = this.g.env();
    const w = this.g.walker, cam = this.g.camera;
    const hour = this.g.hour();
    const conds = (c?: string) => {
      if (!c) return true;
      for (const k of c.split(',')) {
        if (k === 'golden' && env.golden < 0.3) return false;
        if (k === 'night' && env.night < 0.6) return false;
        if (k === 'fog' && env.fog < 0.3) return false;
        if (k === 'morning' && !(hour > 4.5 && hour < 9 && env.night < 0.5)) return false;
        if (k === 'sea' && !this.facingWater()) return false;
        if (k === 'street' && !this.g.roads().some((r) => !r.lod && r.w >= 4 && this.near(r.p, w.x, w.z, 30))) return false;
        if (k === 'high' && cam.position.y - Math.max(this.g.terrain.heightAt(w.x, w.z), 0) < 25) return false;
      }
      return true;
    };
    const inFrame = (x: number, y: number, z: number, maxD: number) => {
      const d = Math.hypot(x - w.x, z - w.z);
      if (d > maxD || d < 2) return false;
      const n = this.g.toNdc(x, y, z);
      return n.z < 1 && Math.abs(n.x) < 0.8 && Math.abs(n.y) < 0.85;
    };
    for (const a of this.state.active) {
      if (!conds(a.cond)) continue;
      if (a.kind === 'poi') {
        const [x, z] = this.g.fromLatLon(a.lat!, a.lon!);
        if (inFrame(x, a.y ?? this.g.terrain.heightAt(x, z) + 3, z, 320)) return a;
      } else if (a.kind === 'kit') {
        if (this.g.instances(a.type!, w.x, w.z, 90).some((p) => inFrame(p.x, p.y + 1, p.z, 90))) return a;
      } else return a; // scenes: the conditions are the subject
    }
    return null;
  }
  complete(a: Active, page: string) {
    const s = this.state;
    s.active = s.active.filter((x) => x.id !== a.id);
    s.done.push({ id: a.id, title: a.title, page, t: Date.now() });
    this.genT = 3;
    this.save();
  }

  private near(p: number[], x: number, z: number, r: number) {
    for (let i = 0; i + 1 < p.length; i += 2) if (Math.abs(p[i] / 10 - x) < r && Math.abs(p[i + 1] / 10 - z) < r) return true;
    return false;
  }
  private facingWater() {
    const w = this.g.walker;
    for (const d of [60, 120, 220]) {
      const x = w.x - Math.sin(w.yaw) * d, z = w.z - Math.cos(w.yaw) * d;
      if (this.g.terrain.sdfAt(x, z) < -5) return true;
    }
    return false;
  }

  // ---------------- spotting log ----------------
  private spot() {
    const w = this.g.walker;
    const hit = (family: string, type: string) => {
      const list = (this.state.spotted[family] ??= []);
      if (list.includes(type)) return;
      list.push(type);
      this.save();
      const F = FAMILY[family];
      const nm = modelName(type);
      this.g.toast(`spotted ${art(nm)} ${nm} — ${list.length} of ${F.all.length} ${F.label} types`);
      this.g.sound('page');
    };
    for (const [prefix, family] of [['parked-cars:', 'car'], ['life-car:', 'car'], ['moored-boats:', 'boat'], ['life-boat:', 'boat'], ['ride-car:', 'car'], ['ride-boat:', 'boat'], ['ride-plane:', 'plane']] as const)
      for (const p of this.g.instances(prefix, w.x, w.z, family === 'boat' ? 60 : 30)) {
        const n = this.g.toNdc(p.x, p.y + 0.8, p.z);
        if (n.z < 1 && Math.abs(n.x) < 0.9 && Math.abs(n.y) < 0.9) hit(family, p.name.split(':')[1]);
      }
  }
  spottedSummary() {
    return Object.entries(FAMILY).map(([k, F]) => ({ family: k, label: F.label, seen: this.state.spotted[k] ?? [], all: F.all }));
  }
}
