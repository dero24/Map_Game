import { describe, it, expect } from 'vitest';
import { WalkWorld } from '../src/player/collision';
import type { Terrain } from '../src/world/data';
import { planInterior, registerPlan, layoutInterior, registerLayout } from '../src/world/interiors';
import type { Footprint, Door } from '../src/world/buildings';

// Flat dry land at 0.5 m everywhere.
const terrain = { heightAt: () => 0.5, sdfAt: () => 50 } as unknown as Terrain;
const bounds = { x0: -500, z0: -500, x1: 500, z1: 500 };
// A 12 x 8 m two-storey house centred on the origin, front door in the north wall (z = -4).
const ring: [number, number][] = [[-6, -4], [6, -4], [6, 4], [-6, 4]];
const fp: Footprint = { ring, base: 0.2, top: 6.7, floor0: 0.5, raise: 0, kind: 'house', eave: 6.5, seed: 0.42, id: 0 };
const door: Door = { x: 0, z: -4.2, y: 0.5, nx: 0, nz: -1, fx: 0, fz: -5.4, fy: 0.5, b: 0, w: 1.0, h: 2.15, wx: 0, wz: -4, col: 0 };

// Walk in a straight line the way the controller does (feet follow the surface, walls know your height).
function walkLine(w: WalkWorld, x: number, z: number, dx: number, dz: number, steps: number, feet0: number) {
  let feet = feet0;
  for (let i = 0; i < steps; i++) {
    [x, z] = w.move(x, z, dx, dz, 0.32, feet);
    const t = w.surfaceAt(x, z, feet);
    feet += (t - feet) * (t > feet ? 0.7 : 0.5);
  }
  return { x, z, feet };
}

describe('walking into buildings', () => {
  const w = new WalkWorld(terrain, bounds);
  const plan = planInterior('t:0', fp, door, 1234);
  registerPlan(w, fp, plan);
  // (the rooms' partitions go in when the house is walked up to — here, straight away)
  const layout = layoutInterior(plan, fp);
  registerLayout(w, plan, layout);
  const F = plan.flights[0];
  const vc = F ? (F.v0 + F.v1) / 2 : 0;
  const at = (u: number, v = vc): [number, number] => [plan.cx + plan.ux * u + plan.vx * v, plan.cz + plan.uz * u + plan.vz * v];

  it('plans two storeys with a stair flight that fits inside the house', () => {
    expect(plan.levels).toBe(2);
    expect(plan.flights.length).toBe(1);
    expect(Math.min(F.u0, F.u1)).toBeGreaterThanOrEqual(-plan.L / 2);
    expect(Math.max(F.u0, F.u1)).toBeLessThanOrEqual(plan.L / 2);
    expect(Math.min(F.v0, F.v1)).toBeGreaterThanOrEqual(-plan.W / 2);
    expect(Math.max(F.v0, F.v1)).toBeLessThanOrEqual(plan.W / 2);
    // no partition runs across the flight on the storey it climbs from
    for (const wl of layout.walls.filter((q) => q.level === F.level)) {
      const [c0, c1, a0, a1] = wl.ax === 0 ? [F.v0, F.v1, F.u0, F.u1] : [F.u0, F.u1, F.v0, F.v1];
      const across = wl.c > Math.min(c0, c1) + 0.05 && wl.c < Math.max(c0, c1) - 0.05;
      expect(across && Math.min(wl.b, Math.max(a0, a1)) - Math.max(wl.a, Math.min(a0, a1)) > 0.05).toBe(false);
    }
    expect(planInterior('t:0', fp, door, 1234)).toEqual(plan); // deterministic
    expect(layoutInterior(planInterior('t:0', fp, door, 1234), fp)).toEqual(layout);
  });

  it('lets you through the front door but not through the wall', () => {
    const through = walkLine(w, 0, -7, 0, 0.1, 60, 0.5);
    expect(through.z).toBeGreaterThan(-3);
    const wall = walkLine(w, 3, -7, 0, 0.1, 60, 0.5);
    expect(wall.z).toBeLessThan(-4.2);
  });

  it('stands you on the right storey', () => {
    expect(w.surfaceAt(0, 0, 0.5)).toBeCloseTo(0.5);
    expect(w.surfaceAt(0, 0, 3.4)).toBeCloseTo(3.4);
    expect(w.surfaceAt(0, -10, 0.5)).toBeCloseTo(0.5);
  });

  it('street life walks the open-air surface, never an upper floor', () => {
    expect(w.surfaceAt(0, 0)).toBeGreaterThan(3); // the highest floor under the point
    expect(w.outdoorSurfaceAt(0, 0)).toBeLessThan(0.6); // the ground outside the same point
  });

  it('climbs the stairs by walking, and walks back down them', () => {
    const dir = Math.sign(F.topU - F.bottomU);
    const [sx, sz] = at(F.bottomU - dir * 0.6), [tx, tz] = at(F.topU + dir * 0.5);
    const n = 120;
    const up = walkLine(w, sx, sz, (tx - sx) / n, (tz - sz) / n, n, 0.5);
    expect(Math.hypot(up.x - tx, up.z - tz)).toBeLessThan(0.3);
    expect(up.feet).toBeCloseTo(3.4, 1);
    const down = walkLine(w, up.x, up.z, (sx - tx) / n, (sz - tz) / n, n, up.feet);
    expect(Math.hypot(down.x - sx, down.z - sz)).toBeLessThan(0.3);
    expect(down.feet).toBeCloseTo(0.5, 1);
  });

  it('keeps you out of the stairwell upstairs and out of the stair sides downstairs', () => {
    // upstairs, beside the opening, walking across it: the banister stops you
    const openSide = F.v0 > 0 ? F.v0 : F.v1, beyond = F.v0 > 0 ? F.v0 - 1.2 : F.v1 + 1.2;
    const um = (F.u0 + F.u1) / 2;
    const [ax, az] = at(um, beyond), [bx, bz] = at(um, (F.v0 + F.v1) / 2);
    const n = 40;
    const up = walkLine(w, ax, az, (bx - ax) / n, (bz - az) / n, n, 3.4);
    expect(up.feet).toBeCloseTo(3.4, 1); // didn't fall through
    const vReached = (up.x - plan.cx) * plan.vx + (up.z - plan.cz) * plan.vz;
    expect(Math.abs(vReached - openSide)).toBeGreaterThan(0.25);
    // downstairs, the same walk: the side of the staircase stops you too
    const down = walkLine(w, ax, az, (bx - ax) / n, (bz - az) / n, n, 0.5);
    expect(down.feet).toBeCloseTo(0.5, 1);
    const vDown = (down.x - plan.cx) * plan.vx + (down.z - plan.cz) * plan.vz;
    expect(Math.abs(vDown - openSide)).toBeGreaterThan(0.25);
  });
});

describe('tile scopes (streamed unload)', () => {
  const w = new WalkWorld(terrain, bounds);
  const houseA: [number, number][] = [[-40, -4], [-30, -4], [-30, 4], [-40, 4]];
  const houseB: [number, number][] = [[30, -4], [40, -4], [40, 4], [30, 4]];
  w.beginScope(11); // "tile" A
  w.addPolygon(houseA);
  w.addWall([-55, -6], [-55, 6]); // a vertical wall blocking eastward travel
  w.addDeck({ pts: [[-55, -1], [-55, 1]], cum: [0, 2], halfWidth: 0.5, heightAt: () => 2 });
  w.endScope();
  w.beginScope(22); // "tile" B
  w.addPolygon(houseB);
  w.endScope();

  it('collides with both scopes before unload', () => {
    expect(w.buildingAt(-35, 0)).toBeGreaterThanOrEqual(0);
    expect(w.buildingAt(35, 0)).toBeGreaterThanOrEqual(0);
    expect(w.blocked(-54.7, 0, 0.5)).toBe(true);
    expect(w.deckAt(-55, 0)).toBeCloseTo(2);
  });

  it('drops only the unloaded scope', () => {
    w.removeScope(11);
    expect(w.buildingAt(-35, 0)).toBe(-1);
    expect(w.blocked(-54.7, 0, 0.5)).toBe(false);
    expect(w.deckAt(-55, 0)).toBeNull();
    expect(w.buildingAt(35, 0)).toBeGreaterThanOrEqual(0); // tile B untouched
    // walking through where tile A's wall stood now works; tile B's wall still stops you
    const through = walkLine(w, -58, 0, 0.1, 0, 80, 0.5);
    expect(through.x).toBeGreaterThan(-50);
    const blocked = walkLine(w, 28, 0, 0.1, 0, 80, 0.5);
    expect(blocked.x).toBeLessThan(30);
  });
});

describe('an open building\'s own scope', () => {
  it('its partitions come and go all session: purged from the grid, their ids reused, nothing else disturbed', () => {
    const w = new WalkWorld(terrain, bounds);
    w.beginScope(5); // a tile's wall at x = 0
    w.addWall([0, -5], [0, 5]);
    w.endScope();
    for (let n = 0; n < 3; n++) {
      w.withScope(-7, () => { w.addWall([3, -5], [3, 5]); w.addWall([6, -5], [6, 5]); });
      expect(w.touching(3.1, 0, 0.3)).toBe(true);
      w.removeScope(-7, true);
      expect(w.touching(3.1, 0, 0.3)).toBe(false);
      expect(w.touching(0.1, 0, 0.3)).toBe(true);
    }
    expect((w as unknown as { segs: unknown[] }).segs.length).toBe(3); // (three walls' worth of ids, not seven)
  });
});

describe('an unloaded tile\'s walls, purged a slice a frame', () => {
  it('stop blocking at once, leave the grid over several calls, and only then are their ids reused', () => {
    const w = new WalkWorld(terrain, bounds);
    const priv = w as unknown as { segs: unknown[]; segFree: number[]; segDead: number[]; grid: Map<number, number[]> };
    const street = (dx: number) => { for (let i = 0; i < 2000; i++) { const x = 10 + dx + (i % 50) * 0.8, z = -20 + Math.floor(i / 50); w.addWall([x, z], [x + 0.5, z]); } };
    w.withScope(9, () => w.addWall([0, -5], [0, 5])); // the next tile's wall, staying
    w.withScope(3, () => street(0)); // the tile that unloads: 2000 short walls over 40 × 40 m
    expect(w.touching(10.25, -19.8, 0.3)).toBe(true);
    w.removeScope(3, 'later');
    expect(w.touching(10.25, -19.8, 0.3)).toBe(false); // gone at once…
    expect(w.purging).toBe(2000); // …still in the grid, a slice a frame
    w.withScope(4, () => w.addWall([90, 90], [91, 90])); // a wall meanwhile: a new id, none of those
    expect(priv.segs.length).toBe(2002);
    let calls = 0, early = 0;
    while (w.purging) { w.purgeSome(0); calls++; if (w.purging) early += priv.segFree.length; } // (a 0 ms share: one step a call)
    expect(calls).toBeGreaterThan(4); // (in steps, not at once)
    expect(early).toBe(0); // (no id free while a cell might still hold it)
    let stale = 0;
    for (const l of priv.grid.values()) for (const id of l) if (priv.segDead[id]) stale++;
    expect(stale).toBe(0);
    expect(priv.segFree.length).toBe(2000);
    expect(w.touching(0.1, 0, 0.3)).toBe(true); // the other tiles' walls untouched
    expect(w.touching(90.5, 90.1, 0.3)).toBe(true);
    w.withScope(5, () => street(100)); // the next tile in: every freed id reused
    expect(priv.segs.length).toBe(2002);
    expect(w.touching(110.25, -19.8, 0.3)).toBe(true);
    expect(w.touching(10.25, -19.8, 0.3)).toBe(false);
  });
  it('a scope dropped twice over, or empty, queues nothing', () => {
    const w = new WalkWorld(terrain, bounds);
    w.withScope(3, () => w.addWall([0, -5], [0, 5]));
    w.removeScope(3, 'later');
    w.removeScope(3, 'later');
    w.beginScope(6); w.endScope();
    w.removeScope(6, 'later');
    expect(w.purging).toBe(1);
    w.purgeSome();
    expect(w.purging).toBe(0);
    w.purgeSome(); // (nothing queued: nothing to do)
  });
});

describe('raised shore houses', () => {
  const w = new WalkWorld(terrain, bounds);
  const r2: [number, number][] = [[20, -4], [30, -4], [30, 4], [20, 4]];
  const raised: Footprint = { ring: r2, base: 0.2, top: 10, floor0: 3.3, raise: 2.8, kind: 'house', eave: 8, seed: 0.7, id: 1 };
  const d2: Door = { x: 25, z: -4.2, y: 3.3, nx: 0, nz: -1, fx: 25, fz: -9.4, fy: 0.5, b: 1, w: 1.0, h: 2.15, wx: 25, wz: -4, col: 0 };
  const plan = planInterior('t:1', raised, d2, 77);
  registerPlan(w, raised, plan);
  // the porch stair (built by buildings.ts in the game): a ramp deck from the foot up to the door
  w.addDeck({ pts: [[25, -9.4], [25, -4.2]], cum: [0, 5.2], halfWidth: 0.6, heightAt: (s) => 0.5 + (2.8 * Math.min(1, s / 4.2)) });

  it('lets you walk between the pilings underneath', () => {
    const under = walkLine(w, 22, -8, 0, 0.15, 40, 0.5);
    expect(under.z).toBeGreaterThan(-4); // walked in under the floor
    expect(under.feet).toBeCloseTo(0.5, 1);
    expect(w.interiorAt(under.x, under.z, under.feet)).toBe(-1); // not "inside"
  });

  it('climbs the front steps and goes in at floor level', () => {
    const inn = walkLine(w, 25, -9.6, 0, 0.1, 80, 0.5);
    expect(inn.z).toBeGreaterThan(-3.5);
    expect(inn.feet).toBeCloseTo(3.3, 1);
    expect(w.interiorAt(inn.x, inn.z, inn.feet)).toBeGreaterThanOrEqual(0);
  });
});

describe('big floorplates', () => {
  // a 60 x 30 m block, door mid-way along the long north wall. (These used to be one hall cut by
  // cross walls every ~10 m — Plan.parts; the rooms are laid out now, docs/INTERIORS_PLAN.md §3:
  // an office's core and open plan, a block's corridor and flats. tests/interiorLayout.test.ts
  // holds the detailed rules; this keeps the headline.)
  const big: [number, number][] = [[-30, -15], [30, -15], [30, 15], [-30, 15]];
  const bdoor: Door = { ...door, z: -15.2, fz: -16.4, wz: -15 };
  const mk = (kind: string, use?: string): Footprint => ({ ring: big, base: 0.2, top: 12, floor0: 0.5, raise: 0, kind, use, eave: 11.8, seed: 0.3, id: 7 });
  const area = (r: { u0: number; u1: number; v0: number; v1: number }) => (r.u1 - r.u0) * (r.v1 - r.v0);
  it('an office, a civic hall or an apartment block is rooms off a core or corridor, never one hall', () => {
    for (const f of [mk('commercial', 'office'), mk('commercial', 'townhall'), mk('large')]) {
      const p = planInterior('t:b', f, bdoor, 99);
      const L = layoutInterior(p, f);
      for (let k = 0; k < p.levels; k++) expect(L.rooms.filter((r) => r.level === k).length).toBeGreaterThanOrEqual(6);
      expect(L.walls.length).toBeGreaterThan(10);
      expect(L.doors.length).toBeGreaterThan(5);
      // a flat's rooms (not the open plan of an office) stay room-sized
      const rooms = L.rooms.filter((r) => !['open', 'lobby', 'corridor', 'shop', 'hall', 'landing'].includes(r.type));
      expect(Math.max(...rooms.map((r) => area(r.r)))).toBeLessThanOrEqual(38);
    }
  });
  it('a supermarket stays an open floor of aisles; a small house is a hall with rooms off it', () => {
    const g = mk('commercial', 'supermarket');
    const Lg = layoutInterior(planInterior('t:g', g, bdoor, 99), g);
    const sales = Lg.rooms.filter((r) => r.level === 0 && r.type === 'shop').reduce((a, r) => a + area(r.r), 0);
    expect(sales).toBeGreaterThan(0.6 * 60 * 30);
    const Lh = layoutInterior(planInterior('t:0', fp, door, 1234), fp);
    for (const k of [0, 1]) expect(Lh.rooms.filter((r) => r.level === k && !['hall', 'landing'].includes(r.type)).length).toBeGreaterThanOrEqual(3);
  });
});

describe('never through a wall, never shut in', () => {
  // a solid block with its south face on z = 0 (no door): you stand on the street side, z < 0
  const block: [number, number][] = [[-10, 0], [10, 0], [10, 8], [-10, 8]];
  const w = new WalkWorld(terrain, bounds);
  w.addPolygon(block);
  it('a long step (a slow frame at a run, a fast car) stops at the wall instead of passing it', () => {
    // 0.33 m out, then a 0.6 m step: in one piece it landed 0.27 m past the wall's line and was
    // pushed out on the inside
    expect(w.move(0, -0.33, 0, 0.6, 0.32)[1]).toBeLessThan(-0.3);
    // a car (1.05 m) at 38 m/s over a 0.05 s frame
    expect(w.move(0, -1.1, 0, 1.9, 1.05)[1]).toBeLessThan(-1);
    expect(w.buildingAt(...w.move(0, -0.33, 0, 0.6, 0.32))).toBe(-1);
  });
  it('someone in a building\'s rooms is not "in a wall"; someone in a wall is', () => {
    const w2 = new WalkWorld(terrain, bounds);
    registerPlan(w2, fp, planInterior('t:0', fp, door, 1234));
    expect(w2.blocked(0, 0, 0.28)).toBe(true); // (inside a footprint: `blocked` says so)
    expect(w2.touching(0, 0, 0.28, 0.5)).toBe(false); // but no wall runs through you
    expect(w2.touching(3, -3.9, 0.28, 0.5)).toBe(true); // standing in the front wall
  });
});
