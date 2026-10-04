// Procedural fallback tiles: cells past the baked manifest synthesize a TileJson (plus a
// ground chunk + road ribbons) from a position-driven warped street field — every answer is
// a pure function of (x, z, regionSeed), so neighbouring tiles agree on shared roads and
// lots without ever seeing each other, and every client builds the same world forever.
import * as THREE from 'three';
import earcut from 'earcut';
import type { Box, Building, Point, Road, TileJson, TileSpec } from './data';
import type { WaterBody } from './dem';
import { propMaterial } from '../render/propMaterial';
import { buildGrid, latticeHeight } from './ground';
import { MINOR, roadPaint } from './roadPalette';
import { pointInRing, ringTester } from './realTile';
import { activeStyle } from './styles';

// Region seed: stable hash of the manifest id (same bake → same synthetic world).
export function regionSeed(id: string): number {
  let h = 2166136261;
  for (let i = 0; i < id.length; i++) h = Math.imul(h ^ id.charCodeAt(i), 16777619);
  return h >>> 0;
}

// Lattice hash + smoothed value noise — pure functions of position (cross-tile continuous).
const vh = (ix: number, iz: number, seed: number) => {
  let h = (Math.imul(ix, 73856093) ^ Math.imul(iz, 19349663) ^ seed) >>> 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
};
function vnoise(x: number, z: number, cell: number, seed: number) {
  const fx = x / cell, fz = z / cell;
  const ix = Math.floor(fx), iz = Math.floor(fz), ax = fx - ix, az = fz - iz;
  const sx = ax * ax * (3 - 2 * ax), sz = az * az * (3 - 2 * az);
  const a = vh(ix, iz, seed), b = vh(ix + 1, iz, seed), c = vh(ix, iz + 1, seed), d = vh(ix + 1, iz + 1, seed);
  return a + (b - a) * sx + (c - a) * sz + (a - b - c + d) * sx * sz;
}

const PITCH = 108; // street grid spacing (m)
const ROAD_W = 6.5;

// Street centrelines: gentle sine wander — x(y) for N-S streets, z(x) for E-W ones.
const nsX = (iu: number, z: number, seed: number) => iu * PITCH + 26 * Math.sin(z * 0.006 + vh(iu, 777, seed) * 6.28);
const ewZ = (iv: number, x: number, seed: number) => iv * PITCH + 26 * Math.sin(x * 0.006 + vh(911, iv, seed) * 6.28);
// A street segment exists where the town mask wants it — towns clump, edges fray; outside
// cores the grid collapses to sparse rural lanes (every 4th line survives as an arterial).
const town = (x: number, z: number, seed: number) => vnoise(x, z, 1500, seed ^ 0x51d15e);
const segOn = (mx: number, mz: number, iu: number, iv: number, seed: number, arterial: boolean) => {
  const t = town(mx, mz, seed);
  return vh(iu * 31 + iv, iv * 17 + iu, seed ^ 0x700) < (arterial ? 0.35 + t * 0.55 : 0.08 + t * 0.8);
};

/** The street segments of grid lines iuA…iuB × ivA…ivB (north–south lines, then east–west), each
 *  its whole length whatever the ground under it — a pure function of the lines and the seed. */
function streetSegs(iuA: number, iuB: number, ivA: number, ivB: number, seed: number) {
  const out: { pts: [number, number][]; arterial: boolean }[] = [];
  for (let iu = iuA; iu <= iuB; iu++)
    for (let iv = ivA; iv <= ivB; iv++) {
      const mz = (iv + 0.5) * PITCH;
      if (!segOn(nsX(iu, mz, seed), mz, iu, iv, seed, iu % 4 === 0)) continue;
      const pts: [number, number][] = [];
      for (let z = iv * PITCH; z <= (iv + 1) * PITCH; z += 18) pts.push([nsX(iu, z, seed), z]);
      out.push({ pts, arterial: iu % 4 === 0 });
    }
  for (let iv = ivA; iv <= ivB; iv++)
    for (let iu = iuA; iu <= iuB; iu++) {
      const mx = (iu + 0.5) * PITCH;
      if (!segOn(mx, ewZ(iv, mx, seed), iu, iv, seed, iv % 4 === 0)) continue;
      const pts: [number, number][] = [];
      for (let x = iu * PITCH; x <= (iu + 1) * PITCH; x += 18) pts.push([x, ewZ(iv, x, seed)]);
      out.push({ pts, arterial: iv % 4 === 0 });
    }
  return out;
}

// ---- the stand-in's lots: a pure function of position ----
// Lots front the streets: along each street segment one candidate a side per 18 m stretch, its
// setback, size, kind and seed hashed from the segment and its own position. Along a segment they're
// kept in turn, as a street builds up (one standing too close to the last kept goes). Where
// segments meet — a corner, the next block, a street running close behind — the lot ranking higher
// by its hash wins, decided in ROUNDS rounds (Luby's): each round keeps every lot that outranks all
// its undecided rivals and drops those rivals; what's still undecided after the last round goes.
// A lot's fate so depends only on candidates within LOT_REACH of it, so any tile building with that
// much ground round its window works out the same lots as its neighbour does, lot for lot.
// (They were placed greedily in the order each tile walked its own streets: two neighbours kept
// different lots in the strip they share — a third of them — so a lot each owned could stand across
// the other's, and some stood on none: buildings doubled, overlapping or missing along the seam.)
const LOT_R = Math.hypot(16 / 2 + 14 / 2, 0.62 * 14); // the farthest a lot's outline reaches from its centre (a full-size L)
const CLASH = 2 * LOT_R + 0.5; // the farthest apart two lots can clash (outlines and the 50 cm between them)
const ROUNDS = 2;
const LOT_REACH = ROUNDS * 2 * CLASH + 2; // two rivals apart a round

export interface StandInLot {
  /** its centre; r: how far round it the lot keeps things off (its spacing, or its outline's reach) */
  x: number; z: number; r: number; ring: [number, number][];
  /** the stretch of street it fronts */
  ax: number; az: number; bx: number; bz: number;
  nx: number; nz: number; side: number; W: number;
  h: number; k: Building['k']; roof: Building['roof']; s: number;
}

/** The stand-in lots whose centres lie in `win` (edges included) — the same lots whatever the
 *  window, each one a pure function of its position and the region seed. */
export function standInLots(win: Box, seed: number): StandInLot[] {
  const W = { x0: win.x0 - LOT_REACH, z0: win.z0 - LOT_REACH, x1: win.x1 + LOT_REACH, z1: win.z1 + LOT_REACH };
  // every segment with a candidate in W (a lot stands ≤ 16 m off its street, which wanders ≤ 26 m
  // off its grid line) — and for the street test, the streets two lines further round them all
  const iuA = Math.floor((W.x0 - 60) / PITCH) - 1, iuB = Math.floor((W.x1 + 60) / PITCH) + 1;
  const ivA = Math.floor((W.z0 - 60) / PITCH) - 1, ivB = Math.floor((W.z1 + 60) / PITCH) + 1;
  const segs = streetSegs(iuA, iuB, ivA, ivB, seed);
  const SC = 16, segCells = new Map<number, number[][]>();
  for (const { pts } of streetSegs(iuA - 2, iuB + 2, ivA - 2, ivB + 2, seed))
    for (let i = 0; i + 1 < pts.length; i++) {
      const sg = [pts[i][0], pts[i][1], pts[i + 1][0], pts[i + 1][1], ROAD_W / 2 + 0.5];
      for (let u = Math.floor((Math.min(sg[0], sg[2]) - sg[4]) / SC); u <= Math.floor((Math.max(sg[0], sg[2]) + sg[4]) / SC); u++)
        for (let v = Math.floor((Math.min(sg[1], sg[3]) - sg[4]) / SC); v <= Math.floor((Math.max(sg[1], sg[3]) + sg[4]) / SC); v++) {
          const k = u * 100003 + v;
          (segCells.get(k) ?? segCells.set(k, []).get(k)!).push(sg);
        }
    }
  const inStreet = (x: number, z: number) => {
    for (const sg of segCells.get(Math.floor(x / SC) * 100003 + Math.floor(z / SC)) ?? []) {
      const ex = sg[2] - sg[0], ez = sg[3] - sg[1], L2 = ex * ex + ez * ez || 1, t = Math.max(0, Math.min(1, ((x - sg[0]) * ex + (z - sg[1]) * ez) / L2));
      if (Math.hypot(sg[0] + ex * t - x, sg[1] + ez * t - z) < sg[4]) return true;
    }
    return false;
  };
  // No lot stands in a street. Each is set back from the street it fronts, which never saw the
  // cross street at a corner or the bend of a wavy one: 8% of the stand-ins' houses stood across
  // the lanes (tools/playtest.js __ROADPOSTS__ found their pilings on the centre lines). Its outline
  // is tested, and its inside every 2 m (a street crossing it between the corners).
  const onStreet = (ring: [number, number][]) => {
    let x0 = Infinity, z0 = Infinity, x1 = -Infinity, z1 = -Infinity;
    for (const [x, z] of ring) {
      if (inStreet(x, z)) return true;
      (x0 = Math.min(x0, x)), (x1 = Math.max(x1, x)), (z0 = Math.min(z0, z)), (z1 = Math.max(z1, z));
    }
    for (let x = x0 + 1; x < x1; x += 2) for (let z = z0 + 1; z < z1; z += 2) if (pointInRing(x, z, ring) && inStreet(x, z)) return true;
    return false;
  };
  type Part = [number, number, number, number, number, number]; // an outline's rectangle: centre, its long axis, half sizes
  type Cand = StandInLot & { id: number; seg: number; sp: number; parts: Part[] };
  const mix = activeStyle().roofMix; // regional roof habit (gable / hip / rest flat)
  const shape = (cx: number, cz: number, ang: number, id: number) => {
    const L = 9 + vh(id, 3, seed) * 7, W = 8 + vh(id, 5, seed) * 6;
    const c = Math.cos(ang), s = Math.sin(ang);
    const kk = vh(id, 7, seed);
    const t = town(cx, cz, seed);
    const k: Building['k'] = kk < 0.12 && t > 0.55 ? 'commercial' : kk < 0.17 ? 'shed' : 'house';
    // ~1 in 5 houses is an L — a wing off one end, so block faces aren't comb teeth.
    const Lshape = k === 'house' && vh(id, 41, seed) < 0.2;
    const local: [number, number][] = Lshape
      ? [[-L / 2, -W / 2], [L / 2, -W / 2], [L / 2, 0], [L / 2 + W * 0.5, 0], [L / 2 + W * 0.5, W * 0.62], [-L / 2, W * 0.62]]
      : [[-L / 2, -W / 2], [L / 2, -W / 2], [L / 2, W / 2], [-L / 2, W / 2]];
    const ring = local.map(([u, v]) => [cx + u * c - v * s, cz + u * s + v * c] as [number, number]);
    // the outline as rectangles (an L is two), for telling whether two lots really overlap
    const part = (u: number, v: number, hu: number, hv: number): Part => [cx + u * c - v * s, cz + u * s + v * c, c, s, hu, hv];
    const parts = Lshape ? [part(0, W * 0.06, L / 2, W * 0.56), part(L / 2 + W / 4, W * 0.31, W / 4, W * 0.31)] : [part(0, 0, L / 2, W / 2)];
    const rv = vh(id, 11, seed);
    const roof: Building['roof'] = k === 'commercial' ? (rv < 0.7 ? 'flat' : 'gable') : rv < mix[0] ? 'gable' : rv < mix[0] + mix[1] ? 'hip' : 'flat';
    const h = k === 'commercial' ? 5 + vh(id, 13, seed) * 5 : k === 'shed' ? 2.6 : 3.4 + vh(id, 13, seed) * 5.6;
    // sp: the spacing between lots (a rule of thumb); r: how far the outline itself reaches
    return { ring, parts, sp: Math.max(L, W * 1.6) * 0.62, r: Math.max(...local.map(([u, v]) => Math.hypot(u, v))), W, k, roof, h, s: vh(id, 17, seed) * 4294967296 };
  };
  // Two lots clash when they stand closer than their spacing, or their outlines (and 50 cm round
  // them) overlap — an L's wing reaches past its spacing and stood in the next house.
  const GAP = CLASH - 2 * LOT_R;
  const clash = (a: Cand | ReturnType<typeof shape> & { x: number; z: number }, b: Cand) => {
    const d = Math.hypot(a.x - b.x, a.z - b.z);
    if (d < a.sp + b.sp) return true;
    if (d >= a.r + b.r + GAP) return false;
    for (const p of a.parts)
      for (const q of b.parts) {
        const dx = q[0] - p[0], dz = q[1] - p[1];
        let apart = false;
        for (const [ax, az] of [[p[2], p[3]], [-p[3], p[2]], [q[2], q[3]], [-q[3], q[2]]]) {
          const ext = (o: Part) => o[4] * Math.abs(o[2] * ax + o[3] * az) + o[5] * Math.abs(-o[3] * ax + o[2] * az);
          if (Math.abs(dx * ax + dz * az) >= ext(p) + ext(q) + GAP) { apart = true; break; }
        }
        if (!apart) return true;
      }
    return false;
  };
  // 1. each segment's lots, kept in turn along it (both sides as they come)
  const kept: Cand[] = [];
  segs.forEach(({ pts }, si) => {
    const D = pts.map(([x, z]) => [Math.round(x * 10), Math.round(z * 10)]); // (as the road ships: decimetres)
    const P = D.map(([x, z]) => [x / 10, z / 10]);
    const segId = ((Math.round(D[0][0] * 3) ^ Math.round(D[0][1] * 7)) >>> 0);
    const mine: Cand[] = [];
    for (let i = 0; i + 1 < P.length; i++) {
      const [ax, az] = P[i], [bx, bz] = P[i + 1];
      const dx = bx - ax, dz = bz - az, len = Math.hypot(dx, dz);
      if (len < 2) continue;
      const ux = dx / len, uz = dz / len, nx = -uz, nz = ux;
      const ang = Math.atan2(dz, dx);
      for (let d = 10, n = 0; d < len - 6; n++, d += 17 + vh(segId, n * 97, seed) * 9)
        for (const side of [-1, 1]) {
          const sb = ROAD_W / 2 + 7.5 + vh(segId ^ n, side * 31 + 5, seed) * 5; // setback varies per lot
          const lx = ax + ux * d + nx * side * sb, lz = az + uz * d + nz * side * sb;
          // (seeded from its position: the same lot from either tile)
          const id = ((Math.round(lx * 2.3) ^ Math.round(lz * 4.1) ^ (side + 1) * 77) >>> 0);
          if (vh(id, 23, seed) > 0.25 + town(lx, lz, seed) * 0.6) continue; // density follows the town mask
          const sh = { x: lx, z: lz, ...shape(lx, lz, ang, id) };
          if (mine.some((o) => clash(sh, o))) continue;
          if (onStreet(sh.ring)) continue;
          mine.push({ ax, az, bx, bz, nx, nz, side, id, seg: si, ...sh });
        }
    }
    kept.push(...mine);
  });
  // 2. rivals from other segments: rounds of "outranks every undecided rival"
  const CS = CLASH, G = new Map<number, number[]>(), n = kept.length;
  const gk = (u: number, v: number) => u * 100003 + v;
  kept.forEach((c, i) => { const k = gk(Math.floor(c.x / CS), Math.floor(c.z / CS)); (G.get(k) ?? G.set(k, []).get(k)!).push(i); });
  const rivals: number[][] = kept.map(() => []);
  kept.forEach((c, i) => {
    const u = Math.floor(c.x / CS), v = Math.floor(c.z / CS);
    for (let du = -1; du <= 1; du++)
      for (let dv = -1; dv <= 1; dv++)
        for (const j of G.get(gk(u + du, v + dv)) ?? []) {
          const o = kept[j];
          if (j > i && o.seg !== c.seg && clash(c, o)) (rivals[i].push(j), rivals[j].push(i));
        }
  });
  const rank = kept.map((c) => vh(c.id, 29, seed));
  const above = (i: number, j: number) => rank[i] > rank[j] || (rank[i] === rank[j] && (kept[i].x > kept[j].x || (kept[i].x === kept[j].x && kept[i].z > kept[j].z)));
  const state = new Uint8Array(n); // 0 undecided, 1 kept, 2 gone
  for (let r = 0; r < ROUNDS; r++) {
    const win: number[] = [];
    for (let i = 0; i < n; i++) if (state[i] === 0 && rivals[i].every((j) => state[j] !== 0 || above(i, j))) win.push(i);
    for (const i of win) state[i] = 1;
    for (const i of win) for (const j of rivals[i]) if (state[j] === 0) state[j] = 2;
  }
  const out: StandInLot[] = [];
  kept.forEach((c, i) => {
    if (state[i] !== 1 || c.x < win.x0 || c.x > win.x1 || c.z < win.z0 || c.z > win.z1) return;
    out.push({ x: c.x, z: c.z, r: Math.max(c.sp, c.r), ring: c.ring, ax: c.ax, az: c.az, bx: c.bx, bz: c.bz, nx: c.nx, nz: c.nz, side: c.side, W: c.W, h: c.h, k: c.k, roof: c.roof, s: c.s });
  });
  return out;
}

export interface SynthResult { tj: TileJson; extra: THREE.Group }

export function synthTile(spec: TileSpec, seed: number, terrain: { sdfAt(x: number, z: number): number; heightAt(x: number, z: number): number }): SynthResult {
  const box = spec.box;
  const M = 48;
  const S = { x0: box.x0 - M, z0: box.z0 - M, x1: box.x1 + M, z1: box.z1 + M };
  const land = (x: number, z: number) => terrain.sdfAt(x, z) > 1.5;

  const roads: Road[] = [];
  const buildings: Building[] = [];
  const points: Point[] = [];
  const lots: { x: number; z: number; r: number }[] = []; // placed footprint centres (overlap check)

  const ints = (pts: [number, number][]) => pts.flatMap(([x, z]) => [Math.round(x * 10), Math.round(z * 10)]);
  const own = (x: number, z: number) => (x >= box.x0 && x < box.x1 && z >= box.z0 && z < box.z1 ? undefined : 0);

  // ---- streets: N-S lines x=f(z) and E-W lines z=f(x), emitted per segment ----
  const emitRoad = (pts: [number, number][], cls: string, w: number, into: Road[]) => {
    // split into land runs; a segment is owned iff its midpoint sits in our box
    let run: [number, number][] = [];
    const flush = () => {
      if (run.length >= 2) {
        const [mx, mz] = run[Math.floor(run.length / 2)];
        // (no name: a placeholder street must never pass for a real one — on the map, a sign, the
        // place label — "all streets named synth")
        into.push({ p: ints(run), c: cls, w, own: own(mx, mz), sy: 1 });
      }
      run = [];
    };
    for (const p of pts) {
      if (land(p[0], p[1])) run.push(p);
      else flush();
    }
    flush();
  };
  // (140 m round the box on every side: a street line wanders 26 m off its grid line, so one just
  // past the box's far edge can have stretches inside it — only the near side used to be covered,
  // and those stretches belonged to no tile)
  const iu0 = Math.floor((box.x0 - 140) / PITCH), iu1 = Math.floor((box.x1 + 140) / PITCH);
  const iv0 = Math.floor((box.z0 - 140) / PITCH), iv1 = Math.floor((box.z1 + 140) / PITCH);
  for (const sg of streetSegs(iu0, iu1, iv0, iv1, seed)) emitRoad(sg.pts, sg.arterial ? 'secondary' : 'residential', ROAD_W, roads);

  // ---- buildings: lots along the streets, each owned by the tile holding its centre ----
  // Every lot is a pure function of position (standInLots): this tile and its neighbour work out
  // the same lots in the strip they share, so the margin copies are the neighbour's own lots and no
  // two lots either tile owns stand on each other. The land test comes last: a neighbour's ground
  // may not be here yet (its DEM patch), so it only ever takes a lot away, never lets one in.
  for (const lt of standInLots(S, seed)) {
    const { x: cx, z: cz } = lt;
    if (!land(lt.ax, lt.az) || !land(lt.bx, lt.bz) || !land(cx, cz)) continue; // (its street is on land here)
    if (!lt.ring.every(([x, z]) => land(x, z))) continue; // corner lots can't hang over water
    lots.push({ x: cx, z: cz, r: lt.r });
    buildings.push({ r: ints(lt.ring), h: lt.h, k: lt.k, roof: lt.roof, s: lt.s, own: own(cx, cz) });
    // An entrance point on the street face biases the door toward the street, like OSM data does.
    if (own(cx, cz) === undefined) points.push({ c: 'entrance', x: cx - lt.nx * lt.side * (lt.W / 2 + 0.4), z: cz - lt.nz * lt.side * (lt.W / 2 + 0.4) });
  }
  const nearRoad = (x: number, z: number) => {
    const iu = Math.round((x - 26 * Math.sin(z * 0.006 + vh(Math.round(x / PITCH), 777, seed) * 6.28)) / PITCH);
    const iv = Math.round((z - 26 * Math.sin(x * 0.006 + vh(911, Math.round(z / PITCH), seed) * 6.28)) / PITCH);
    return Math.min(Math.abs(x - nsX(iu, z, seed)), Math.abs(z - ewZ(iv, x, seed)));
  };
  // sparse benches along owned road stretches
  for (const rd of roads) {
    if (rd.own === 0) continue;
    const p = rd.p;
    const segId = ((Math.round(p[0] * 3) ^ Math.round(p[1] * 7)) >>> 0);
    for (let i = 0; i + 3 < p.length; i += 2) {
      const ax = p[i] / 10, az = p[i + 1] / 10, bx = p[i + 2] / 10, bz = p[i + 3] / 10;
      const dx = bx - ax, dz = bz - az, len = Math.hypot(dx, dz);
      if (len < 2) continue;
      const ux = dx / len, uz = dz / len, nx = -uz, nz = ux;
      for (let d = 20; d < len - 8; d += 65)
        if (vh(segId, Math.floor(d * 7), seed ^ 0xb3) < 0.3) {
          const bxp = ax + ux * d + nx * (ROAD_W / 2 + 2.4), bzp = az + uz * d + nz * (ROAD_W / 2 + 2.4);
          if (bxp >= box.x0 && bxp < box.x1 && bzp >= box.z0 && bzp < box.z1 && land(bxp, bzp)) points.push({ c: 'bench', x: bxp, z: bzp });
        }
    }
  }

  // ---- vegetation: jittered lattice, thinned inside towns, off road corridors ----
  for (let z = S.z0; z < S.z1; z += 17)
    for (let x = S.x0; x < S.x1; x += 17) {
      const jx = x + (vh(Math.round(x), Math.round(z), seed) - 0.5) * 15;
      const jz = z + (vh(Math.round(x) + 7, Math.round(z), seed) - 0.5) * 15;
      if (!land(jx, jz) || nearRoad(jx, jz) < ROAD_W / 2 + 3.5) continue;
      if (lots.some((o) => Math.hypot(o.x - jx, o.z - jz) < o.r + 3)) continue;
      const t = town(jx, jz, seed);
      if (vh(Math.round(x * 3), Math.round(z * 3), seed ^ 0x77ee) > 0.55 - t * 0.35) continue;
      points.push({ c: 'tree', x: jx, z: jz, own: own(jx, jz) });
    }

  const tj: TileJson = {
    version: 1, id: spec.id, lod: 0, box, slice: S, backdrop: S,
    origin: { lat: 0, lon: 0 }, buildings, roads, areas: [], lines: [], points, landmarks: [],
  };

  // ---- visuals the bake normally ships via paint/atlas: ground chunk + road ribbons ----
  const extra = new THREE.Group();
  const g = buildGrid({ x0: box.x0, z0: box.z0, x1: box.x1, z1: box.z1, step: 8 }, (x, z) => terrain.heightAt(x, z), (x, z) => terrain.sdfAt(x, z) > -45);
  if (g.index && g.index.count) {
    const gm = new THREE.Mesh(g, new THREE.ShaderMaterial());
    gm.material.userData.tag = 'gnd'; // matTag resolves this to the shared ground material
    extra.add(gm);
  }
  extra.add(roadRibbons(roads, terrain));

  return { tj, extra };
}

// The streets past the painted window: an asphalt ribbon along every real (or pencilled) street,
// in the painted ground's own colour (roadPalette.ts), so a road still reads as a road a kilometre
// out. Near the walker the painted ground carries the street — lanes, kerbs, sidewalks, crossings
// — and the ribbon steps aside (propMaterial PAVED discards inside the detail window).
//   Hills: the ribbon follows the ground in stations a few metres apart wherever a straight quad
// would stray from it (a Seattle block climbs 20 m), and each station is a real cross-section —
// both kerbs and the crown — riding the rendered ground (the 8 m lattice, never under it). It
// used to be two independently draped strips 2 cm apart, asphalt over a wider sidewalk: on
// bumpy ground the sidewalk won as often as not, and the streets went pale and blotchy.
export function roadRibbons(roads: Road[], terrain: { heightAt(x: number, z: number): number }, step = 8) {
  const pos: number[] = [], nrm: number[] = [], col: number[] = [], idx: number[] = [];
  const STEP = 3.5, TOL = 0.04, LIFT = 0.06;
  const hAt = (x: number, z: number) => terrain.heightAt(x, z);
  const H = (x: number, z: number) => Math.max(hAt(x, z), latticeHeight(hAt, x, z, step));
  const st = activeStyle(), arid = st.climate === 'arid';
  const c = new THREE.Color();
  const sec: number[] = []; // one segment's section vertices (x, y, z) × 3 per station
  for (const rd of roads) {
    // mapped sidewalks and paths are the painted ground's (a pale line a kilometre out is noise);
    // bridges are their decks
    if (rd.own === 0 || rd.sw || rd.br || rd.tu || MINOR.has(rd.c)) continue;
    c.set(roadPaint(rd, st.region, arid));
    const p = rd.p, hw = rd.w / 2;
    for (let i = 0; i + 3 < p.length; i += 2) {
      const ax = p[i] / 10, az = p[i + 1] / 10, bx = p[i + 2] / 10, bz = p[i + 3] / 10;
      const dx = bx - ax, dz = bz - az, len = Math.hypot(dx, dz);
      if (len < 1.5) continue;
      const ux = dx / len, uz = dz / len, nx = -uz, nz = ux;
      // extended 0.6 m past each end so bends close over
      const sx = ax - ux * 0.6, sz = az - uz * 0.6, ex = bx + ux * 0.6, ez = bz + uz * 0.6, L = len + 1.2;
      // does the ground along it (both kerbs and the crown) stray from a straight line? stations
      let n = 1;
      if (L > STEP * 1.5) {
        let dev = 0;
        for (const o of [-hw, 0, hw]) {
          const h0 = H(sx + nx * o, sz + nz * o), h1 = H(ex + nx * o, ez + nz * o);
          for (let t = 0.25; t < 1; t += 0.25) dev = Math.max(dev, Math.abs(H(sx + (ex - sx) * t + nx * o, sz + (ez - sz) * t + nz * o) - (h0 + (h1 - h0) * t)));
        }
        if (dev > TOL) n = Math.min(64, Math.ceil(L / STEP));
      }
      sec.length = 0;
      for (let k = 0; k <= n; k++) {
        const t = k / n, cx = sx + (ex - sx) * t, cz = sz + (ez - sz) * t;
        for (const o of [-hw, 0, hw]) { const x = cx + nx * o, z = cz + nz * o; sec.push(x, H(x, z) + LIFT, z); }
      }
      const base = pos.length / 3;
      for (let k = 0; k <= n; k++)
        for (let s = 0; s < 3; s++) {
          const o = (k * 3 + s) * 3;
          pos.push(sec[o], sec[o + 1], sec[o + 2]);
          // the normal from the section's own slope: along the street and across it
          const kp = Math.min(n, k + 1), km = Math.max(0, k - 1), sp = Math.min(2, s + 1), sm = Math.max(0, s - 1);
          const a0 = (km * 3 + s) * 3, a1 = (kp * 3 + s) * 3, c0 = (k * 3 + sm) * 3, c1 = (k * 3 + sp) * 3;
          const tx = sec[a1] - sec[a0], ty = sec[a1 + 1] - sec[a0 + 1], tz = sec[a1 + 2] - sec[a0 + 2];
          const qx = sec[c1] - sec[c0], qy = sec[c1 + 1] - sec[c0 + 1], qz = sec[c1 + 2] - sec[c0 + 2];
          let mx = ty * qz - tz * qy, my = tz * qx - tx * qz, mz = tx * qy - ty * qx;
          if (my < 0) (mx = -mx), (my = -my), (mz = -mz);
          const ml = Math.hypot(mx, my, mz) || 1;
          nrm.push(mx / ml, my / ml, mz / ml);
          col.push(c.r, c.g, c.b);
        }
      for (let k = 1; k <= n; k++) {
        const q = base + (k - 1) * 3; // previous station: q (one kerb), q+1 (crown), q+2 (the other)
        idx.push(q, q + 4, q + 3, q, q + 1, q + 4, q + 1, q + 5, q + 4, q + 1, q + 2, q + 5); // facing up
      }
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('normal', new THREE.Float32BufferAttribute(nrm, 3));
  geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  geo.setIndex(idx);
  const m = new THREE.Mesh(geo, propMaterial({ paved: true }));
  return m;
}

// Real-lite tiles (worker-served OSM data) need the same visuals the bake gets from
// paint/atlas: a ground chunk, asphalt ribbons along the REAL road centrelines, and
// water sheets over the tile's water/coast areas (the terrain has no shore data here).
const WET: Record<string, [number, number, number]> = { water: [0.32, 0.44, 0.55], beach: [0.82, 0.75, 0.58] };

/** A ring clipped to a box (Sutherland–Hodgman, one edge of the box at a time). */
function clipRing(r: [number, number][], b: Box): [number, number][] {
  let out = r;
  const edges: [(p: [number, number]) => number][] = [[(p) => p[0] - b.x0], [(p) => b.x1 - p[0]], [(p) => p[1] - b.z0], [(p) => b.z1 - p[1]]];
  for (const [d] of edges) {
    const inp = out;
    out = [];
    for (let i = 0; i < inp.length; i++) {
      const a = inp[(i + inp.length - 1) % inp.length], c = inp[i], da = d(a), dc = d(c);
      if (dc >= 0) {
        if (da < 0) out.push([a[0] + ((c[0] - a[0]) * da) / (da - dc), a[1] + ((c[1] - a[1]) * da) / (da - dc)]);
        out.push(c);
      } else if (da >= 0) out.push([a[0] + ((c[0] - a[0]) * da) / (da - dc), a[1] + ((c[1] - a[1]) * da) / (da - dc)]);
    }
    if (out.length < 3) return [];
  }
  return out;
}

/** Flat water sheets for the lakes, ponds and rivers among `bodies`, each at its level and
 *  clipped to `box` (the sea has none: its ground is cut away and the ocean plane shows). */
/** Every triangle of a flat sheet facing up (+y), whichever way the map's ring winds (earcut keeps the
 *  ring's own order): a sheet's back is culled, so a sheet wound the other way was a hole. In place. */
export function faceUp(flat: number[], idx: number[]): number[] {
  for (let t = 0; t + 2 < idx.length; t += 3) {
    const a = idx[t] * 2, b = idx[t + 1] * 2, c = idx[t + 2] * 2;
    // (the face normal's y: (B − A) × (C − A), in the x–z plane)
    const ny = (flat[b + 1] - flat[a + 1]) * (flat[c] - flat[a]) - (flat[b] - flat[a]) * (flat[c + 1] - flat[a + 1]);
    if (ny < 0) [idx[t + 1], idx[t + 2]] = [idx[t + 2], idx[t + 1]];
  }
  return idx;
}

export function waterSheets(bodies: WaterBody[], box: Box): THREE.Group {
  const g = new THREE.Group(), col = WET.water;
  for (const w of bodies) {
    if (w.level === undefined) continue;
    const outer = clipRing(w.ring, box);
    if (outer.length < 3) continue;
    const holes = (w.holes ?? []).map((q) => clipRing(q, box)).filter((q) => q.length >= 3);
    const rings = [outer, ...holes], flat: number[] = [], hIdx: number[] = [];
    for (const r of rings) {
      if (r !== outer) hIdx.push(flat.length / 2);
      for (const [x, z] of r) flat.push(x, z);
    }
    const idx = earcut(flat, hIdx.length ? hIdx : undefined);
    if (!idx.length) continue;
    faceUp(flat, idx);
    const pos: number[] = [], nrm: number[] = [], cc: number[] = [];
    for (let i = 0; i < flat.length; i += 2) (pos.push(flat[i], w.level + 0.06, flat[i + 1]), nrm.push(0, 1, 0), cc.push(col[0], col[1], col[2]));
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    geo.setAttribute('normal', new THREE.Float32BufferAttribute(nrm, 3));
    geo.setAttribute('color', new THREE.Float32BufferAttribute(cc, 3));
    geo.setIndex(idx);
    // the water shader at the sheet's level (pack.ts rebuilds the tag as water.ts lakeMaterial):
    // ripples and the sky in it, like the sea's — a flat colour only before the sea is built
    const m = propMaterial();
    m.userData.tag = 'lake';
    const mesh = new THREE.Mesh(geo, m);
    mesh.name = 'lake';
    mesh.renderOrder = 5;
    g.add(mesh);
  }
  return g;
}

export function realExtras(tj: TileJson, terrain: { sdfAt(x: number, z: number): number; heightAt(x: number, z: number): number }, step = 8, bodies?: WaterBody[]): THREE.Group {
  const box = tj.box;
  const extra = new THREE.Group();
  const unpack = (f: number[]): [number, number][] => {
    const out: [number, number][] = [];
    for (let i = 0; i + 1 < f.length; i += 2) out.push([f[i] / 10, f[i + 1] / 10]);
    return out;
  };
  // (an island — a hole in its water — keeps its ground; each ring's box is checked first, a lake's
  // outline runs to thousands of vertices and the ground asks once a quad)
  // (a big ring — a Great Lake's whole outline rides in every cell on its shore — is tested by row:
  // ringTester, the same answers)
  const ringOf = (f: number[]) => {
    const r = unpack(f);
    const b = r.reduce((b, [x, z]) => [Math.min(b[0], x), Math.min(b[1], z), Math.max(b[2], x), Math.max(b[3], z)], [Infinity, Infinity, -Infinity, -Infinity]);
    return { r, b, at: r.length > 64 ? ringTester(r, box.z0 - 64, box.z1 + 64) : (x: number, z: number) => pointInRing(x, z, r) };
  };
  const inR = (x: number, z: number, q: ReturnType<typeof ringOf>) => x >= q.b[0] && x <= q.b[2] && z >= q.b[1] && z <= q.b[3] && q.at(x, z);
  // (only water cuts the ground: a wetland — a swamp, a marsh — is land, coloured by the paint. Cut
  // like a lake, its hole was covered by a one-sided sheet that faced down for half of them, by their
  // ring's winding, and the sea plane showed through tens of metres below: blue ground with grass
  // growing out of it wherever New Jersey's land-use survey mapped a wooded swamp)
  const wet = tj.areas.filter((a) => a.c === 'water').map((a) => ({ o: a.o.map(ringOf), i: a.i.map(ringOf) }));
  const inWater = (x: number, z: number) => wet.some((w) => w.o.some((q) => inR(x, z, q)) && !w.i.some((q) => inR(x, z, q)));
  // (a hilly cell's ground is 4 m, fine enough to show its streets' cuts and fills; else 8 m)
  const g = buildGrid({ x0: box.x0, z0: box.z0, x1: box.x1, z1: box.z1, step }, (x, z) => terrain.heightAt(x, z), (x, z) => terrain.sdfAt(x, z) > -45 && !inWater(x, z));
  if (g.index && g.index.count) {
    const gm = new THREE.Mesh(g, new THREE.ShaderMaterial());
    gm.material.userData.tag = 'gnd';
    extra.add(gm);
  }
  extra.add(roadRibbons(tj.roads, terrain, step));
  // Water sheets: flat tinted polygons — a lake or a pond at one level (its shore's lowest
  // ground, where the water stands), not draped over the DEM: near a shore the DEM is a smear
  // between the bluff and the bathymetry (Elliott Bay read +15 m a hundred metres out), and a
  // draped sheet tilted through the air. The sea itself gets no sheet: its ground is cut away
  // (above) and the ocean plane at sea level shows through, waves and all.
  // (the worker hands the cell's water bodies with their levels — the ones its ground was cut to
  // — and each sheet is clipped to the cell: a lake four cells long is four sheets, not four lakes)
  if (bodies) extra.add(waterSheets(bodies, box));
  for (const a of tj.areas) {
    const col = WET[a.c];
    if (!col || a.k === 'sea' || (bodies && a.c === 'water')) continue;
    // the level: a low percentile of the shore's ground (a DEM spike on a bank can't lift it)
    let level = 0;
    if (a.c === 'water') {
      const hs: number[] = [];
      for (const r of a.o) for (let i = 0; i + 1 < r.length; i += 2) hs.push(terrain.heightAt(r[i] / 10, r[i + 1] / 10));
      hs.sort((p, q) => p - q);
      level = Math.max(0, hs[Math.floor(hs.length * 0.1)] ?? 0);
    }
    const outers = a.o.map(unpack).filter((r) => r.length >= 3);
    const inners = a.i.map(unpack).filter((r) => r.length >= 3);
    for (const pts of outers) {
      // earcut handles holes: outer ring first, then each inner ring as a hole.
      const rings = [pts, ...inners];
      const flat = rings.flatMap((r) => r.flat());
      const holes = inners.length ? inners.reduce<number[]>((hs, _r, i) => [...hs, pts.length + inners.slice(0, i).reduce((n, rr) => n + rr.length, 0)], []) : undefined;
      const idx = earcut(flat, holes);
      if (!idx.length) continue;
      faceUp(flat, idx);
      const pos: number[] = [], nrm: number[] = [], cc: number[] = [];
      for (const ring of rings)
        for (const [x, z] of ring) {
          pos.push(x, (a.c === 'water' ? level : terrain.heightAt(x, z)) + 0.06, z);
          nrm.push(0, 1, 0);
          cc.push(col[0], col[1], col[2]);
        }
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
      geo.setAttribute('normal', new THREE.Float32BufferAttribute(nrm, 3));
      geo.setAttribute('color', new THREE.Float32BufferAttribute(cc, 3));
      geo.setIndex(idx);
      extra.add(new THREE.Mesh(geo, propMaterial()));
    }
  }
  return extra;
}
