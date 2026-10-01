// The docks the map didn't draw, and the boats in them. A mapped marina (leisure=marina) is mostly
// an outline round water; the slips in it are seldom mapped. So its waterline — the shore inside or
// along the outline, read off the ground's distance-to-water field — gets finger piers every 4.5 m,
// and the slip between each pair a boat moored bow-in, as many as the month puts in the water
// (calendar.ts marinaSeason: nearly every slip in July and August, about half in October). And
// about two in five riverfront houses — a house whose lot runs down to a river, a bay or a canal,
// never the open sea's beach, with no mapped dock within 30 m — get a dock off the bulkhead and
// their own boat alongside it.
//
// Pure: the tile's json, its ground and its buildings in, piers (as the map's own `pier` lines, so
// structures.ts decks and posts them and the micro layer cleats them) and berths out. Every choice
// is a hash of position; a tile places only on its own ground.
import type { Box, Line, Terrain, WorldJson } from './data';
import type { Footprint } from './buildings';
import type { WalkWorld } from '../player/collision';
import { hashf } from '../assets/core';
import { boatMix, boatRecipe, pickFrom, type BoatType } from '../assets/kit';

type P = [number, number];
/** A generated pier: the map's `pier` line with `gen` set (data.ts Line) — 'slip' a marina's finger
 *  pier, 'dock' a house's. structures.ts builds it like any pier; props.ts moors only the berths
 *  below at it. */
export type DockLine = Line & { gen: 'slip' | 'dock' };
/** A boat's place: its middle on the water, its heading (the model's bow is −z), the boat, and the
 *  key that says whether it's in this month (u < the season's share). */
export interface Berth { x: number; z: number; yaw: number; type: BoatType; seed: number; u: number; kind: 'slip' | 'dock' }

/** Finger piers: one every SLIP m along the waterline, FINGER m long, FINGER_W wide. */
export const SLIP = 4.5, FINGER = 9, FINGER_W = 0.9;
/** A house's dock: within REACH of the water, none mapped within CLEAR m, two in five. */
const REACH = 30, CLEAR = 30, DOCK_SHARE = 0.4, DOCK_W = 1.6;

const H = (x: number, z: number, salt: number) => hashf(Math.floor(x * 4) * 73856093 ^ Math.floor(z * 4) * 19349663 ^ (salt * 83492791));
const unpack = (f: number[]): P[] => { const o: P[] = []; for (let i = 0; i + 1 < f.length; i += 2) o.push([f[i] / 10, f[i + 1] / 10]); return o; };
const pack = (pts: P[]) => pts.flatMap(([x, z]) => [Math.round(x * 10), Math.round(z * 10)]);
const inRing = (x: number, z: number, r: P[]) => {
  let ins = false;
  for (let i = 0, j = r.length - 1; i < r.length; j = i++) if (r[i][1] > z !== r[j][1] > z && x < ((r[j][0] - r[i][0]) * (z - r[i][1])) / (r[j][1] - r[i][1]) + r[i][0]) ins = !ins;
  return ins;
};
const segD = (px: number, pz: number, ax: number, az: number, bx: number, bz: number) => {
  const dx = bx - ax, dz = bz - az, L2 = dx * dx + dz * dz || 1, t = Math.max(0, Math.min(1, ((px - ax) * dx + (pz - az) * dz) / L2));
  return Math.hypot(ax + dx * t - px, az + dz * t - pz);
};
const ringD = (x: number, z: number, r: P[]) => { let b = Infinity; for (let i = 0, j = r.length - 1; i < r.length; j = i++) b = Math.min(b, segD(x, z, r[j][0], r[j][1], r[i][0], r[i][1])); return b; };
/** How far apart two segments come (0 where they cross). */
const segSeg = (a: P, b: P, c: P, d: P) => {
  const cr = (o: P, p: P, q: P) => (p[0] - o[0]) * (q[1] - o[1]) - (p[1] - o[1]) * (q[0] - o[0]);
  if (cr(a, b, c) * cr(a, b, d) < 0 && cr(c, d, a) * cr(c, d, b) < 0) return 0;
  return Math.min(segD(a[0], a[1], c[0], c[1], d[0], d[1]), segD(b[0], b[1], c[0], c[1], d[0], d[1]), segD(c[0], c[1], a[0], a[1], b[0], b[1]), segD(d[0], d[1], a[0], a[1], b[0], b[1]));
};
/** Is the ground at (x, z) fine enough to build a pier on — the region's 2 m lattice (and 150 m
 *  round it), or a tile's own pack or a streamed cell's DEM — rather than the 10 m backdrop, whose
 *  shore wanders metres off the water's edge? (structures.ts gates the map's piers the same way.) */
export function pierGround(T: Terrain, x: number, z: number) {
  return T.slice.contains(x, z, -150) || T.layer(x, z) !== T.backdrop;
}
/** Sea-level water (the shore's water is at y 0): where a boat floats at 0. A lake up a valley
 *  has its own level — no moored boats are put on it. */
export const seaLevel = (T: Terrain, x: number, z: number) => T.heightAt(x, z) < 0.4;
/** Out into the water from a point near the shore: down the distance-to-water slope (3 m baseline). */
function seaward(T: Terrain, x: number, z: number): P | null {
  const gx = T.sdfAt(x + 3, z) - T.sdfAt(x - 3, z), gz = T.sdfAt(x, z + 3) - T.sdfAt(x, z - 3), L = Math.hypot(gx, gz);
  return L > 1e-3 ? [-gx / L, -gz / L] : null;
}

/** The waterline (distance to water = 0) through a box, as polylines: marching squares on a 1.5 m
 *  grid, the pieces chained end to end (each crossing is keyed by the grid edge it lies on). */
export function waterline(T: Terrain, x0: number, z0: number, x1: number, z1: number, keep: (x: number, z: number) => boolean, g = 1.5): P[][] {
  const nx = Math.max(2, Math.ceil((x1 - x0) / g) + 1), nz = Math.max(2, Math.ceil((z1 - z0) / g) + 1);
  const v = new Float32Array(nx * nz);
  for (let j = 0; j < nz; j++) for (let i = 0; i < nx; i++) v[j * nx + i] = T.sdfAt(x0 + i * g, z0 + j * g);
  const pts = new Map<string, P>(), adj = new Map<string, string[]>();
  const cross = (key: string, ia: number, ja: number, ib: number, jb: number): string => {
    if (!pts.has(key)) {
      const a = v[ja * nx + ia], b = v[jb * nx + ib], t = Math.abs(a - b) > 1e-6 ? a / (a - b) : 0.5;
      pts.set(key, [x0 + (ia + (ib - ia) * t) * g, z0 + (ja + (jb - ja) * t) * g]);
    }
    return key;
  };
  const link = (a: string, b: string) => {
    const pa = pts.get(a)!, pb = pts.get(b)!;
    if (!keep((pa[0] + pb[0]) / 2, (pa[1] + pb[1]) / 2)) return;
    (adj.get(a) ?? adj.set(a, []).get(a)!).push(b);
    (adj.get(b) ?? adj.set(b, []).get(b)!).push(a);
  };
  for (let j = 0; j + 1 < nz; j++)
    for (let i = 0; i + 1 < nx; i++) {
      const a = v[j * nx + i] < 0, b = v[j * nx + i + 1] < 0, c = v[(j + 1) * nx + i + 1] < 0, d = v[(j + 1) * nx + i] < 0;
      const k = (a ? 1 : 0) | (b ? 2 : 0) | (c ? 4 : 0) | (d ? 8 : 0);
      if (k === 0 || k === 15) continue;
      const e0 = () => cross(`h${i},${j}`, i, j, i + 1, j), e1 = () => cross(`v${i + 1},${j}`, i + 1, j, i + 1, j + 1);
      const e2 = () => cross(`h${i},${j + 1}`, i, j + 1, i + 1, j + 1), e3 = () => cross(`v${i},${j}`, i, j, i, j + 1);
      const centreWet = (v[j * nx + i] + v[j * nx + i + 1] + v[(j + 1) * nx + i + 1] + v[(j + 1) * nx + i]) / 4 < 0;
      switch (k) {
        case 1: case 14: link(e3(), e0()); break;
        case 2: case 13: link(e0(), e1()); break;
        case 3: case 12: link(e3(), e1()); break;
        case 4: case 11: link(e1(), e2()); break;
        case 6: case 9: link(e0(), e2()); break;
        case 7: case 8: link(e3(), e2()); break;
        case 5: if (centreWet) { link(e3(), e2()); link(e0(), e1()); } else { link(e3(), e0()); link(e1(), e2()); } break;
        case 10: if (centreWet) { link(e3(), e0()); link(e1(), e2()); } else { link(e3(), e2()); link(e0(), e1()); } break;
      }
    }
  // chain: start from the ends (one neighbour), then whatever loops are left
  const used = new Set<string>(), out: P[][] = [];
  const walkFrom = (s: string) => {
    const line: P[] = [pts.get(s)!];
    let prev = '', cur = s;
    used.add(s);
    for (;;) {
      const next = (adj.get(cur) ?? []).find((n) => n !== prev && !used.has(n));
      if (!next) break;
      used.add(next);
      line.push(pts.get(next)!);
      (prev = cur), (cur = next);
    }
    if (line.length > 1) out.push(line);
  };
  const keys = [...adj.keys()].sort();
  for (const k of keys) if (!used.has(k) && adj.get(k)!.length === 1) walkFrom(k);
  for (const k of keys) if (!used.has(k)) walkFrom(k);
  return out;
}

/** Stations every `step` m along a polyline, from half a step in: point and arc length. */
function stations(line: P[], step: number) {
  const out: P[] = [];
  let carry = step / 2;
  for (let i = 0; i + 1 < line.length; i++) {
    const [ax, az] = line[i], [bx, bz] = line[i + 1], L = Math.hypot(bx - ax, bz - az);
    let t = carry;
    for (; t < L; t += step) out.push([ax + ((bx - ax) * t) / L, az + ((bz - az) * t) / L]);
    carry = t - L;
  }
  return out;
}

export interface DockInput {
  /** the tile's own entities (prim) — its marinas */
  json: WorldJson;
  /** the whole tile, margin context too — the map's piers round it */
  ctx: WorldJson;
  terrain: Terrain;
  /** the scratch walk: footprints and their stairs (a finger never starts in a building) */
  walk: Pick<WalkWorld, 'buildingAt' | 'deckAt'>;
  footprints: Footprint[];
  box?: Box;
  climate: string;
}
export interface Docks {
  lines: DockLine[];
  berths: Berth[];
  /** each marina's waterline (m) and the finger piers it took — the pack tests' measure */
  marinas: { shore: number; fingers: number }[];
  /** riverfront house lots that could take a dock (before the two-in-five) — the pack tests' measure */
  riverfront: number;
}

export function shoreDocks(I: DockInput): Docks {
  const T = I.terrain, OB = I.box;
  const own = (x: number, z: number) => !OB || (x >= OB.x0 && x < OB.x1 && z >= OB.z0 && z < OB.z1);
  const mix = boatMix(I.climate);
  // the map's own piers (and the tile's margin's): a slip or a dock keeps clear of them
  const mapped: [P, P][] = [];
  for (const l of I.ctx.lines) if (l.c === 'pier') { const p = unpack(l.p); for (let i = 0; i + 1 < p.length; i++) mapped.push([p[i], p[i + 1]]); }
  const nearMapped = (a: P, b: P, d: number) => mapped.some(([c, e]) => segSeg(a, b, c, e) < d);
  const lines: DockLine[] = [], berths: Berth[] = [], marinas: Docks['marinas'] = [];
  const placed: [P, P][] = [];
  const clearOfPlaced = (a: P, b: P, d: number) => !placed.some(([c, e]) => segSeg(a, b, c, e) < d);
  /** A boat for a slip `beam` m wide: the region's mix, the ones too wide for it passed over. */
  const boatFor = (x: number, z: number, beam: number, len: number) => {
    for (let k = 0; k < 6; k++) {
      const type = pickFrom(mix, H(x, z, 31 + k)), seed = 1, r = boatRecipe(type, seed); // (the one hull a type is drawn with: kit.ts boatLib)
      if (r.B <= beam && r.L <= len) return { type, seed };
    }
    return { type: 'skiff' as BoatType, seed: 1 };
  };

  // ---------------------------------------------------------------- marinas: finger piers and slips
  // Every marina the tile can see, its margin's too, is laid out whole — the same waterline, the
  // same stations, the same fingers in every tile that sees it — and each tile builds the fingers
  // rooted on its own ground and moors the boats lying on it, so a marina across a tile's edge
  // meets itself there.
  for (const a of I.ctx.areas) {
    if (a.c !== 'marina' || !a.o?.[0] || a.o[0].length < 6) continue;
    const ring = unpack(a.o[0]);
    let x0 = Infinity, z0 = Infinity, x1 = -Infinity, z1 = -Infinity;
    for (const [x, z] of ring) (x0 = Math.min(x0, x)), (x1 = Math.max(x1, x)), (z0 = Math.min(z0, z)), (z1 = Math.max(z1, z));
    if ((x1 - x0) * (z1 - z0) > 4e6) continue; // (a harbour-wide outline: its slips are the mapped ones)
    if (OB && (x1 < OB.x0 - 8 || x0 > OB.x1 + 8 || z1 < OB.z0 - 8 || z0 > OB.z1 + 8)) continue;
    // the shore inside the outline, or along it (an outline drawn round the basin is the bulkhead)
    const keep = (x: number, z: number) => inRing(x, z, ring) || ringD(x, z, ring) < 6;
    const shore = waterline(T, x0 - 8, z0 - 8, x1 + 8, z1 + 8, keep);
    let shoreLen = 0, nf = 0;
    for (const line of shore) {
      for (let i = 0; i + 1 < line.length; i++) if (own((line[i][0] + line[i + 1][0]) / 2, (line[i][1] + line[i + 1][1]) / 2)) shoreLen += Math.hypot(line[i + 1][0] - line[i][0], line[i + 1][1] - line[i][1]);
      // the fingers along this stretch, in order: a slip lies between each pair that stands
      const row: ({ root: P; tip: P; n: P } | null)[] = [];
      for (const [sx, sz] of stations(line, SLIP)) {
        const n = seaward(T, sx, sz);
        if (!n) { row.push(null); continue; }
        const root: P = [sx - n[0] * 0.4, sz - n[1] * 0.4], tip: P = [sx + n[0] * FINGER, sz + n[1] * FINGER];
        // (a stretch of shore the map's own docks front — their slips, their boats — takes none: the
        // finger and the slip's length past it keep a slip's width off every mapped pier)
        const reach: P = [sx + n[0] * (FINGER + 8), sz + n[1] * (FINGER + 8)];
        const ok = T.sdfAt(sx + n[0] * 4, sz + n[1] * 4) < -1.5 && T.sdfAt(tip[0], tip[1]) < -4
          // the water goes on past the tip (a channel stays open, the far bank's slips have room)
          && T.sdfAt(sx + n[0] * (FINGER + 9), sz + n[1] * (FINGER + 9)) < -3
          && I.walk.buildingAt(root[0], root[1]) < 0 && I.walk.deckAt(root[0], root[1]) === null
          && pierGround(T, root[0], root[1]) && seaLevel(T, tip[0], tip[1])
          && !nearMapped(root, reach, SLIP + 1) && clearOfPlaced(root, tip, 1.6);
        if (!ok) { row.push(null); continue; }
        row.push({ root, tip, n });
        placed.push([root, tip]);
        if (!own(root[0], root[1])) continue;
        lines.push({ c: 'pier', p: pack([root, tip]), w: FINGER_W, gen: 'slip' });
        nf++;
      }
      for (let k = 0; k + 1 < row.length; k++) {
        const A = row[k], B = row[k + 1];
        if (!A || !B || Math.hypot(A.root[0] - B.root[0], A.root[1] - B.root[1]) > SLIP * 1.25) continue;
        let nx = A.n[0] + B.n[0], nz = A.n[1] + B.n[1];
        const nl = Math.hypot(nx, nz) || 1;
        (nx /= nl), (nz /= nl);
        const mx = (A.root[0] + B.root[0]) / 2, mz = (A.root[1] + B.root[1]) / 2;
        const u = H(mx, mz, 7), { type, seed } = boatFor(mx, mz, SLIP - FINGER_W - 0.35, FINGER + 2.5);
        const r = boatRecipe(type, seed), out = 0.9 + r.L / 2; // (its bow a fender's width off the bulkhead)
        const bx = mx + nx * out, bz = mz + nz * out;
        // bow-in: the bow (the model's −z) to the bulkhead
        if (own(bx, bz)) berths.push({ x: bx, z: bz, yaw: Math.atan2(nx, nz), type, seed, u, kind: 'slip' });
      }
    }
    if (shoreLen > 0) marinas.push({ shore: shoreLen, fingers: nf });
  }

  // ---------------------------------------------------------------- riverfront houses: a dock and a boat
  let riverfront = 0;
  for (const f of I.footprints) {
    if (f.kind !== 'house' || f.door === undefined) continue;
    let cx = 0, cz = 0, rad = 0;
    for (const [x, z] of f.ring) (cx += x), (cz += z);
    (cx /= f.ring.length), (cz /= f.ring.length);
    for (const [x, z] of f.ring) rad = Math.max(rad, Math.hypot(x - cx, z - cz));
    if (!own(cx, cz) || T.sdfAt(cx, cz) > rad + REACH) continue;
    // the nearest water's edge round the house, within REACH of its walls
    let best: P | null = null, bd = Infinity;
    for (let k = 0; k < 24; k++) {
      const a = (k / 24) * Math.PI * 2, dx = Math.cos(a), dz = Math.sin(a);
      // from the wall outwards (the ring's far side along the ray)
      let w = 0;
      for (const [x, z] of f.ring) w = Math.max(w, (x - cx) * dx + (z - cz) * dz);
      for (let t = w + 1; t < w + REACH; t += 1) {
        const x = cx + dx * t, z = cz + dz * t, s = T.sdfAt(x, z);
        if (I.walk.buildingAt(x, z) >= 0) break; // (another house between it and the water: not its shore)
        if (s > 1.2) continue;
        if (t - w < bd) (bd = t - w), (best = [x, z]);
        break;
      }
    }
    if (!best) continue;
    const [sx, sz] = best;
    // a river, a bay, a canal — not the sea's beach (that's the umbrellas' and the lifeguards')
    if (T.oceanDistAt(sx, sz) < 120) continue;
    const n = seaward(T, sx, sz);
    if (!n) continue;
    const len = 6 + Math.floor(H(cx, cz, 5) * 4); // 6–9 m out
    const root: P = [sx - n[0] * 0.6, sz - n[1] * 0.6], tip: P = [sx + n[0] * len, sz + n[1] * len];
    const ok = T.sdfAt(tip[0], tip[1]) < -2.5 && T.sdfAt(sx + n[0] * (len + 14), sz + n[1] * (len + 14)) < -2
      && own(tip[0], tip[1]) && I.walk.buildingAt(root[0], root[1]) < 0 && I.walk.buildingAt(tip[0], tip[1]) < 0
      && pierGround(T, root[0], root[1]) && seaLevel(T, tip[0], tip[1]) && !nearMapped(root, tip, CLEAR);
    if (!ok) continue;
    // a riverfront lot that could have a dock: two in five do (and never two docks within 10 m)
    riverfront++;
    if (H(cx, cz, 3) >= DOCK_SHARE || !clearOfPlaced(root, tip, 10)) continue;
    placed.push([root, tip]);
    lines.push({ c: 'pier', p: pack([root, tip]), w: DOCK_W, gen: 'dock' });
    // the boat alongside, on its downstream side (by hash), bow out or in
    const s = H(cx, cz, 9) < 0.5 ? 1 : -1, px = -n[1] * s, pz = n[0] * s;
    const { type, seed } = boatFor(cx, cz, 3.2, len + 3);
    const r = boatRecipe(type, seed), along = Math.max(r.L / 2 + 0.3, len - r.L / 2 - 0.4), off = DOCK_W / 2 + r.B / 2 + 0.45;
    const bx = sx + n[0] * along + px * off, bz = sz + n[1] * along + pz * off;
    if (T.sdfAt(bx, bz) > -1.2) { lines.pop(); placed.pop(); continue; }
    const bow = H(cx, cz, 11) < 0.6 ? 1 : -1; // (most nosed in toward the house)
    berths.push({ x: bx, z: bz, yaw: Math.atan2(n[0] * bow, n[1] * bow), type, seed, u: H(cx, cz, 13) * 0.85, kind: 'dock' });
  }
  return { lines, berths, marinas, riverfront };
}

/** Is a berth's boat in the water this month? (the month's share: calendar.ts marinaSeason) */
export const berthTaken = (b: Berth, season: number) => b.u < season;
