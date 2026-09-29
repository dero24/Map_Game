// Shared checks for interior plans (tests/interiorLayout.test.ts, tests/interiorBudget.test.ts):
// a physical flood fill of the walkable rooms from the front door through the WalkWorld, the
// windows each partition lands on, and the rooms of a synthetic building.
import { WalkWorld } from '../../src/player/collision';
import type { Terrain } from '../../src/world/data';
import type { Footprint, Door } from '../../src/world/buildings';
import { planInterior, registerPlan, toW, endOK, LocalPoly, wallWindows, onWindow, unstack, type Plan } from '../../src/world/interior/plan';
import { layoutInterior, registerLayout, type Layout, type Room } from '../../src/world/interior/layout';

export type P2 = [number, number];
export const terrain = { heightAt: () => 0.5, sdfAt: () => 50, genIn: () => 0 } as unknown as Terrain;
export const rect = (L: number, W: number): P2[] => [[-L / 2, -W / 2], [L / 2, -W / 2], [L / 2, W / 2], [-L / 2, W / 2]];
export const fpOf = (ring: P2[], kind: string, top: number, use?: string, seed = 0.3, id = 7): Footprint => ({ ring, base: 0.2, top, floor0: 0.5, raise: 0, kind, use, eave: top - 0.2, seed, id });
/** A door in the north wall (z = −W/2) at x, `w` wide. */
export const doorN = (W: number, x = 0.3, w = 1): Door => ({ x, z: -W / 2 - 0.2, y: 0.5, nx: 0, nz: -1, fx: x, fz: -W / 2 - 1.4, fy: 0.5, b: 0, w, h: 2.15, wx: x, wz: -W / 2, col: 0 });

/** A lift's shaft and a double-height lobby's void: nobody's rooms (no floor, no door, nothing in them). */
export const nobodys = (r: Room) => r.type === 'shaft' || r.type === 'void';

export interface Built { fp: Footprint; P: Plan; L: Layout; w: WalkWorld }
export function build(fp: Footprint, door: Door, seed = 99): Built {
  const w = new WalkWorld(terrain, { x0: -500, z0: -500, x1: 500, z1: 500 });
  const P = planInterior('t', fp, door, seed);
  registerPlan(w, fp, P);
  const L = layoutInterior(P, fp);
  registerLayout(w, P, L);
  return { fp, P, L, w };
}

/** Walk everywhere reachable from outside the front door (a walker of radius 0.32, feet following
 *  the floors, stairs and landings, never dropping more than 0.4 m in a step). A lattice of steps
 *  rarely lines up with a 0.8 m doorway the way a player steers through one, so each doorway and
 *  each flight is also tried as a straight walk from a step before it to a step past it — still
 *  through the collision world, never around it. Returns the rooms reached and the points visited. */
export function flood(b: Built, step = 0.35, from?: [number, number, number], feet?: [number, number]) {
  const { w, fp } = b;
  const P = unstack(b.P); // (a tall building's stairs: every storey's flight)
  const d = P.door;
  const ring = fp.ring;
  const inside = (x: number, z: number) => {
    let c = false;
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) if (ring[i][1] > z !== ring[j][1] > z && x < ((ring[j][0] - ring[i][0]) * (z - ring[i][1])) / (ring[j][1] - ring[i][1]) + ring[i][0]) c = !c;
    return c;
  };
  const f = (k: number) => P.floor0 + k * P.floorH;
  // portals: [from, to] pairs of (x, z, feet) — both ways through each doorway, up and down each flight
  const portals: [number, number, number, number, number, number][] = [];
  const W = (u: number, v: number) => toW(P, u, v);
  for (const dw of b.L.doors) {
    const [a0, a1] = dw.ax === 0 ? [W(dw.t, dw.c - 0.5), W(dw.t, dw.c + 0.5)] : [W(dw.c - 0.5, dw.t), W(dw.c + 0.5, dw.t)];
    portals.push([a0[0], a0[1], f(dw.level), a1[0], a1[1], f(dw.level)], [a1[0], a1[1], f(dw.level), a0[0], a0[1], f(dw.level)]);
  }
  for (const F of P.flights) {
    const dir = Math.sign(F.topU - F.bottomU) || 1, c = F.axis ? (F.u0 + F.u1) / 2 : (F.v0 + F.v1) / 2;
    const lo = f(F.level) + (F.lo ?? 0) * P.floorH, hi = f(F.level) + (F.hi ?? 1) * P.floorH;
    const bot = F.axis ? W(c, F.bottomU - dir * 0.45) : W(F.bottomU - dir * 0.45, c), topP = F.axis ? W(c, F.topU + dir * 0.45) : W(F.topU + dir * 0.45, c);
    portals.push([bot[0], bot[1], lo, topP[0], topP[1], hi], [topP[0], topP[1], hi, bot[0], bot[1], lo]);
  }
  const walkTo = (x: number, z: number, ft: number, tx: number, tz: number) => {
    for (let i = 0; i < 60; i++) {
      const dx = tx - x, dz = tz - z, l = Math.hypot(dx, dz);
      if (l < 0.03) return [x, z, ft] as const;
      const s = Math.min(0.12, l);
      [x, z] = w.move(x, z, (dx / l) * s, (dz / l) * s, 0.32, ft);
      const t = w.surfaceAt(x, z, ft);
      if (t < ft - 0.4) return null;
      ft = t;
    }
    return Math.hypot(tx - x, tz - z) < 0.05 ? ([x, z, ft] as const) : null;
  };
  // (portals by 2 m cell and storey height: a point only tries the ones within reach)
  const near = new Map<string, number[]>();
  const cellOf = (x: number, z: number, ft: number) => `${Math.floor(x / 2)},${Math.floor(z / 2)},${Math.round(ft / 0.5)}`;
  portals.forEach((p, i) => {
    for (let a = Math.floor((p[0] - 1.6) / 2); a <= Math.floor((p[0] + 1.6) / 2); a++)
      for (let c = Math.floor((p[1] - 1.6) / 2); c <= Math.floor((p[1] + 1.6) / 2); c++)
        for (const dy of [-0.5, 0, 0.5]) {
          const k = `${a},${c},${Math.round((p[2] + dy) / 0.5)}`;
          const l = near.get(k);
          if (l) l.push(i); else near.set(k, [i]);
        }
  });
  const seen = new Set<string>();
  const pts: [number, number, number][] = [];
  // (cells half a step wide: a full step always leaves the cell it starts in)
  const key = (x: number, z: number, ft: number) => `${Math.round((2 * x) / step)},${Math.round((2 * z) / step)},${Math.round(ft / 0.5)}`;
  const start: [number, number, number] = from ?? [d.x + d.nx * 0.4, d.z + d.nz * 0.4, d.y];
  const q: [number, number, number][] = [start];
  seen.add(key(...start));
  const used = new Set<number>();
  const dirs: P2[] = [];
  for (let a = 0; a < 8; a++) dirs.push([Math.cos((a * Math.PI) / 4) * step, Math.sin((a * Math.PI) / 4) * step]);
  const push = (x: number, z: number, t: number, force = false) => {
    const k = key(x, z, t);
    if (seen.has(k) && !force) return;
    seen.add(k);
    q.push([x, z, t]);
  };
  while (q.length) {
    const [x, z, ft] = q.pop()!;
    pts.push([x, z, ft]);
    if (feet && (ft < feet[0] || ft > feet[1])) continue; // (a tall building's storeys built: the flood stays on them)
    for (const [dx, dz] of dirs) {
      const [nx, nz] = w.move(x, z, dx, dz, 0.32, ft);
      if (Math.hypot(nx - x, nz - z) < step * 0.3) continue;
      if (!inside(nx, nz) && Math.hypot(nx - d.x, nz - d.z) > 1.2) continue;
      const t = w.surfaceAt(nx, nz, ft);
      if (t < ft - 0.4) continue; // a fall
      push(nx, nz, t);
    }
    for (const i of near.get(cellOf(x, z, ft)) ?? []) {
      const p = portals[i];
      if (used.has(i) || Math.abs(p[2] - ft) > 0.3 || Math.hypot(p[0] - x, p[1] - z) > 1.6) continue;
      const a = walkTo(x, z, ft, p[0], p[1]);
      if (!a) continue;
      const bq = walkTo(a[0], a[1], a[2], p[3], p[4]);
      if (!bq || Math.abs(bq[2] - p[5]) > 0.3) continue;
      used.add(i);
      push(bq[0], bq[1], bq[2], true);
    }
  }
  const reached = new Set<number>();
  // (out of the front door: a point on the step outside it)
  const out = pts.some(([x, z]) => !inside(x, z) && Math.hypot(x - d.x, z - d.z) < 1.2);
  for (const [x, z, ft] of pts) {
    const u = (x - P.cx) * P.ux + (z - P.cz) * P.uz, v = (x - P.cx) * P.vx + (z - P.cz) * P.vz;
    for (const r of b.L.rooms) {
      if (nobodys(r)) continue; // (a lift's shaft: walled all round; an atrium's void: no floor)
      if (reached.has(r.id) || Math.abs(ft - f(r.level)) > 0.3) continue;
      if (u > r.r.u0 + 0.05 && u < r.r.u1 - 0.05 && v > r.r.v0 + 0.05 && v < r.r.v1 - 0.05) reached.add(r.id);
    }
  }
  return { reached, pts, out };
}

/** Walkable spots the flood never reached: a grid over every storey, skipping the stairs, the
 *  space a wall takes and any spot off the floor — each must lie within reach of a flooded point.
 *  (A pocket there is somewhere a walker could be shut in.) */
export function pockets(b: Built, pts: [number, number, number][], grid = 0.7, reach = 0.75) {
  const { w } = b;
  const P = unstack(b.P);
  const f = (k: number) => P.floor0 + k * P.floorH;
  const cell = new Map<string, [number, number, number][]>();
  const ck = (x: number, z: number, k: number) => `${Math.floor(x / reach)},${Math.floor(z / reach)},${k}`;
  for (const p of pts) {
    const k = Math.round((p[2] - P.floor0) / P.floorH);
    if (Math.abs(p[2] - f(k)) > 0.1) continue;
    const key = ck(p[0], p[1], k);
    const l = cell.get(key);
    if (l) l.push(p); else cell.set(key, [p]);
  }
  const stairs = [...P.flights, ...P.landings, ...P.holes, ...(P.lifts ?? []).map((L) => L.r)];
  const out: string[] = [];
  const M = P.main;
  for (let k = 0; k < P.levels; k++)
    for (let u = M.u0 + grid / 2; u < M.u1; u += grid)
      for (let v = M.v0 + grid / 2; v < M.v1; v += grid) {
        if (stairs.some((S) => u > Math.min(S.u0, S.u1) - 0.45 && u < Math.max(S.u0, S.u1) + 0.45 && v > Math.min(S.v0, S.v1) - 0.45 && v < Math.max(S.v0, S.v1) + 0.45)) continue;
        const [x, z] = toW(P, u, v);
        if (w.touching(x, z, 0.34, f(k)) || Math.abs(w.surfaceAt(x, z, f(k)) - f(k)) > 0.05) continue;
        let ok = false;
        for (let a = -1; a <= 1 && !ok; a++)
          for (let c = -1; c <= 1 && !ok; c++)
            for (const p of cell.get(`${Math.floor(x / reach) + a},${Math.floor(z / reach) + c},${k}`) ?? []) if (Math.hypot(p[0] - x, p[1] - z) <= reach) { ok = true; break; }
        if (!ok) out.push(`storey ${k} at u ${u.toFixed(1)} v ${v.toFixed(1)}`);
      }
  return out;
}

/** Partitions that meet the facade on a window: [wall index, storey]. */
export function wallsOnWindows(b: Built) {
  const { P, L, fp } = b;
  const LP = new LocalPoly(P.loc);
  const M = { kind: P.kind, eave: fp.eave, fo: fp.floor0 - fp.base, glass: !!P.glass };
  const bad: [number, number][] = [];
  L.walls.forEach((wl, i) => {
    for (const [end, dir] of [[wl.a, -1], [wl.b, 1]] as const) {
      const [u, v, du, dv] = wl.ax === 0 ? [end, wl.c, dir, 0] : [wl.c, end, 0, dir];
      if (!endOK(LP, M, wl.level, u, v, du, dv, 0)) bad.push([i, wl.level]);
    }
  });
  return bad;
}
/** Same check, independently: the facade windows of each ring edge against every wall end that
 *  lies on it (the along-edge distance must clear the window's frame by the wall's half thickness). */
export function wallsOnWindows2(b: Built) {
  const { P, L, fp } = b;
  const M = { kind: P.kind, eave: fp.eave, fo: fp.floor0 - fp.base, glass: !!P.glass };
  const bad: string[] = [];
  const loc = P.loc;
  for (const wl of L.walls) {
    for (const end of [wl.a, wl.b]) {
      const [u, v] = wl.ax === 0 ? [end, wl.c] : [wl.c, end];
      for (let i = 0; i < loc.length; i++) {
        const a = loc[i], c = loc[(i + 1) % loc.length];
        const ex = c[0] - a[0], ey = c[1] - a[1], len = Math.hypot(ex, ey);
        const t = ((u - a[0]) * ex + (v - a[1]) * ey) / (len * len);
        const dist = Math.abs((u - a[0]) * ey - (v - a[1]) * ex) / len;
        if (t < 0 || t > 1 || dist > 0.03) continue;
        const Wn = wallWindows(len, wl.level, M);
        if (Wn && onWindow(Wn, t * len, 0.06)) bad.push(`storey ${wl.level} edge ${i} at ${(t * len).toFixed(2)} of ${len.toFixed(2)}`);
      }
    }
  }
  return bad;
}

export const realRooms = (L: Layout, k: number) => L.rooms.filter((r) => r.level === k && !['hall', 'landing', 'corridor', 'lobby', 'stair', 'lift'].includes(r.type));
export const area = (r: Room) => (r.r.u1 - r.r.u0) * (r.r.v1 - r.r.v0);
export const minWidth = (r: Room) => Math.min(r.r.u1 - r.r.u0, r.r.v1 - r.r.v0);
export { toW };
