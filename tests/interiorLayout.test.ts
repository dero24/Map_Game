import { describe, it, expect } from 'vitest';
import { WalkWorld } from '../src/player/collision';
import { planInterior, registerPlan, rectArea, type Plan } from '../src/world/interior/plan';
import { layoutInterior, registerLayout, type Layout } from '../src/world/interior/layout';
import { build, flood, pockets, nobodys, wallsOnWindows, wallsOnWindows2, realRooms, area, minWidth, rect, fpOf, doorN, terrain, toW, type Built } from './helpers/interiorCheck';
import { cottageCases, bigHouseCases, entryType, stairInView, livingOpening } from './helpers/homes';
import { glassFacing, sunRoomView, sunniest, poolOn } from '../src/world/interior/views';
import type { Footprint, Door } from '../src/world/buildings';

// Slice 1 of docs/INTERIORS_PLAN.md — "rooms, not halls": the layout rules a planned interior
// keeps, on synthetic buildings of every family. (tests/interiorBudget.test.ts holds its costs.)

const CASES: Record<string, [Footprint, Door]> = {
  house: [fpOf(rect(12, 8), 'house', 6.7), doorN(8, -2)],
  house3: [fpOf(rect(11, 8), 'house', 9.6), doorN(8, 1)],
  bungalow: [fpOf(rect(14, 9), 'house', 3.8), doorN(9, -2)],
  walkup: [fpOf(rect(18, 8), 'large', 12), doorN(8, 0.5)],
  slab: [fpOf(rect(45, 16), 'large', 19.5), doorN(16, 0.3)],
  office: [fpOf(rect(60, 30), 'commercial', 31, 'office'), doorN(30, 0.3, 1.8)],
  tower: [fpOf(rect(40, 40), 'commercial', 150, 'office'), doorN(40, 0.3, 1.8)],
  mixed: [fpOf(rect(60, 18), 'commercial', 30), doorN(18, 0.3, 1.8)], // a shop with flats over it
  market: [fpOf(rect(60, 40), 'commercial', 7, 'supermarket'), doorN(40, 0.3, 1.8)],
  cafe: [fpOf(rect(14, 10), 'commercial', 7.8, 'cafe'), doorN(10, 0.3, 1.8)],
};
const built = new Map<string, Built>();
const get = (name: string) => {
  let b = built.get(name);
  if (!b) built.set(name, (b = build(...CASES[name])));
  return b;
};
/** Circulation and open floor: not "rooms" for the size rules. */
const CIRC = new Set(['hall', 'landing', 'corridor', 'lobby', 'stair', 'lift', 'open', 'shop', 'cafe', 'bar', 'diner', 'church', 'great', 'void']);
const SLOW = 60000; // (a flood fill of a big building takes a few seconds)

describe('a slab of flats', () => {
  it('has corridors at least 1.5 m wide and room-sized rooms (none over 38 m²)', () => {
    const b = get('slab');
    const corr = b.L.rooms.filter((r) => r.type === 'corridor');
    expect(corr.length).toBeGreaterThan(0);
    for (const r of corr) expect(minWidth(r)).toBeGreaterThanOrEqual(1.5 - 1e-6);
    const rooms = b.L.rooms.filter((r) => !CIRC.has(r.type));
    expect(Math.max(...rooms.map(area))).toBeLessThanOrEqual(38);
    // flats: a living room each, nearly all with their own bathroom and a bedroom or two
    const units = new Map<number, string[]>();
    for (const r of b.L.rooms) if (r.unit >= 0) units.set(r.unit, [...(units.get(r.unit) ?? []), r.type]);
    expect(units.size).toBeGreaterThan(20);
    const all = [...units.values()];
    expect(all.every((t) => t.includes('living'))).toBe(true);
    expect(all.filter((t) => t.includes('bath')).length).toBeGreaterThanOrEqual(0.9 * all.length);
    expect(all.filter((t) => t.includes('bed')).length).toBeGreaterThanOrEqual(0.5 * all.length);
  });
  it('is reachable and walkable, every room of it, from the front door', () => {
    const b = get('slab');
    const { reached, out } = flood(b, 0.5);
    expect(out).toBe(true);
    expect(b.L.rooms.filter((r) => !nobodys(r) && !reached.has(r.id)).map((r) => `${r.type}@${r.level}`)).toEqual([]);
  }, SLOW);
  it('a narrow walk-up has no corridor: its flats open off the stair landing', () => {
    const b = get('walkup');
    expect(b.L.rooms.some((r) => r.type === 'corridor')).toBe(false);
    for (let k = 0; k < b.P.levels; k++) expect(b.L.rooms.some((r) => r.level === k && (r.type === 'landing' || r.type === 'lobby'))).toBe(true);
    const { reached } = flood(b, 0.5);
    expect(reached.size).toBe(b.L.rooms.length);
  }, SLOW);
});

describe('an office floor', () => {
  for (const name of ['office', 'tower']) {
    it(`${name}: a core of 15–30% of the plate, desks within 13.5 m of the glass at one per 12 m² or better`, () => {
      const b = get(name);
      expect(b.P.arch).toBe('office');
      const frac = rectArea(b.P.core!) / rectArea(b.P.main);
      expect(frac).toBeGreaterThanOrEqual(0.15);
      expect(frac).toBeLessThanOrEqual(0.3);
      const M = b.P.main;
      expect(b.L.desks.length).toBeGreaterThan(50);
      for (const d of b.L.desks) expect(Math.min(d.u - M.u0, M.u1 - d.u, d.v - M.v0, M.v1 - d.v)).toBeLessThanOrEqual(13.5);
      const open = b.L.rooms.filter((r) => r.type === 'open').reduce((s, r) => s + area(r), 0);
      expect(b.L.desks.length).toBeGreaterThanOrEqual(open / 12);
      // WCs, lifts and stores in the core; meeting rooms off the open plan; rooms room-sized
      for (const t of ['wc', 'lift', 'store', 'meeting']) expect(b.L.rooms.some((r) => r.type === t)).toBe(true);
      expect(Math.max(...b.L.rooms.filter((r) => !CIRC.has(r.type)).map(area))).toBeLessThanOrEqual(38);
    });
  }
  it('every room of an office is reachable on foot, up its core stair', () => {
    const b = get('office');
    const { reached } = flood(b, 0.5);
    expect(b.L.rooms.filter((r) => !nobodys(r) && !reached.has(r.id)).map((r) => `${r.type}@${r.level}`)).toEqual([]);
  }, SLOW);
});

describe('houses', () => {
  // every size from a 9 × 7 cottage to a 16 × 10 house, 1–3 storeys, the door at 40 places along the front
  it('have a hall with at least three rooms off it on nearly every storey, and real bedrooms', () => {
    let storeys = 0, three = 0;
    const bad: string[] = [];
    for (const [L, W] of [[9, 7], [12, 8], [14, 9], [16, 10]])
      for (const top of [3.8, 6.7, 9.6])
        for (let k = 0; k < 40; k++) {
          const x = -L / 2 + L * (0.28 + 0.44 * (k / 39));
          const fp = { ...fpOf(rect(L, W), 'house', top), seed: 0.3 + k / 100 };
          const P = planInterior('h', fp, doorN(W, x), 1000 + k);
          const Ly = layoutInterior(P, fp);
          for (let lv = 0; lv < P.levels; lv++) {
            storeys++;
            if (realRooms(Ly, lv).length >= 3) three++;
          }
          for (const r of Ly.rooms.filter((q) => q.type === 'bed')) {
            const ok = area(r) >= 7.5 && minWidth(r) >= 2.15 && (r.bed !== 2 || (area(r) >= 11.5 && minWidth(r) >= 2.75));
            if (!ok) bad.push(`${L}x${W}/${top}/${k}: ${area(r).toFixed(1)} m² ${minWidth(r).toFixed(2)} wide`);
          }
          // a kitchen and a living room downstairs; a bathroom on every storey above it (or on the one)
          expect(Ly.rooms.some((r) => r.level === 0 && r.type === 'kitchen') && Ly.rooms.some((r) => r.level === 0 && r.type === 'living')).toBe(true);
          for (let lv = P.levels > 1 ? 1 : 0; lv < P.levels; lv++) expect(Ly.rooms.some((r) => r.level === lv && r.type === 'bath')).toBe(true);
        }
    expect(three / storeys).toBeGreaterThanOrEqual(0.9);
    expect(bad).toEqual([]);
  }, SLOW);
  // the review's round 10, must-fix 4: "the front door opens on a home"
  it('a cottage (≤ 110 m² a storey) opens straight into its living room: of 40 seeded, ≥ 80%', () => {
    let open = 0;
    const bad: string[] = [];
    for (const c of cottageCases()) {
      const P = planInterior('c', c.fp, c.door, c.seed);
      const t = entryType(P, layoutInterior(P, c.fp));
      if (t === 'living' || t === 'great') open++; else bad.push(`${c.name}: ${t}`);
    }
    expect(open / 40, bad.join('; ')).toBeGreaterThanOrEqual(0.8);
    expect(open).toBe(40); // (all of them, as it stands)
  });
  it('a house over 150 m² keeps its hall, the stair\'s foot ≤ 5 m from the door and in view: of 40 seeded, ≥ 80%', () => {
    let seen = 0, hall = 0;
    const bad: string[] = [];
    for (const c of bigHouseCases()) {
      const P = planInterior('h', c.fp, c.door, c.seed);
      const L = layoutInterior(P, c.fp);
      if (entryType(P, L) === 'hall') hall++;
      const s = stairInView(P, L);
      if (s.ok) seen++; else bad.push(`${c.name}: ${s.why}`);
    }
    expect(hall).toBe(40);
    expect(seen / 40, bad.join('; ')).toBeGreaterThanOrEqual(0.8);
    expect(seen).toBe(40);
  });
  it('the living room opens off the hall through a cased opening ≥ 1.2 m wide, within 30° of the door\'s axis', () => {
    let ok = 0;
    const bad: string[] = [];
    for (const c of bigHouseCases()) {
      const P = planInterior('h', c.fp, c.door, c.seed);
      const L = layoutInterior(P, c.fp);
      const o = livingOpening(P, L);
      if (o.ok) ok++; else bad.push(`${c.name}: ${o.why}`);
      // (a cased opening: wider than a door, so no leaf stands in it)
      if (o.ok) expect(o.w!).toBeGreaterThan(1.15);
    }
    expect(ok / 40, bad.join('; ')).toBeGreaterThanOrEqual(0.9);
  });
  it('a cottage is walkable, every room of it, from the front door — upstairs off its landing', () => {
    for (const [L, W, top, x] of [[11.1, 7.7, 3.8, -0.84], [9, 9, 6.7, 0.5], [8, 7, 6.7, -1]] as const) {
      const b = build(fpOf(rect(L, W), 'house', top), doorN(W, x));
      expect(b.P.cottage).toBe(1);
      const { reached, out } = flood(b, 0.35);
      expect(out).toBe(true);
      expect(b.L.rooms.filter((r) => !nobodys(r) && !reached.has(r.id)).map((r) => `${L}×${W} ${r.type}@${r.level}`)).toEqual([]);
      // upstairs: bedrooms and a bathroom off a landing no wider than the stair and a passage
      if (b.P.levels > 1) {
        expect(b.L.rooms.some((r) => r.level === 1 && r.type === 'bed')).toBe(true);
        expect(b.L.rooms.some((r) => r.level === 1 && r.type === 'bath')).toBe(true);
        if (b.P.land) expect(b.P.land.v1 - b.P.land.v0).toBeLessThan(b.P.strip!.v1 - b.P.strip!.v0);
      }
    }
  }, SLOW);
  it('pose 19 (morning sun) frames the room with the most east-to-south glass, from inside it, facing it', () => {
    // the review's cottage, its door in the north wall: its back (south) and east rooms take the morning
    // (the sun at 9:18 on 1 October at 40.4° N: 26° up, bearing 118°)
    const sun: [number, number, number] = [0.794, 0.438, 0.422], homes: { P: Plan; fp: Footprint; L: Layout }[] = [];
    for (const [L, W, x] of [[11.1, 7.7, -0.84], [9, 9, 0.5], [15, 11, 1.5]] as const) {
      const fp = fpOf(rect(L, W), 'house', 3.8), P = planInterior('v', fp, doorN(W, x), 99), Ly = layoutInterior(P, fp);
      const g = glassFacing(P, fp, Ly);
      expect(g.length).toBeGreaterThan(0);
      for (const q of g) {
        // (facing east to south: +x east, +z south; out of the building)
        const wx = P.ux * q.out[0] + P.vx * q.out[1], wz = P.uz * q.out[0] + P.vz * q.out[1];
        expect(wx).toBeGreaterThan(-0.01);
        expect(wz).toBeGreaterThan(-0.01);
      }
      const v = sunRoomView(P, fp, Ly)!;
      // (a home's rooms: not its bathroom, WC, utility room or a cupboard)
      expect(v.glass).toBe(Math.max(...g.filter((q) => !['wc', 'bath', 'utility', 'closet'].includes(q.room.type)).map((q) => q.glass)));
      const u = (v.x - P.cx) * P.ux + (v.z - P.cz) * P.uz, vv = (v.x - P.cx) * P.vx + (v.z - P.cz) * P.vz, r = v.room.r;
      expect(u > r.u0 && u < r.u1 && vv > r.v0 && vv < r.v1).toBe(true);
      // looking toward its glass (forward is (−sin yaw, −cos yaw)), and down at the floor before it
      const gq = g.find((q) => q.room.id === v.room.id)!, fx = -Math.sin(v.yaw), fz = -Math.cos(v.yaw);
      expect(fx * (P.ux * gq.out[0] + P.vx * gq.out[1]) + fz * (P.uz * gq.out[0] + P.vz * gq.out[1])).toBeGreaterThan(0.3);
      expect(v.pitch).toBeLessThan(-0.15);
      expect(sunRoomView(P, fp, Ly)).toEqual(v);
      // with the sun (9:18 on 1 October at 40.4° N: 26° up, bearing 118°): the stance sees the pools
      const s = sunRoomView(P, fp, Ly, 90, 180, 0, sun)!;
      expect(s.glass).toBe(v.glass);
      // (sunlit floor in the frame — the stance's own estimate: a narrow bedroom's single window
      // leaves a small patch; the review's room, 5 m² of glass, about 5%)
      expect(s.pool!).toBeGreaterThan(0.01);
      const su = (s.x - P.cx) * P.ux + (s.z - P.cz) * P.uz, sv = (s.x - P.cx) * P.vx + (s.z - P.cz) * P.vz;
      expect(su > s.room.r.u0 && su < s.room.r.u1 && sv > s.room.r.v0 && sv < s.room.r.v1).toBe(true);
      // furniture where it stood: it stands clear of it, and the light on that floor isn't a pool
      const at = { u0: su - 0.5, u1: su + 0.5, v0: sv - 0.5, v1: sv + 0.5 }, s2 = sunRoomView(P, fp, Ly, 90, 180, 0, sun, [at])!;
      const u2 = (s2.x - P.cx) * P.ux + (s2.z - P.cz) * P.uz, v2 = (s2.x - P.cx) * P.vx + (s2.z - P.cz) * P.vz;
      expect(u2 > at.u0 - 0.3 && u2 < at.u1 + 0.3 && v2 > at.v0 - 0.3 && v2 < at.v1 + 0.3).toBe(false);
      expect(s2.glass).toBe(s.glass);
      for (const p of poolOn(P, fp, s.room, sun, 0, [at])) expect(p[0] > at.u0 && p[0] < at.u1 && p[1] > at.v0 && p[1] < at.v1).toBe(false);
      homes.push({ P, fp, L: Ly });
    }
    // across homes: the one holding the most of that glass
    const most = (h: (typeof homes)[number]) => Math.max(0, ...glassFacing(h.P, h.fp, h.L).filter((q) => !['wc', 'bath', 'utility', 'closet'].includes(q.room.type)).map((q) => q.glass));
    const i = sunniest(homes, 90, 180, 0, sun);
    expect(most(homes[i])).toBe(Math.max(...homes.map(most)));
    expect(sunniest(homes.slice(i, i + 1), 90, 180, 0, sun)).toBe(0);
  });
  it('the front door opens onto the hall, not onto the stair', () => {
    for (const name of ['house', 'house3']) {
      const b = get(name), d = b.P.door;
      let x = d.x + d.nx, z = d.z + d.nz, feet = d.y;
      for (let i = 0; i < 30; i++) {
        [x, z] = b.w.move(x, z, -d.nx * 0.1, -d.nz * 0.1, 0.32, feet);
        feet = b.w.surfaceAt(x, z, feet);
      }
      expect(Math.hypot(x - d.x, z - d.z)).toBeGreaterThan(1.5); // got in
      expect(feet).toBeCloseTo(d.y, 1); // and is still on the ground floor
    }
  });
});

describe('every building', () => {
  it('climbs by real stairs: risers ≤ 0.196 m (0.178 in an office), goings ≥ 0.254 m', () => {
    for (const name of Object.keys(CASES)) {
      const { P } = get(name);
      for (const F of P.flights) {
        const rise = (((F.hi ?? 1) - (F.lo ?? 0)) * P.floorH) / F.steps!;
        expect(rise).toBeLessThanOrEqual(P.arch === 'office' ? 0.178 : 0.196);
        expect(Math.abs(F.topU - F.bottomU) / Math.max(1, F.steps! - 1)).toBeGreaterThanOrEqual(0.254);
      }
    }
  });
  it('is the same building every time (plan and rooms)', () => {
    for (const name of Object.keys(CASES)) {
      const [fp, door] = CASES[name];
      const P = planInterior('t', fp, door, 99);
      expect(planInterior('t', fp, door, 99)).toEqual(P);
      expect(layoutInterior(P, fp)).toEqual(layoutInterior(planInterior('t', fp, door, 99), fp));
    }
  });
  it('never stands a wall on a window: partitions meet the facade between them', () => {
    for (const name of Object.keys(CASES)) {
      const b = get(name);
      expect(wallsOnWindows(b).map(([i, k]) => `${name} wall ${i} storey ${k}`)).toEqual([]);
      expect(wallsOnWindows2(b).map((s) => `${name} ${s}`)).toEqual([]);
    }
  });
  it('shops keep their floor open: a supermarket is aisles, a café its tables', () => {
    for (const name of ['market', 'cafe']) {
      const b = get(name);
      const floor = b.L.rooms.filter((r) => r.level === 0 && ['shop', 'cafe', 'diner', 'bar'].includes(r.type)).reduce((s, r) => s + area(r), 0);
      expect(floor).toBeGreaterThan(0.5 * rectArea(b.P.main));
    }
  });
  it('lets you walk to every room and never shuts you in (houses, a walk-up, a shop, a mixed block)', () => {
    for (const name of ['house', 'house3', 'bungalow', 'walkup', 'market', 'cafe', 'mixed']) {
      const b = get(name);
      const { reached, pts, out } = flood(b, name === 'mixed' || name === 'market' ? 0.5 : 0.35);
      expect(out).toBe(true);
      expect(b.L.rooms.filter((r) => !nobodys(r) && !reached.has(r.id)).map((r) => `${name} ${r.type}@${r.level}`)).toEqual([]);
      expect(pockets(b, pts).map((s) => `${name} ${s}`)).toEqual([]);
    }
  }, SLOW);
  it('a walker standing where a wall goes up is left a doorway, and can walk out', () => {
    for (const name of ['house', 'walkup']) {
      const [fp, door] = CASES[name];
      const P = planInterior('t', fp, door, 99);
      const L = layoutInterior(P, fp);
      // stand on the middle of ground-storey partitions as they're registered (where a walker
      // can stand at all: not against the stairs' own walls)
      let tried = 0;
      for (const wl of L.walls.filter((q) => q.level === 0)) {
        const m = (wl.a + wl.b) / 2; // (a step off the wall's line: right on it, there's no side to be pushed to)
        const [x, z] = wl.ax === 0 ? toW(P, m, wl.c + 0.1) : toW(P, wl.c + 0.1, m);
        const w = new WalkWorld(terrain, { x0: -500, z0: -500, x1: 500, z1: 500 });
        registerPlan(w, fp, P);
        if (w.touching(x, z, 0.32, P.floor0) || tried >= 4) continue;
        tried++;
        // (without the walker, that wall would have them in it)
        const w0 = new WalkWorld(terrain, { x0: -500, z0: -500, x1: 500, z1: 500 });
        registerPlan(w0, fp, P);
        registerLayout(w0, P, L);
        const gapHere = wl.gaps.some(([g0, g1]) => g0 < m + 0.35 && g1 > m - 0.35);
        if (!gapHere) expect(w0.touching(x, z, 0.32, P.floor0)).toBe(true);
        registerLayout(w, P, L, { x, z, feet: P.floor0 });
        expect(w.touching(x, z, 0.32, P.floor0)).toBe(false);
        const { out } = flood({ fp, P, L, w }, 0.35, [x, z, P.floor0]);
        expect(out).toBe(true);
      }
      expect(tried).toBeGreaterThanOrEqual(2);
    }
  }, SLOW);
});
