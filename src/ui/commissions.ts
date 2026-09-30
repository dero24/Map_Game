// Commissions + the spotting log — the sketchbook's gentle goals, generated from what's really here.
// Commission subjects come from the real world around you (named buildings: churches, lighthouses, shops;
// baked POIs; the boat types moored at the piers) plus scenes the place can offer (the sea at golden
// hour, the shore in fog, a street under the lamps). No per-town lists: anywhere with named buildings
// or a coastline produces its own. Everything is deterministic per subject (ids hash position/name).
import type { GameCtx } from './ctx';
import { loadState, saveState, type BookState } from './book';
import { CAR_TYPES, BOAT_TYPES, PLANE_TYPES } from '../assets/kit';
import { BALLOON_PATTERNS } from '../assets/balloon';
import { modelName } from '../player/vehicles';
import { CRITTERS, CRITTER_NAME } from '../assets/fauna';
import { TREE_KINDS, PLANT_SPECIES, SPECIES } from '../assets/flora';

// Almanac names for the foundry's tree genomes (the genome is a growth habit; the name is the
// street-level read of it)
export const TREE_NAME: Record<string, string> = { round: 'shade tree', oak: 'oak', shrub: 'flowering shrub', pine: 'pitch pine', spruce: 'spruce', palm: 'palm', birch: 'birch' };

type Active = BookState['active'][number];
const ACTIVE = 3;
const FAMILY: Record<string, { label: string; all: string[] }> = {
  car: { label: 'car', all: CAR_TYPES },
  boat: { label: 'boat', all: BOAT_TYPES },
  plane: { label: 'plane', all: PLANE_TYPES },
  wildlife: { label: 'animal', all: CRITTERS },
  tree: { label: 'tree', all: TREE_KINDS },
  flower: { label: 'garden plant', all: PLANT_SPECIES },
  balloon: { label: 'hot air balloon', all: BALLOON_PATTERNS },
};
export const FAMILIES = FAMILY;
/** The families the brush can paint (ui/brush.ts). Planes join once airfields have planes to paint from life. */
export const PAINTABLE = ['boat', 'car', 'balloon'] as const;
// Side-on area (m²) of each paintable kind, for how much of a painting it fills
const SIDE: Record<string, number> = { gores: 300, bands: 300, chevron: 300, harlequin: 300, skiff: 6.5, console: 12, cabin: 25, sail: 20, pontoon: 13, lobster: 33, pickup: 9, van: 10, suv: 8, jeep: 7 };
// POI kinds that aren't worth a card (utilities, parking, generic tags)
const DULL = new Set(['toilets', 'parking', 'wastewater_plant', 'pumping_station', 'monitoring_station', 'tyres', 'car_wash', 'yes', 'apartment', 'military', 'laundry', 'car_repair', 'bicycle_repair_station', 'social_facility']);
export const niceName = (t: string, family = '') =>
  family === 'tree' ? TREE_NAME[t] ?? t : family === 'flower' ? SPECIES[t as keyof typeof SPECIES]?.label ?? t : CRITTER_NAME[t as keyof typeof CRITTER_NAME] ?? modelName(t);
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

  private stampT = 3;
  /** A new town stamp (the atlas shows them; toasts announce them). */
  onStamp: ((town: string, region: string) => void) | null = null;
  update(dt: number) {
    if ((this.stampT -= dt) <= 0) { this.stampT = 4; this.stamp(); }
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
    // the animals about right now: a quick sketch of one is a commission of its own
    for (const c of this.g.instances('critter:', w.x, w.z, 70)) {
      const kind = c.name.split(':')[1];
      const [lat, lon] = ll(c.x, c.z);
      const nm = CRITTER_NAME[kind as keyof typeof CRITTER_NAME] ?? kind;
      add({ id: `w:${kind}:${Math.round(lat * 100)}:${Math.round(lon * 100)}`, title: `Paint ${art(nm)} ${nm}`, hint: 'quietly — they startle', kind: 'kit', type: `critter:${kind}` }, 400);
    }
    // your own garden: paint what you grew once it flowers
    for (const c of this.g.instances('plant:', w.x, w.z, 200)) {
      const sp = c.name.split(':')[1];
      const [lat, lon] = ll(c.x, c.z);
      add({ id: `g:${sp}:${lat.toFixed(5)}:${lon.toFixed(5)}`, title: `Paint the ${sp} you grew`, hint: 'once it has grown — your garden is on the map (❀)', kind: 'kit', type: `plant:${sp}` }, 300);
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
        this.g.toast(`✧ ${a.title} — ${document.body.classList.contains('nomouse') ? '▣, frame it, paint' : 'P, frame it, Space'}`);
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
        const small = a.type!.startsWith('critter:');
        if (this.g.instances(a.type!, w.x, w.z, small ? 40 : 90).some((p) => inFrame(p.x, p.y + (small ? 0.15 : 1), p.z, small ? 40 : 90))) return a;
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
      const F = FAMILY[family];
      if (!F || !F.all.includes(type)) return;
      const list = (this.state.spotted[family] ??= []);
      if (list.includes(type)) return;
      list.push(type);
      // the Almanac card remembers where and when
      this.record(`${family}:${type}`);
      const nm = niceName(type, family);
      this.g.toast(`almanac: ${nm} sketched in pencil — paint one to finish the card (${list.length} of ${F.all.length} ${F.label}s)`);
      this.g.sound('page');
    };
    for (const [prefix, family] of [['parked-cars:', 'car'], ['kerb-cars:', 'car'], ['life-car:', 'car'], ['moored-boats:', 'boat'], ['life-boat:', 'boat'], ['ride-car:', 'car'], ['ride-boat:', 'boat'], ['ride-plane:', 'plane'], ['critter:', 'wildlife'], ['trees:', 'tree'], ['garden:', 'flower'], ['plant:', 'flower'], ['balloon:', 'balloon'], ['ride-balloon:', 'balloon']] as const)
      for (const p of this.g.instances(prefix, w.x, w.z, family === 'boat' ? 60 : family === 'wildlife' ? 35 : family === 'tree' ? 30 : family === 'flower' ? 20 : family === 'balloon' ? 400 : 30)) {
        const n = this.g.toNdc(p.x, p.y + (family === 'wildlife' ? 0.2 : family === 'tree' ? 3 : family === 'flower' ? 0.5 : family === 'balloon' ? 13 : 0.8), p.z);
        if (n.z < 1 && Math.abs(n.x) < 0.9 && Math.abs(n.y) < 0.9) hit(family, p.name.split(':')[1].split('+')[0]);
      }
  }
  private record(key: string, extra: Partial<import('./book').Seen> = {}) {
    const seen = (this.state.seen ??= {});
    if (seen[key]) return seen[key];
    const w = this.g.walker;
    const [lat, lon] = this.g.toLatLon(w.x, w.z);
    seen[key] = { t: Date.now(), lat, lon, town: this.g.locality(), region: this.g.region(), painted: false, ...extra };
    this.save();
    return seen[key];
  }
  /** Named places near you (baked POIs + named streamed buildings): the Almanac's place cards —
   *  unique to every town, so the book never runs out. */
  private places(r: number) {
    const w = this.g.walker, out: { key: string; name: string; kind: string; x: number; z: number }[] = [];
    for (const p of this.g.json.pois ?? []) if (!DULL.has(p.kind) && Math.abs(p.x - w.x) < r && Math.abs(p.z - w.z) < r) out.push({ key: `place:${p.name.toLowerCase()}`, name: p.name, kind: p.kind.replace(/_/g, ' '), x: p.x, z: p.z });
    for (const f of this.g.footprints()) {
      if (!f.name || !['church', 'lighthouse', 'commercial', 'large', 'civic', 'school'].includes(f.kind)) continue;
      const key = `place:${f.name.toLowerCase()}`;
      if (out.some((o) => o.key === key)) continue; // the same place mapped as a POI and a building
      const [x, z] = f.ring[0];
      if (Math.abs(x - w.x) < r && Math.abs(z - w.z) < r) out.push({ key, name: f.name, kind: f.kind === 'commercial' ? 'shop' : f.kind === 'large' ? 'building' : f.kind, x, z });
    }
    return out;
  }
  /** The kinds the last painting coloured in ('boat:skiff' …). */
  fresh: string[] = [];
  /** What you can paint (docs/GAME_DESIGN.md §4a): every kind of these families whose card you've
   *  coloured in — painted from life — newest first. */
  owned(families: readonly string[]): { family: string; type: string }[] {
    const seen = this.state.seen ?? {};
    return Object.entries(seen)
      .filter(([k, s]) => s.painted && families.includes(k.split(':')[0]) && FAMILY[k.split(':')[0]]?.all.includes(k.split(':')[1]))
      .sort((a, b) => (b[1].pt ?? b[1].t) - (a[1].pt ?? a[1].t))
      .map(([k]) => ({ family: k.split(':')[0], type: k.split(':')[1] }));
  }
  private inView(x: number, y: number, z: number, m = 0.9) { const n = this.g.toNdc(x, y, z); return n.z < 1 && Math.abs(n.x) < m && Math.abs(n.y) < m; }
  /** A painting was just made: everything recognisable in the middle of the frame gets its card
   *  coloured in (and places get your painting as their card). Returns what was painted. */
  paintFrame(page: string): string[] {
    const w = this.g.walker, done: string[] = [];
    this.fresh = [];
    // Paintable kinds are taught sparingly (Round 9: "five cards at once is a list, not a gift"):
    // your first painting teaches the one thing it's of; after that, what's composed — each
    // filling at least 4% of the frame — three at most. How much a thing fills: its side-on area
    // over the frame's area at its distance (a zoomed painting reaches further).
    const cam = this.g.camera, th = Math.tan(((cam.fov ?? 62) * Math.PI) / 360), aspect = cam.aspect || 16 / 9;
    const fills = new Map<string, number>();
    const firstCard = this.owned(PAINTABLE).length === 0;
    for (const [prefix, family, r] of [['parked-cars:', 'car', 45], ['kerb-cars:', 'car', 45], ['life-car:', 'car', 45], ['moored-boats:', 'boat', 90], ['life-boat:', 'boat', 120], ['ride-car:', 'car', 40], ['ride-boat:', 'boat', 60], ['ride-plane:', 'plane', 80], ['critter:', 'wildlife', 30], ['trees:', 'tree', 40], ['garden:', 'flower', 18], ['plant:', 'flower', 18], ['balloon:', 'balloon', 900], ['ride-balloon:', 'balloon', 900]] as const)
      for (const p of this.g.instances(prefix, w.x, w.z, r)) {
        if (!this.inView(p.x, p.y + (family === 'tree' ? 3 : family === 'balloon' ? 13 : 0.6), p.z, 0.7)) continue;
        const type = p.name.split(':')[1].split('+')[0];
        if (!FAMILY[family]?.all.includes(type)) continue;
        const key = `${family}:${type}`;
        const list = (this.state.spotted[family] ??= []);
        if (!list.includes(type)) list.push(type);
        if ((PAINTABLE as readonly string[]).includes(family)) {
          const d = Math.max(1, Math.hypot(p.x - w.x, p.y - w.y, p.z - w.z)), frameArea = (2 * d * th) ** 2 * aspect;
          fills.set(key, Math.max(fills.get(key) ?? 0, (SIDE[type] ?? 6.6) / frameArea));
          continue;
        }
        const s = this.record(key);
        if (!s.painted) { s.painted = true; s.pt = Date.now(); s.page = page; done.push(niceName(type, family)); this.fresh.push(key); }
      }
    // (a balloon is taught from further off: they're big, and mostly seen across a field or in the sky)
    const taught = [...fills].filter(([k, f]) => !this.state.seen?.[k]?.painted && f >= (firstCard ? 0.015 : k.startsWith('balloon:') ? 0.012 : 0.04)).sort((a, b) => b[1] - a[1]).slice(0, firstCard ? 1 : 3);
    for (const [key] of fills) {
      const s = this.record(key); // (in pencil at least: you saw it)
      if (s.painted || !taught.some(([k]) => k === key)) continue;
      const [family, type] = key.split(':');
      s.painted = true; s.pt = Date.now(); s.page = page; done.push(niceName(type, family)); this.fresh.push(key);
    }
    for (const pl of this.places(220)) {
      if (!this.inView(pl.x, this.g.terrain.heightAt(pl.x, pl.z) + 4, pl.z, 0.75)) continue;
      const s = this.record(pl.key, { name: pl.name, kind: pl.kind });
      if (!s.painted) { s.painted = true; s.page = page; done.push(pl.name); }
    }
    if (done.length) this.save();
    return done;
  }
  /** Stamp the town you're in (reverse geocoded; offline the region's own name stands in). */
  private stamp() {
    // place cards in pencil for named places you walk right up to
    for (const pl of this.places(70)) {
      if ((this.state.seen ?? {})[pl.key]) continue;
      const w = this.g.walker;
      if (Math.hypot(pl.x - w.x, pl.z - w.z) > 60 || !this.inView(pl.x, this.g.terrain.heightAt(pl.x, pl.z) + 4, pl.z)) continue;
      this.record(pl.key, { name: pl.name, kind: pl.kind });
      this.g.toast(`almanac: ${pl.name} — a new place card (paint it to finish)`);
      this.g.sound('page');
    }
    const town = this.g.locality(), region = this.g.region();
    if (!town) return;
    const k = town.toLowerCase(); // one stamp per town (the offline fallback region must not add a twin)
    const st = (this.state.stamps ??= {});
    for (const [kk, v] of Object.entries(st)) if (kk.startsWith(`${town}|`)) { delete st[kk]; st[k] = v; } // older town|region keys
    if (st[k]) { if (region && /County|Parish|Borough|, /.test(region) && st[k].region !== region) { st[k].region = region; this.save(); } return; }
    st[k] = { t: Date.now(), town, region };
    this.save();
    this.onStamp?.(town, region);
  }
  /** Place cards found so far (newest first). */
  placeCards() {
    return Object.entries(this.state.seen ?? {}).filter(([k]) => k.startsWith('place:')).map(([key, s]) => ({ key, ...s })).sort((a, b) => b.t - a.t);
  }
  /** Almanac progress: every entry, whether it's been seen, and where. */
  almanac() {
    const seen = this.state.seen ?? {};
    return Object.entries(FAMILY).map(([family, F]) => ({
      family, label: F.label,
      entries: F.all.map((type) => ({ type, name: niceName(type, family), seen: seen[`${family}:${type}`] ?? ((this.state.spotted[family] ?? []).includes(type) ? { t: 0, lat: 0, lon: 0, town: '', region: '' } : null) })),
    }));
  }
  spottedSummary() {
    return Object.entries(FAMILY).map(([k, F]) => ({ family: k, label: F.label, seen: this.state.spotted[k] ?? [], all: F.all }));
  }
}
