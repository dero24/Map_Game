import { describe, it, expect } from 'vitest';
import { planInterior, rectArea, STRIPS, type Rect } from '../src/world/interior/plan';
import { layoutInterior, MARKET, type Fixture, type Layout } from '../src/world/interior/layout';
import { placeOf, hotelOnlyUpstairs } from '../src/world/uses';
import { build, flood, nobodys, wallsOnWindows, wallsOnWindows2, area, minWidth, rect, fpOf, doorN } from './helpers/interiorCheck';
import type { Footprint, Door } from '../src/world/buildings';

// Slice 4 of docs/INTERIORS_PLAN.md — deeper archetypes: a building whose data says what it is
// gets that inside — a supermarket's aisles, checkouts and cold cases, a restaurant's kitchen, a
// hotel's corridors of en-suite rooms, a school's classrooms and hall, a church's pews, a library's
// stacks, a bank's counter — at the §2 proportions.

const SLOW = 120000;
/** The clear distance between two rects (the larger of the gaps along u and along v; ≤ 0: they meet). */
const gap = (a: Rect, b: Rect) => Math.max(a.u0 - b.u1, b.u0 - a.u1, a.v0 - b.v1, b.v0 - a.v1);
const lay = (fp: Footprint, door: Door, seed = 99) => {
  const P = planInterior('t', fp, door, seed);
  return { P, L: layoutInterior(P, fp) };
};
const at = (L: Layout, k: number, ...types: string[]) => L.rooms.filter((r) => r.level === k && types.includes(r.type));
const sum = (rs: { r: Rect }[]) => rs.reduce((s, r) => s + rectArea(r.r), 0);

describe('a supermarket', () => {
  // every size from a neighbourhood market to a superstore, the door at either side of its front
  const SIZES: [number, number, number][] = [[60, 40, 0.3], [30, 24, 4], [45, 30, -6], [80, 50, 10], [36, 36, 0.3], [26, 40, -3]];
  const all = SIZES.map(([L, W, x]) => ({ name: `${L}×${W}`, ...lay(fpOf(rect(L, W), 'commercial', 7, 'supermarket'), doorN(W, x, 1.8)) }));
  it('is planned as one: gondola runs, checkouts, cold cases, produce', () => {
    for (const { name, P, L } of all) {
      expect(P.arch, name).toBe('market');
      const n = (k: Fixture['kind']) => L.fix.filter((f) => f.kind === k).length;
      expect(n('gondola'), name).toBeGreaterThanOrEqual(6);
      expect(n('checkout'), name).toBeGreaterThanOrEqual(2);
      expect(n('cooler') + n('freezer'), name).toBeGreaterThanOrEqual(2);
    }
  });
  it('keeps aisles at least 1.5 m wide between every pair of fixtures, and a cross aisle every 15 m or less', () => {
    for (const { name, P, L } of all) {
      const fx = L.fix.filter((f) => f.level === 0);
      // (the cold cases stand end to end along the back partition: one run)
      const cold = (f: Fixture) => f.kind === 'cooler' || f.kind === 'freezer';
      for (let i = 0; i < fx.length; i++)
        for (let j = i + 1; j < fx.length; j++) if (!(cold(fx[i]) && cold(fx[j]))) expect(gap(fx[i].r, fx[j].r), `${name} ${fx[i].kind}/${fx[j].kind}`).toBeGreaterThanOrEqual(1.5 - 1e-6);
      for (const g of fx.filter((f) => f.kind === 'gondola')) {
        const len = Math.max(g.r.u1 - g.r.u0, g.r.v1 - g.r.v0);
        expect(len, name).toBeLessThanOrEqual(15);
        expect(len).toBeCloseTo(g.n * MARKET.GOND, 6);
        // (a run stands 1.5 m or more clear of the walls and of the back rooms)
        const M = P.main;
        expect(Math.min(g.r.u0 - M.u0, M.u1 - g.r.u1, g.r.v0 - M.v0, M.v1 - g.r.v1), name).toBeGreaterThanOrEqual(1.5);
        for (const r of L.rooms.filter((q) => q.level === 0 && q.type !== 'shop')) expect(gap(g.r, r.r), `${name} gondola by the ${r.type}`).toBeGreaterThanOrEqual(1.5 - 1e-6);
      }
    }
  });
  it('has its checkouts at the door and 20–25% of the floor behind the scenes', () => {
    for (const { name, P, L } of all) {
      const M = P.main, co = L.fix.filter((f) => f.kind === 'checkout'), gd = L.fix.filter((f) => f.kind === 'gondola');
      for (const c of co) expect(c.r.u0 - M.u0, name).toBeLessThanOrEqual(3);
      expect(Math.min(...co.map((c) => Math.abs((c.r.v0 + c.r.v1) / 2 - P.vd))), name).toBeLessThanOrEqual(6);
      // (between the door and the aisles: a shopper passes them on the way out)
      expect(Math.max(...co.map((c) => c.r.u1)), name).toBeLessThan(Math.min(...gd.map((g) => g.r.u0)));
      const back = sum(L.rooms.filter((r) => r.level === 0 && !['shop', 'stair', 'lift', 'shaft'].includes(r.type)));
      expect(back / rectArea(M), name).toBeGreaterThanOrEqual(0.2);
      expect(back / rectArea(M), name).toBeLessThanOrEqual(0.25);
    }
  });
  it('stands every fixture on the sales floor, clear of the doorways', () => {
    for (const { name, L } of all) {
      const shop = at(L, 0, 'shop');
      for (const f of L.fix) {
        const c = [(f.r.u0 + f.r.u1) / 2, (f.r.v0 + f.r.v1) / 2];
        expect(shop.some((r) => c[0] > r.r.u0 && c[0] < r.r.u1 && c[1] > r.r.v0 && c[1] < r.r.v1), `${name} ${f.kind}`).toBe(true);
        for (const d of L.doors.filter((q) => q.level === f.level)) {
          const z = d.ax === 0 ? { u0: d.t - d.w / 2 - 0.3, u1: d.t + d.w / 2 + 0.3, v0: d.c - 1.1, v1: d.c + 1.1 } : { u0: d.c - 1.1, u1: d.c + 1.1, v0: d.t - d.w / 2 - 0.3, v1: d.t + d.w / 2 + 0.3 };
          expect(gap(z, f.r), `${name} ${f.kind} in a doorway`).toBeGreaterThan(-1e-9);
        }
      }
    }
  });
  it('lets a shopper reach every room of it', () => {
    const b = build(fpOf(rect(45, 30), 'commercial', 7, 'supermarket'), doorN(30, -6, 1.8));
    const { reached, out } = flood(b, 0.5);
    expect(out).toBe(true);
    expect(b.L.rooms.filter((r) => !nobodys(r) && !reached.has(r.id)).map((r) => r.type)).toEqual([]);
  }, SLOW);
});

describe('a restaurant', () => {
  it('gives its kitchen 30–40% of the floor, with a WC off the dining room', () => {
    // (a restaurant 14 m wide or more: a narrower one's corners leave its kitchen what they leave)
    for (const [Lx, Wz] of [[24, 16], [14, 18], [20, 12], [30, 20], [16, 16], [18, 26], [22, 9], [40, 25]]) {
      const name = `${Lx}×${Wz}`;
      const { P, L } = lay(fpOf(rect(Lx, Wz), 'commercial', 5, 'restaurant'), doorN(Wz, 0.3, 1.8));
      const kitchen = sum(at(L, 0, 'galley')) / rectArea(P.main);
      expect(kitchen, name).toBeGreaterThanOrEqual(0.3);
      expect(kitchen, name).toBeLessThanOrEqual(0.4);
      expect(at(L, 0, 'wc').length, name).toBeGreaterThan(0);
      expect(sum(at(L, 0, 'diner')) / rectArea(P.main), name).toBeGreaterThanOrEqual(0.45);
    }
  });
});

describe('a hotel', () => {
  const H = [
    // on a storefront (its ground storey the lobby, bar and breakfast room: no corridor meets the glass)
    { name: 'commercial', fp: fpOf(rect(60, 18), 'commercial', 16, 'hotel'), door: doorN(18, 0.3, 1.8) },
    // a big untagged block called a hotel: its lobby at the door, rooms on every storey
    { name: 'large', fp: { ...fpOf(rect(60, 18), 'large', 16), name: 'Seaview Hotel' }, door: doorN(18, 0.3) },
  ];
  it('60×18 m: at least 24 rooms of 25–35 m² on every storey of rooms, each with its own bathroom', () => {
    for (const { name, fp, door } of H) {
      const { P, L } = lay(fp, door);
      expect(P.arch, name).toBe('hotel');
      for (let k = 0; k < P.levels; k++) {
        if (k === 0 && P.pub) {
          for (const t of ['lobby', 'bar', 'dining']) expect(at(L, 0, t).length, `${name} ${t}`).toBeGreaterThan(0);
          continue;
        }
        const units = new Map<number, { a: number; t: string[] }>();
        for (const r of L.rooms) if (r.level === k && r.unit >= 0) {
          const u = units.get(r.unit) ?? { a: 0, t: [] };
          u.a += rectArea(r.r);
          u.t.push(r.type);
          units.set(r.unit, u);
        }
        const rooms = [...units.values()].filter((u) => u.t.includes('guest'));
        expect(rooms.filter((u) => u.a >= 25 && u.a <= 35).length, `${name} storey ${k}`).toBeGreaterThanOrEqual(k === 0 ? 20 : 24);
        expect(rooms.filter((u) => u.t.includes('bath')).length, `${name} storey ${k}`).toBeGreaterThanOrEqual(0.9 * rooms.length);
        // (the corridor 1.6 m or more: §2's 1.8 m where the end walls' windows allow)
        for (const c of at(L, k, 'corridor')) expect(minWidth(c), name).toBeGreaterThanOrEqual(STRIPS.hotel.dbl[0] - 1e-6);
      }
      if (!P.pub) for (const t of ['lobby', 'dining']) expect(at(L, 0, t).length, `${name} ${t}`).toBeGreaterThan(0);
    }
  });
  it('lets a guest walk from the street to every room', () => {
    const b = build(H[0].fp, H[0].door);
    const { reached, out } = flood(b, 0.5);
    expect(out).toBe(true);
    expect(b.L.rooms.filter((r) => !nobodys(r) && !reached.has(r.id)).map((r) => `${r.type}@${r.level}`)).toEqual([]);
  }, SLOW);
});

describe('a school', () => {
  const S = [
    { name: 'commercial 60×18', fp: fpOf(rect(60, 18), 'commercial', 12, 'school'), door: doorN(18, 0.3, 1.8) },
    { name: 'large 60×18', fp: { ...fpOf(rect(60, 18), 'large', 10), name: 'Lincoln Elementary School' }, door: doorN(18, 0.3) },
    { name: 'commercial 48×20', fp: fpOf(rect(48, 20), 'commercial', 8.5, 'school'), door: doorN(20, -4, 1.8) },
    { name: 'large 40×16', fp: { ...fpOf(rect(40, 16), 'large', 7), name: 'Escuela Primaria' }, door: doorN(16, 2) },
  ];
  it('has classrooms of 50–65 m² off wide corridors, WCs on every storey, a hall and an office', () => {
    for (const { name, fp, door } of S) {
      const { P, L } = lay(fp, door);
      expect(P.arch, name).toBe('school');
      const cls = L.rooms.filter((r) => r.type === 'classroom');
      expect(cls.length, name).toBeGreaterThanOrEqual(4);
      for (const c of cls) {
        expect(area(c), `${name} classroom on storey ${c.level}`).toBeGreaterThanOrEqual(50);
        expect(area(c), `${name} classroom on storey ${c.level}`).toBeLessThanOrEqual(65);
      }
      for (const c of L.rooms.filter((r) => r.type === 'corridor')) expect(minWidth(c), name).toBeGreaterThanOrEqual(1.8);
      for (let k = 0; k < P.levels; k++) expect(at(L, k, 'wc').length, `${name} WC on storey ${k}`).toBeGreaterThan(0);
      expect(L.rooms.some((r) => r.type === 'assembly'), `${name} hall`).toBe(true);
      expect(L.rooms.some((r) => r.type === 'staff'), `${name} office`).toBe(true);
    }
  });
  it('lets a pupil walk to every room', () => {
    const b = build(S[1].fp, S[1].door);
    const { reached, out } = flood(b, 0.5);
    expect(out).toBe(true);
    expect(b.L.rooms.filter((r) => !nobodys(r) && !reached.has(r.id)).map((r) => `${r.type}@${r.level}`)).toEqual([]);
  }, SLOW);
});

describe('a church, a mosque', () => {
  const church = () => lay(fpOf(rect(12, 24), 'church', 12), doorN(24, 0.3, 2.2));
  it('lines its pews up at 0.91 m either side of a 1.5 m centre aisle, facing the altar at the far end', () => {
    const { P, L } = church();
    expect(at(L, 0, 'narthex').length).toBe(1);
    const pews = L.fix.filter((f) => f.kind === 'pew'), alt = L.fix.filter((f) => f.kind === 'altar');
    expect(alt.length).toBe(1);
    expect(pews.length).toBeGreaterThanOrEqual(16);
    const vm = (P.main.v0 + P.main.v1) / 2;
    for (const p of pews) {
      expect(p.face).toBe(0); // (+u: toward the altar)
      expect(p.r.u1).toBeLessThan(alt[0].r.u0 - 2.4);
      expect(Math.min(Math.abs(p.r.v0 - vm), Math.abs(p.r.v1 - vm))).toBeGreaterThanOrEqual(0.75 - 1e-6);
      expect(p.r.v0 > vm || p.r.v1 < vm).toBe(true);
    }
    const rows = [...new Set(pews.map((p) => p.r.u0.toFixed(3)))].map(Number).sort((a, b) => a - b);
    for (let i = 1; i < rows.length; i++) expect(rows[i] - rows[i - 1]).toBeCloseTo(0.91, 6);
  });
  it('a church that became a library is its reading room', () => {
    const fp = { ...fpOf(rect(14, 22), 'church', 9), name: 'Riverside Free Library' };
    const { P, L } = lay(fp, doorN(22, 0.3, 2.2));
    expect(P.place).toBe('library');
    expect(at(L, 0, 'library').length).toBe(1);
    expect(L.fix).toEqual([]);
  });
  it('a mosque\'s prayer hall is open floor: no pews', () => {
    const fp = { ...fpOf(rect(16, 20), 'church', 10), name: 'Masjid Al-Noor' };
    const { P, L } = lay(fp, doorN(20, 0.3, 2.2));
    expect(P.place).toBe('mosque');
    expect(at(L, 0, 'prayer').length).toBe(1);
    expect(L.fix.filter((f) => f.kind === 'pew')).toEqual([]);
  });
});

describe('a library, a bank, a post office, a gym, a pharmacy', () => {
  it('each is its own floor, its back rooms behind', () => {
    const cases: [string, string, string][] = [['library', 'library', 'staff'], ['bank', 'bank', 'staff'], ['post_office', 'post', 'stock'], ['fitness_centre', 'gym', 'staff']];
    for (const [use, floor, back] of cases) {
      const { P, L } = lay(fpOf(rect(20, 14), 'commercial', 5, use), doorN(14, 0.3, 1.8));
      expect(at(L, 0, floor).length, use).toBeGreaterThan(0);
      expect(at(L, 0, back).length, use).toBeGreaterThan(0);
      expect(P.place, use).toBeDefined();
    }
    // a big pharmacy is planned as a supermarket; a small one is a shop with its dispensary
    expect(lay(fpOf(rect(33, 50), 'commercial', 6, 'pharmacy'), doorN(50, 0.3, 1.8)).P.arch).toBe('market');
    expect(lay(fpOf(rect(16, 14), 'commercial', 5, 'pharmacy'), doorN(14, 0.3, 1.8)).P.arch).toBe('shop');
    // a big library's ground storey is its reading room, round an office core
    const big = lay(fpOf(rect(40, 30), 'commercial', 12, 'library'), doorN(30, 0.3, 1.8));
    expect(big.P.arch).toBe('office');
    expect(at(big.L, 0, 'library').length).toBeGreaterThan(0);
    expect(big.L.desks.filter((d) => d.level === 0)).toEqual([]);
  });
  it('reads what a building is from its tag, or else its name', () => {
    expect(placeOf(undefined, 'supermarket')).toBe('supermarket');
    expect(placeOf('Lincoln Library', 'pub')).toBe(null); // (a pub called "The Library" is a pub)
    expect(placeOf('University Library')).toBe('library');
    expect(placeOf('Hotel Bank Street')).toBe('hotel');
    expect(placeOf('Seaside Inn', 'restaurant')).toBe('hotel');
    expect(placeOf('First National Bank')).toBe('bank');
    expect(placeOf('Masjid Al-Noor')).toBe('mosque');
    expect(placeOf('Planet Fitness')).toBe('gym');
    expect(placeOf('Joe\'s Pizza')).toBe(null);
    expect(hotelOnlyUpstairs('The Red Lion Inn')).toBe(true);
    expect(hotelOnlyUpstairs('Holiday Inn Express & Suites')).toBe(false);
  });
});

describe('every new archetype', () => {
  const ALL: [string, Footprint, Door][] = [
    ['market', fpOf(rect(60, 40), 'commercial', 7, 'supermarket'), doorN(40, 0.3, 1.8)],
    ['restaurant', fpOf(rect(24, 16), 'commercial', 5, 'restaurant'), doorN(16, 0.3, 1.8)],
    ['hotel', fpOf(rect(60, 18), 'commercial', 16, 'hotel'), doorN(18, 0.3, 1.8)],
    ['school', fpOf(rect(60, 18), 'commercial', 12, 'school'), doorN(18, 0.3, 1.8)],
    ['church', fpOf(rect(12, 24), 'church', 12), doorN(24, 0.3, 2.2)],
    ['library', fpOf(rect(20, 14), 'commercial', 5, 'library'), doorN(14, 0.3, 1.8)],
  ];
  it('is the same building every time, and never stands a wall on a window', () => {
    for (const [name, fp, door] of ALL) {
      const a = lay(fp, door), b = lay(fp, door);
      expect(b.P, name).toEqual(a.P);
      expect(b.L, name).toEqual(a.L);
      const B = build(fp, door);
      expect(wallsOnWindows(B).map(([i, k]) => `${name} wall ${i} storey ${k}`)).toEqual([]);
      expect(wallsOnWindows2(B).map((s) => `${name} ${s}`)).toEqual([]);
    }
  });
});
