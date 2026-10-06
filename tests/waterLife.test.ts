import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { P } from '../src/assets/core';
import { BODY_DEPTH, ROLE, WHALES, critterGeometry, faunaMix, swimSink, type CritterKind } from '../src/assets/fauna';
import { Critters, type CritterEnv } from '../src/sim/critters';
import { castOf, regionStyle } from '../src/world/styles';
import type { Terrain } from '../src/world/data';
import type { WalkWorld } from '../src/player/collision';

// The water's life, seen from above (docs/regional-life/models.md "the water's life"): the fish rising,
// rolling and leaping; the seals on the beach and the otters in the river; the dolphins' and the orcas'
// pods beyond the breakers; the whales' blows and flukes far out — and only ever a few of them, near
const kinds = (lat: number, lon: number, month?: number) => {
  const st = regionStyle(lat, lon);
  return new Set(Object.values(faunaMix(st.region, st.climate, castOf(st), month)).flat().map(([k]) => k));
};
const T: Record<string, [number, number]> = {
  SEA_BRIGHT: [40.36, -73.97], MIAMI: [25.76, -80.19], KEY_WEST: [24.56, -81.78], SEATTLE: [47.61, -122.33], MONTEREY: [36.6, -121.89], BAR_HARBOR: [44.39, -68.2],
  DENVER: [39.74, -104.99], CHICAGO: [41.88, -87.63], ST_LOUIS: [38.63, -90.2], PHOENIX: [33.45, -112.07],
};
const has = (p: [number, number], k: CritterKind, month?: number) => kinds(p[0], p[1], month).has(k);
const box = (g: THREE.BufferGeometry, part?: number) => {
  const p = g.getAttribute('position'), a = g.getAttribute('aPart'), b = new THREE.Box3();
  for (let i = 0; i < p.count; i++) if (part === undefined || Math.abs(a.getX(i) - part) < 0.5) b.expandByPoint(new THREE.Vector3(p.getX(i), p.getY(i), p.getZ(i)));
  return b;
};
const partCount = (g: THREE.BufferGeometry, part: number) => {
  const a = g.getAttribute('aPart');
  let n = 0;
  for (let i = 0; i < a.count; i++) if (Math.abs(a.getX(i) - part) < 0.5) n++;
  return n;
};
const colour = (g: THREE.BufferGeometry, hex: number, part?: number) => {
  const c = g.getAttribute('color'), a = g.getAttribute('aPart'), t = new THREE.Color(hex);
  for (let i = 0; i < c.count; i++) if ((part === undefined || Math.abs(a.getX(i) - part) < 0.5) && Math.abs(c.getX(i) - t.r) < 0.004 && Math.abs(c.getY(i) - t.g) < 0.004 && Math.abs(c.getZ(i) - t.b) < 0.004) return true;
  return false;
};
// a pond (fresh water all about), the open sea, and a beach (the sea to the north, −z)
const pond = { heightAt: () => -1, sdfAt: () => -10, coverAt: () => 80, oceanDistAt: () => 5000 } as unknown as Terrain;
const sea = { heightAt: () => -5, sdfAt: () => -300, coverAt: () => 80, oceanDistAt: () => 0 } as unknown as Terrain;
const kelp = { heightAt: () => -5, sdfAt: () => -50, coverAt: () => 80, oceanDistAt: () => 0 } as unknown as Terrain;
const beach = { heightAt: (_x: number, z: number) => Math.max(0, z * 0.05), sdfAt: (_x: number, z: number) => z, coverAt: () => 60, oceanDistAt: (_x: number, z: number) => Math.max(0, z) } as unknown as Terrain;
const walk = { buildingAt: () => -1, blocked: () => false, deckAt: () => null } as unknown as WalkWorld;
type Any = Record<string, unknown> & { x: number; y: number; z: number; state: string; t: number; pitch: number; kind: string; stage?: number; wl?: number; roll?: number };
const list = (c: Critters) => (c as unknown as { list: Any[] }).list;
const fx = (c: Critters) => (c as unknown as { fx: { k: number }[] }).fx;
const mesh = (c: Critters, k: string) => (c as unknown as { meshes: Map<string, { m: THREE.InstancedMesh }> }).meshes.get(k)!;
const env = (o: Partial<CritterEnv> = {}): CritterEnv => ({ hour: 12, night: 0, month: 7, wind: 0.2, south: false, camFwd: new THREE.Vector3(0, 0, -1), trees: () => [], gardens: () => [], movers: [], ...o });
const animal = (kind: string, x: number, z: number, o: Record<string, unknown> = {}): Any => ({ kind, x, y: 0, z, yaw: 0, pitch: 0, state: 'idle', t: 5, tx: x, tz: z, ty: 0, phase: 0, amt: 0, s: 1, c: new THREE.Color(), seed: 7, vig: 0.5, ...o });
const shore = castOf(regionStyle(40.36, -73.97)); // (the Jersey Shore: its summer's dolphins, its winter's humpbacks)
const quiet = (c: Critters) => { (c as unknown as { spawnT: number }).spawnT = 1e9; return c; }; // (no new arrivals: just the one)

describe("the water's life: who lives where, and when", () => {
  it("the Caribbean's shallows full of fish (the schools, the mullet, the tarpon); the dolphins down the Atlantic and the Gulf; the orcas the Northwest's; no seal or whale inland", () => {
    for (const p of [T.MIAMI, T.KEY_WEST]) for (const k of ['shoal', 'mullet', 'tarpon', 'dolphin'] as CritterKind[]) expect(has(p, k, 1), `${k} ${p}`).toBe(true);
    expect(has(T.SEATTLE, 'orca')).toBe(true);
    for (const p of [T.SEA_BRIGHT, T.MIAMI, T.MONTEREY]) expect(has(p, 'orca'), `${p}`).toBe(false);
    for (const p of [T.DENVER, T.CHICAGO, T.PHOENIX, T.ST_LOUIS]) for (const k of ['harborseal', 'sealion', 'dolphin', 'humpback', 'orca', 'mullet'] as CritterKind[]) expect(has(p, k), `${k} ${p}`).toBe(false);
    expect(has(T.DENVER, 'rainbowtrout')).toBe(true);
    expect(has(T.CHICAGO, 'silvercarp', 7)).toBe(true); // (the Illinois River's jumping carp)
    expect(has(T.CHICAGO, 'silvercarp', 1)).toBe(false);
    expect(has(T.MONTEREY, 'seaotter')).toBe(true);
    expect(has(T.MONTEREY, 'sealion')).toBe(true);
    expect(has(T.SEATTLE, 'seaotter')).toBe(false);
    expect(has(T.BAR_HARBOR, 'grayseal', 7)).toBe(true);
    for (const k of ['shoal', 'mullet', 'tarpon', 'salmon', 'rainbowtrout'] as CritterKind[]) expect(ROLE[k]).toBe('fish');
    for (const k of ['harborseal', 'grayseal', 'sealion', 'seaotter', 'riverotter'] as CritterKind[]) expect(ROLE[k]).toBe('swimmer');
    for (const k of ['dolphin', 'porpoise', 'orca', 'humpback', 'graywhale'] as CritterKind[]) expect(ROLE[k]).toBe('cetacean');
  });
  it("the seasons: the Jersey Shore's harbor seals in winter and its dolphins in summer, the humpbacks off it in winter; the gray whales by California in winter; the salmon's fall run", () => {
    expect(has(T.SEA_BRIGHT, 'harborseal', 1)).toBe(true);
    expect(has(T.SEA_BRIGHT, 'harborseal', 7)).toBe(false);
    expect(has(T.SEA_BRIGHT, 'dolphin', 7)).toBe(true);
    expect(has(T.SEA_BRIGHT, 'dolphin', 1)).toBe(false);
    expect(has(T.SEA_BRIGHT, 'humpback', 1)).toBe(true);
    expect(has(T.MONTEREY, 'graywhale', 1)).toBe(true);
    expect(has(T.MONTEREY, 'graywhale', 7)).toBe(false);
    expect(has(T.SEATTLE, 'salmon', 10)).toBe(true);
    expect(has(T.SEATTLE, 'salmon', 6)).toBe(false);
  });
});

describe("the water's life: the models", () => {
  it('every fish with its tail fin on its own pivot (it swings side to side), its body depth its own; the tarpon the biggest, the trout the smallest', () => {
    const fish: CritterKind[] = ['rainbowtrout', 'largemouthbass', 'mullet', 'salmon', 'tarpon', 'silvercarp'];
    for (const k of fish) {
      const g = critterGeometry(k);
      expect(partCount(g, P.tail), k).toBeGreaterThan(0);
      expect(BODY_DEPTH[k], k).toBeGreaterThan(0);
    }
    const len = (k: CritterKind) => box(critterGeometry(k)).getSize(new THREE.Vector3()).z;
    expect(len('tarpon')).toBeGreaterThan(len('salmon'));
    expect(len('salmon')).toBeGreaterThan(len('rainbowtrout'));
    expect(colour(critterGeometry('rainbowtrout'), 0xd47a86)).toBe(true); // (its pink band)
  });
  it('a school: dozens of little fish spread over metres, each with its own tail', () => {
    const g = critterGeometry('shoal'), b = box(g).getSize(new THREE.Vector3());
    expect(Math.max(b.x, b.z)).toBeGreaterThan(2);
    expect(b.y).toBeLessThan(0.2);
    expect(partCount(g, P.tail)).toBeGreaterThan(30 * 3);
  });
  it("the whales and the dolphins: flukes on the tail's pivot, flippers on the fore; the humpback's long white flippers; the orca's tall fin and white patch; sized as in life", () => {
    for (const k of ['dolphin', 'porpoise', 'orca', 'humpback', 'graywhale'] as CritterKind[]) {
      const g = critterGeometry(k);
      expect(partCount(g, P.tail), k).toBeGreaterThan(0);
      expect(partCount(g, P.fore), k).toBeGreaterThan(0);
    }
    const size = (k: CritterKind) => box(critterGeometry(k)).getSize(new THREE.Vector3());
    expect(size('humpback').z).toBeGreaterThan(12);
    expect(size('orca').z).toBeGreaterThan(6.5);
    expect(size('dolphin').z).toBeLessThan(3.2);
    expect(size('porpoise').z).toBeLessThan(size('dolphin').z);
    const hump = critterGeometry('humpback'), fl = box(hump, P.fore).getSize(new THREE.Vector3());
    expect(Math.max(fl.x, fl.z)).toBeGreaterThan(size('humpback').z * 0.25);
    expect(colour(hump, 0xe8ecec, P.fore)).toBe(true);
    const orca = critterGeometry('orca');
    expect(box(orca).max.y - box(orca, P.tail).max.y).toBeGreaterThan(0.9); // (the dorsal fin stands well above the back)
    expect(colour(orca, 0xf2f2ee)).toBe(true);
    expect([...WHALES].sort()).toEqual(['graywhale', 'humpback']);
  });
  it('the seals and the otters ride low in the water (the sea otter on its back, its chest up); the beaver its own: incisors, a scaly paddle of a tail, a peeled stick it carries now and then', () => {
    for (const k of ['harborseal', 'grayseal', 'sealion'] as CritterKind[]) expect(swimSink(k), k).toBeGreaterThan(0.3);
    expect(swimSink('seaotter')).toBeLessThan(0);
    const b = critterGeometry('beaver');
    expect(colour(b, 0xd8762a)).toBe(true);
    expect(colour(b, 0x2a2420, P.tail)).toBe(true);
    const paddle = box(b, P.tail).getSize(new THREE.Vector3());
    expect(paddle.x).toBeGreaterThan(paddle.y * 2); // (flat and broad)
    expect(colour(b, 0xd8c8a4, 9)).toBe(true); // (the stick: shown only with its +10 flag)
  });
});

describe("the water's life: what they do", () => {
  it('a mullet leaps clear — up, nose high, over and back in — with a ring where it left and a splash where it lands', () => {
    const c = quiet(new Critters(pond, walk));
    const f = animal('mullet', 0, -8, { state: 'cruise', t: 0, wl: -1, y: -1.6 });
    list(c).push(f);
    let top = -9, nose = 0, leapt = false, back = false;
    for (let i = 0; i < 400 && !back; i++) {
      c.update(0.02, 0, 0, env());
      if (f.state === 'leap') { leapt = true; top = Math.max(top, f.y); nose = Math.max(nose, f.pitch); }
      else if (leapt) back = true;
      if (f.state === 'sip') { f.state = 'cruise'; f.t = 0; } // (another go: it took the fly instead)
    }
    expect(leapt).toBe(true);
    expect(back).toBe(true);
    expect(top).toBeGreaterThan(-1 + 0.3);
    expect(nose).toBeGreaterThan(0.5);
    expect(fx(c).filter((x) => x.k === 0).length).toBeGreaterThanOrEqual(2);
    expect(fx(c).some((x) => x.k === 1)).toBe(true);
  });
  it("a fish cruising under the surface isn't drawn (nothing spent on the unseen); one leaping is", () => {
    const c = quiet(new Critters(pond, walk));
    const f = animal('rainbowtrout', 0, -6, { state: 'cruise', t: 50, wl: -1 });
    list(c).push(f);
    c.update(0.02, 0, 0, env());
    expect(mesh(c, 'rainbowtrout').m.count).toBe(0);
    expect(mesh(c, 'rainbowtrout').m.visible).toBe(false);
    f.state = 'leap'; f.t = 0.5; f.stage = 1;
    c.update(0.02, 0, 0, env());
    expect(mesh(c, 'rainbowtrout').m.count).toBe(1);
  });
  it('the rings and the blows are capped (a dozen each at most), and they fade out', () => {
    const c = quiet(new Critters(pond, walk)), r = c as unknown as { ripple(x: number, y: number, z: number, s: number): void; spout(x: number, y: number, z: number, s: number): void };
    for (let i = 0; i < 60; i++) { r.ripple(i, 0, 0, 1); r.spout(i, 0, 0, 1); }
    expect(fx(c).filter((x) => x.k === 0).length).toBe(12);
    expect(fx(c).filter((x) => x.k === 1).length).toBe(12);
    for (let i = 0; i < 200; i++) c.update(0.05, 0, 0, env());
    expect(fx(c).length).toBe(0);
  });
  it('a dolphin pod rolls over the surface in arcs, back and fin up and under; an orca now and then breaches clear, with a splash', () => {
    const c = quiet(new Critters(sea, walk));
    const d = animal('dolphin', 0, -40, { state: 'porpoise', stage: 0, t: 0.1, wl: 0, y: -2 });
    list(c).push(d);
    let top = -9;
    for (let i = 0; i < 300; i++) { c.update(0.02, 0, 0, env({ place: shore })); if (d.stage === 1) top = Math.max(top, d.y); }
    const H = BODY_DEPTH.dolphin!;
    expect(top).toBeGreaterThan(-H * 0.4); // (its back out)
    expect(top).toBeLessThan(H * 0.5); // (an arc, not a leap)
    list(c).length = 0;
    const o = animal('orca', 0, -60, { state: 'porpoise', stage: 0, t: 0.1, wl: 0, y: -5 });
    list(c).push(o);
    let breach = 0, high = -9;
    for (let i = 0; i < 6000; i++) { c.update(0.05, o.x, o.z + 60, env({ place: shore })); if (o.stage === 2) { breach++; high = Math.max(high, o.y); } }
    expect(breach).toBeGreaterThan(0);
    expect(high).toBeGreaterThan(1.5); // (clear of the water)
  });
  it("a whale far out: long under, then up — blowing two or three times — then sounding, head down and its flukes lifted", () => {
    const c = quiet(new Critters(sea, walk));
    const w = animal('humpback', 0, -400, { state: 'surface', stage: 0, t: 0.1, wl: 0, y: -10, s: 1 });
    list(c).push(w);
    let blows = 0, dive = 0, under = 0;
    for (let i = 0; i < 700; i++) {
      const before = fx(c).filter((x) => x.k === 1).length;
      c.update(0.02, 0, 0, env({ place: shore, month: 1 }));
      if (fx(c).filter((x) => x.k === 1).length > before) blows++;
      if (w.stage === 2) dive = Math.min(dive, w.pitch);
      if (w.stage === 0 && i > 10) under++;
    }
    expect(blows).toBeGreaterThanOrEqual(2);
    expect(dive).toBeLessThan(-0.8);
    expect(under).toBeGreaterThan(0);
    expect(list(c)).toContain(w); // (kept at 400 m: the whales are seen far off)
  });
  it('a whale is placed far out (hundreds of metres), never at the walker', () => {
    const c = new Critters(sea, walk);
    c.everyone = true;
    const e = env({ place: castOf(regionStyle(...T.SEATTLE)), month: 7 });
    for (let i = 0; i < 600; i++) c.update(0.05, 0, 0, e);
    const whales = list(c).filter((o) => WHALES.has(o.kind as CritterKind));
    for (const w of whales) expect(Math.hypot(w.x, w.z), w.kind).toBeGreaterThan(240);
    expect(list(c).some((o) => ROLE[o.kind as CritterKind] === 'cetacean')).toBe(true);
    expect(whales.length).toBeLessThanOrEqual(3); // (a humpback or a pair of grays, no more)
  });
  it('a harbor seal on the beach humps down into the water when the walker comes close; a sea otter afloat on its back', () => {
    const c = quiet(new Critters(beach, walk));
    const s = animal('harborseal', 0, 4, { state: 'idle', t: 30 });
    list(c).push(s);
    for (let i = 0; i < 300; i++) c.update(0.02, 0, 12, env());
    expect(['slide', 'dive']).toContain(s.state);
    for (let i = 0; i < 400 && s.state === 'slide'; i++) c.update(0.02, 0, 12, env());
    expect(s.state).toBe('dive');
    expect(s.z).toBeLessThan(4); // (towards the sea)
    const m = new Critters(kelp, walk);
    m.everyone = true;
    const e = env({ place: castOf(regionStyle(...T.MONTEREY)), month: 7 });
    for (let i = 0; i < 600 && !list(m).some((o) => o.kind === 'seaotter'); i++) m.update(0.05, 0, 0, e);
    const otter = list(m).find((o) => o.kind === 'seaotter');
    expect(otter).toBeDefined();
    expect(otter!.roll).toBeCloseTo(Math.PI);
  });
  it('a beaver in the water slaps its tail when startled — a ring, a burst of spray — and goes under', () => {
    const c = quiet(new Critters(pond, walk));
    const b = animal('beaver', 0, -3, { state: 'idle', t: 30, wl: -1, y: -1.3 });
    list(c).push(b);
    for (let i = 0; i < 100 && b.state !== 'dive'; i++) c.update(0.02, 0, 0, env());
    expect(b.state).toBe('dive');
    expect(fx(c).some((x) => x.k === 0)).toBe(true);
    expect(fx(c).some((x) => x.k === 1)).toBe(true);
  });
});
