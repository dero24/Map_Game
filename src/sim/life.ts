// Renderer side of ambient life: builds the static world description for the worker (road graph, beach,
// water), owns the shared snapshot buffers, and draws gulls / cars / people / boats as instanced meshes,
// interpolating between sim ticks and animating wings and legs in the vertex shader.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import type { Road, World } from '../world/data';
import type { WalkWorld } from '../player/collision';
import type { Door } from '../world/buildings';
import { U, GLSL_NOISE } from '../render/shared';
import { CAPS, H, RANGES, S, SIM_HZ, layout, views, type LifeInit } from './protocol';
import { CAR_TYPES, carMix, carLib, boatLib, pickFrom, carRecipe, type BoatType } from '../assets/kit';
import { gearGeometry, gearFor, TAXI_PAINT, type CarGear } from '../assets/furniture';
import { hashf } from '../assets/core';
import { propMaterial } from '../render/propMaterial';
import { activeStyle } from '../world/styles';
import { personLib, warmthFor } from '../assets/people';
import { dogLib, critterMaterial, DOG_COATS } from '../assets/fauna';
import { PED } from './lifeSim';

// Moving boats offshore: the working/pleasure mix (skiffs and pontoons stay moored near shore).
const LIFE_BOATS: BoatType[] = ['console', 'cabin', 'sail', 'lobster', 'skiff'];
const LIFE_GEAR: CarGear[] = ['rack', 'surf', 'kayak', 'cargo', 'taxi'];
const ROOF = Object.fromEntries(CAR_TYPES.map((t) => [t, carRecipe(t, 1).roof])) as Record<(typeof CAR_TYPES)[number], number>;

export const lifeParams = { density: 1, enabled: true };

import { RANK, STOP_BACK, unpackJunctions } from './traffic';

/** A street keeps no graph node where only a footway meets it within this far of a junction: the
 *  widest setback (12 m) and the stop line behind it, plus room to brake from a main road's speed. */
/** How much kerb a parked car takes: none, parallel, angled bays (kerbside.ts: centred w/2 − 1.15 / w/2 − 2.5). */
const KERB_W = [0, 2.3, 5.0];
const FOOT_SPLIT = 12 + STOP_BACK + 16;

// ---------------- worker init data ----------------
// The slice-scoped parts of the sim world (beach, water, downtown, seaward) are static per region —
// computed once. The road graph and door list rebuild when the streamed tile set changes.
export interface LifeBase {
  seed: number;
  bounds: [number, number, number, number];
  beachPts: Float32Array;
  waterGrid: Uint8Array;
  waterG: [number, number, number, number, number];
  downtown: [number, number, number, number];
  seaward: [number, number];
  rhythm?: import('./protocol').Rhythm;
}

export function buildLifeBase(world: World, walk: WalkWorld): LifeBase {
  const { json, terrain } = world;
  const S0 = json.slice;
  // Sand near the surf, for gulls to land on and beach walkers to wander; seaward = down the ocean-distance slope.
  const beach: number[] = [];
  let sx = 0, sz = 0;
  for (let z = S0.z0 + 20; z < S0.z1 - 20; z += 6)
    for (let x = S0.x0 + 20; x < S0.x1 - 20; x += 6) {
      const d = terrain.sdfAt(x, z);
      if (d < 3 || d > 55 || terrain.oceanDistAt(x, z) > 70 || walk.blocked(x, z, 1)) continue;
      beach.push(x, terrain.heightAt(x, z), z);
      sx += terrain.oceanDistAt(x - 8, z) - terrain.oceanDistAt(x + 8, z);
      sz += terrain.oceanDistAt(x, z - 8) - terrain.oceanDistAt(x, z + 8);
    }
  const sl = Math.hypot(sx, sz);
  const seaward: [number, number] = sl > 1e-6 ? [sx / sl, sz / sl] : [1, 0];

  // Downtown = where the shops are: the middle half of the commercial buildings in the slice.
  const shops: [number, number][] = [];
  for (const b of json.buildings) {
    if (b.k !== 'commercial' || b.lod) continue;
    const x = b.r[0] / 10, z = b.r[1] / 10;
    if (x > S0.x0 && x < S0.x1 && z > S0.z0 && z < S0.z1) shops.push([x, z]);
  }
  const q = (a: number[], t: number) => a.sort((m, n) => m - n)[Math.floor(t * (a.length - 1))];
  const downtown: [number, number, number, number] = shops.length > 4
    ? [q(shops.map((s) => s[0]), 0.2) - 40, q(shops.map((s) => s[1]), 0.2) - 40, q(shops.map((s) => s[0]), 0.8) + 40, q(shops.map((s) => s[1]), 0.8) + 40]
    : [S0.x0, S0.z0, S0.x1, S0.z1];

  const cell = 8;
  const gw = Math.ceil((S0.x1 - S0.x0) / cell), gh = Math.ceil((S0.z1 - S0.z0) / cell);
  const water = new Uint8Array(gw * gh);
  for (let j = 0; j < gh; j++)
    for (let i = 0; i < gw; i++) {
      const x = S0.x0 + (i + 0.5) * cell, z = S0.z0 + (j + 0.5) * cell;
      water[j * gw + i] = terrain.sdfAt(x, z) < -14 && x < S0.x1 - 40 && x > S0.x0 + 40 && z > S0.z0 + 40 && z < S0.z1 - 40 ? 1 : 0;
    }
  // Bounds only steer gulls/home anchors — synthetic tiles keep the world (and its road
  // graph) going well past the bake, so agents get a generous 20 km apron, not the slice.
  const PAD = 10000;
  return { seed: 20260923, bounds: [S0.x0 - PAD, S0.z0 - PAD, S0.x1 + PAD, S0.z1 + PAD], beachPts: new Float32Array(beach), waterGrid: water, waterG: [S0.x0, S0.z0, cell, gw, gh], downtown, seaward };
}

export function buildLifeInit(base: LifeBase, roads: Road[], walk: WalkWorld, doors: Door[], junc: Float32Array[] = [], tunnels: Road[] = []): LifeInit {
  const g = lifeInitSteps(base, roads, walk, doors, junc, tunnels);
  let r = g.next();
  while (!r.done) r = g.next();
  return r.value;
}

// Road vertices by position — the same 0.5 m rounding as the junction analysis (traffic.ts vkey) —
// in an open-addressing table on the two integers: a city's loaded ring has ~200k vertices, and
// the string key built for every one of them (several times over) was most of a rebuild.
class VertexTable {
  readonly X: Int32Array;
  readonly Z: Int32Array;
  private used: Uint8Array;
  private mask: number;
  constructor(n: number) {
    let cap = 1024;
    while (cap < n * 2) cap *= 2;
    this.X = new Int32Array(cap);
    this.Z = new Int32Array(cap);
    this.used = new Uint8Array(cap);
    this.mask = cap - 1;
  }
  get capacity() { return this.mask + 1; }
  private home(X: number, Z: number) {
    let h = Math.imul(X, 0x9e3779b1) ^ Math.imul(Z + 0x632be5ab, 0x85ebca77);
    h ^= h >>> 15;
    return h & this.mask;
  }
  /** The slot of the vertex at (x, z), taken if new. */
  slot(x: number, z: number) {
    const X = Math.round(x * 2), Z = Math.round(z * 2);
    let h = this.home(X, Z);
    while (this.used[h]) {
      if (this.X[h] === X && this.Z[h] === Z) return h;
      h = (h + 1) & this.mask;
    }
    this.used[h] = 1;
    this.X[h] = X;
    this.Z[h] = Z;
    return h;
  }
  /** The slot of the vertex at (x, z), or −1. */
  find(x: number, z: number) {
    const X = Math.round(x * 2), Z = Math.round(z * 2);
    for (let h = this.home(X, Z); this.used[h]; h = (h + 1) & this.mask) if (this.X[h] === X && this.Z[h] === Z) return h;
    return -1;
  }
}
/** Commercial doors within 25 m of a point: the doors in 50 m cells, looked up by the cell and its
 *  eight neighbours (a flat grid over the doors' extent — Map lookups on every third sample of
 *  every street were a tenth of the rebuild). Null when there are none. */
function shopCounter(doors: Door[]): ((x: number, z: number) => number) | null {
  let i0 = Infinity, j0 = Infinity, i1 = -Infinity, j1 = -Infinity, n = 0;
  for (const d of doors) {
    if (d.kind !== 'commercial') continue;
    const i = Math.floor(d.fx / 50), j = Math.floor(d.fz / 50);
    i0 = Math.min(i0, i), i1 = Math.max(i1, i), j0 = Math.min(j0, j), j1 = Math.max(j1, j);
    n++;
  }
  if (!n) return null;
  const gw = i1 - i0 + 3, gh = j1 - j0 + 3; // (a rim of empty cells: neighbours never fall off)
  if (gw * gh > 1 << 22) {
    // doors spread over hundreds of km (never the loaded ring): the plain map
    const cells = new Map<string, number[]>();
    for (const d of doors) if (d.kind === 'commercial') { const k = `${Math.floor(d.fx / 50)},${Math.floor(d.fz / 50)}`; (cells.get(k) ?? cells.set(k, []).get(k)!).push(d.fx, d.fz); }
    return (x, z) => {
      let c = 0;
      const ci = Math.floor(x / 50), cj = Math.floor(z / 50);
      for (let di = -1; di <= 1; di++) for (let dj = -1; dj <= 1; dj++) { const l = cells.get(`${ci + di},${cj + dj}`); if (l) for (let m = 0; m < l.length; m += 2) if (Math.hypot(l[m] - x, l[m + 1] - z) < 25) c++; }
      return c;
    };
  }
  const cell = (d: Door) => (Math.floor(d.fz / 50) - j0 + 1) * gw + (Math.floor(d.fx / 50) - i0 + 1);
  const at = new Int32Array(gw * gh + 1);
  for (const d of doors) if (d.kind === 'commercial') at[cell(d) + 1]++;
  for (let c = 0; c < gw * gh; c++) at[c + 1] += at[c];
  const fill = at.slice(), xz = new Float64Array(n * 2);
  for (const d of doors) if (d.kind === 'commercial') { const k = fill[cell(d)]++; xz[k * 2] = d.fx; xz[k * 2 + 1] = d.fz; }
  return (x, z) => {
    const ci = Math.floor(x / 50) - i0 + 1, cj = Math.floor(z / 50) - j0 + 1;
    let c = 0;
    for (let dj = -1; dj <= 1; dj++) {
      const j = cj + dj;
      if (j < 0 || j >= gh) continue;
      for (let di = -1; di <= 1; di++) {
        const i = ci + di;
        if (i < 0 || i >= gw) continue;
        for (let k = at[j * gw + i], e = at[j * gw + i + 1]; k < e; k++) if (Math.hypot(xz[k * 2] - x, xz[k * 2 + 1] - z) < 25) c++;
      }
    }
    return c;
  };
}
// The walk surface under each edge sample (every ~4 m) is the costly part of a rebuild; a piece's
// heights are kept while its road lives and the ground under it holds (WalkWorld.surfaceGen: its
// terrain cell took no new patch). A piece over a cell border is read afresh every time.
const heightCache = new WeakMap<object, WeakMap<Road, Map<number, { gen: number; h: Float64Array }>>>();

/** The build in slices: it yields every few hundred samples, so a caller can spread a city's
 *  rebuild over frames (main.ts, ~4 ms a frame) — in one go it was half a second, every time a
 *  tile mounted on a drive through Seattle. Draining it gives exactly buildLifeInit. */
export function* lifeInitSteps(base: LifeBase, roads: Road[], walk: WalkWorld, doors: Door[], junc: Float32Array[] = [], tunnels: Road[] = []): Generator<void, LifeInit, void> {
  let work = 0;
  // the ways cars and walkers use
  const ways: Road[] = [];
  let nv = 0;
  for (const list of [roads, tunnels])
    for (const r of list) {
      if (r.lod || r.own === 0 || !(r.c in RANK) || r.c === 'steps') continue;
      ways.push(r);
      nv += r.p.length >> 1;
    }
  // their vertices' slots in one table
  const T = new VertexTable(nv), wk: Int32Array[] = [];
  for (const r of ways) {
    const n = r.p.length >> 1, k = new Int32Array(n);
    for (let i = 0; i < n; i++) k[i] = T.slot(r.p[2 * i] / 10, r.p[2 * i + 1] / 10);
    wk.push(k);
    if ((work += n) > 8000) { work = 0; yield; }
  }
  // Split ways wherever they share a vertex with another way, so intersections become graph nodes —
  // except a street where only a footway meets it near a junction (a mapped crosswalk, a path at
  // the corner): a car's approach must run unbroken past the junction's stop line, or it arrives
  // on a 5 m stub already "in the box" and skips the lights, the stop sign and the queue beyond
  // (Seattle maps a crossing on every arm of every junction — 70% of its junction arms were
  // stubs, and its traffic drove through itself). The crossing still joins its two halves there.
  const cap = T.capacity;
  const use = new Int32Array(cap), arms = new Int32Array(cap);
  const drives = new Int32Array(cap); // drivable ways through each vertex
  for (let w = 0; w < ways.length; w++) {
    const k = wk[w], n = k.length, car = (RANK[ways[w].c] ?? 0) >= 2;
    for (let i = 0; i < n; i++) {
      use[k[i]]++;
      if (car) {
        arms[k[i]] += i === 0 || i === n - 1 ? 1 : 2;
        drives[k[i]]++;
      }
    }
  }
  yield;
  // pieces: way, first vertex, last vertex
  const pw: number[] = [], pa: number[] = [], pb: number[] = [];
  for (let w = 0; w < ways.length; w++) {
    const P = ways[w].p, k = wk[w], n = k.length, car = (RANK[ways[w].c] ?? 0) >= 2;
    // along this street, how far each vertex is from the nearest junction (≥ 3 drivable arms)
    let near: Float32Array | null = null;
    if (car) {
      near = new Float32Array(n).fill(Infinity);
      for (const dir of [1, -1]) {
        let run = Infinity;
        for (let m = 0; m < n; m++) {
          const i = dir > 0 ? m : n - 1 - m;
          if (m) run += Math.hypot(P[2 * i] / 10 - P[2 * (i - dir)] / 10, P[2 * i + 1] / 10 - P[2 * (i - dir) + 1] / 10);
          if (arms[k[i]] >= 3) run = 0;
          near[i] = Math.min(near[i], run);
        }
      }
    }
    let a = 0;
    for (let i = 1; i < n - 1; i++)
      if (use[k[i]] > 1 && (!car || drives[k[i]] > 1 || near![i] >= FOOT_SPLIT)) {
        pw.push(w), pa.push(a), pb.push(i);
        a = i;
      }
    if (n - 1 > a) pw.push(w), pa.push(a), pb.push(n - 1);
    if ((work += n) > 8000) { work = 0; yield; }
  }
  const nodeOf = new Int32Array(cap).fill(-1); // slot → graph node
  const nodeXZ: number[] = [];
  let nNodes = 0;
  const node = (s: number, x: number, z: number) => {
    if (nodeOf[s] < 0) { nodeOf[s] = nNodes++; nodeXZ.push(x, z); }
    return nodeOf[s];
  };
  const pts: number[] = [], start: number[] = [], count: number[] = [], lens: number[] = [], info: number[] = [], ends: number[] = [], kerb: number[] = [];
  const seen = new Set<string>();
  // Tunnel portals: the ends a tunnel piece shares with a street in the open. A car goes down
  // into the ground from there (8% a metre, to 9 m under) and is out of sight until it climbs out.
  const open = new Uint8Array(cap);
  for (let q = 0; q < pw.length; q++) if (!ways[pw[q]].tu) open[wk[pw[q]][pa[q]]] = open[wk[pw[q]][pb[q]]] = 1;
  let byRoad = heightCache.get(walk);
  if (!byRoad) heightCache.set(walk, (byRoad = new WeakMap()));
  const surfaceGen = typeof walk.surfaceGen === 'function' ? walk.surfaceGen : null; // (test stand-ins have none)
  const cum: number[] = [];
  for (let q = 0; q < pw.length; q++) {
    const r = ways[pw[q]], P = r.p, k = wk[pw[q]], a = pa[q], b = pb[q];
    const X = (i: number) => P[2 * i] / 10, Z = (i: number) => P[2 * i + 1] / 10;
    cum.length = 0;
    cum.push(0);
    for (let i = a + 1; i <= b; i++) cum.push(cum[cum.length - 1] + Math.hypot(X(i) - X(i - 1), Z(i) - Z(i - 1)));
    const L = cum[cum.length - 1];
    if (L < 1) continue;
    // the same street twice (a way mapped twice, a route drawn over its road): one edge, or the
    // cars on the two copies drive through each other
    const ka = k[a], kb = k[b];
    const dup = `${Math.min(ka, kb)}|${Math.max(ka, kb)}|${Math.round(L)}|${k[a + ((b - a + 1) >> 1)]}`;
    if (seen.has(dup)) continue;
    seen.add(dup);
    const n = Math.max(2, Math.ceil(L / 4) + 1);
    // uniform resample with heights from the open-air walk surface (so bridge decks carry traffic,
    // and a way that clips a building doesn't climb to its roof)
    start.push(pts.length / 3);
    const under = !!r.tu, oa = under && open[ka] === 1, ob = under && open[kb] === 1;
    let x0 = Infinity, z0 = Infinity, x1 = -Infinity, z1 = -Infinity;
    for (let i = a; i <= b; i++) { const x = X(i), z = Z(i); if (x < x0) x0 = x; if (x > x1) x1 = x; if (z < z0) z0 = z; if (z > z1) z1 = z; }
    const gen = surfaceGen ? surfaceGen.call(walk, x0, z0, x1, z1) : -1;
    const ck = (a * 16777216 + b) * 4 + (oa ? 2 : 0) + (ob ? 1 : 0);
    const kept = gen >= 0 ? byRoad.get(r)?.get(ck) : undefined;
    const hs = kept && kept.gen === gen && kept.h.length === n ? kept.h : null;
    const fresh = hs ? null : new Float64Array(n);
    let j0 = 0;
    for (let j = 0; j < n; j++) {
      const s = (j / (n - 1)) * L;
      while (j0 < b - a - 1 && cum[j0 + 1] < s) j0++;
      const t = (s - cum[j0]) / Math.max(1e-6, cum[j0 + 1] - cum[j0]);
      const x = X(a + j0) + (X(a + j0 + 1) - X(a + j0)) * t, z = Z(a + j0) + (Z(a + j0 + 1) - Z(a + j0)) * t;
      let y: number;
      if (hs) y = hs[j];
      else {
        const deep = under ? Math.min(9, 0.08 * Math.min(oa ? s : Infinity, ob ? L - s : Infinity)) : 0;
        y = fresh![j] = walk.outdoorSurfaceAt(x, z) - deep;
        if ((work += 16) > 8000) { work = 0; yield; }
      }
      pts.push(x, y, z);
    }
    if (fresh && gen >= 0) {
      let m = byRoad.get(r);
      if (!m) byRoad.set(r, (m = new Map()));
      m.set(ck, { gen, h: fresh });
    }
    count.push(n);
    lens.push(L);
    info.push(RANK[r.c], r.w, r.ow ? 1 : 0, under ? 0 : 1); // (nobody walks a tunnel)
    // the kerb the parked cars take, where kerbside.ts parks them (parallel 2.3 m, angled bays 5 m):
    // the moving lanes are laid out between them
    const parks = !!r.pk && !r.lod && !r.br && !r.tu && r.w >= 10;
    kerb.push(parks ? KERB_W[r.pk! & 3] : 0, parks ? KERB_W[(r.pk! >> 2) & 3] : 0);
    ends.push(node(ka, X(a), Z(a)), node(kb, X(b), Z(b)));
    if ((work += n + 8) > 8000) { work = 0; yield; }
  }
  // Frontage: shops along each street piece (commercial doors within 25 m of it). People walk
  // where the shops are — a Midtown avenue fills, a residential side street stays quiet.
  const within = shopCounter(doors);
  const shops: number[] = [];
  for (let e = 0; e < start.length; e++) {
    let n = 0;
    if (within) for (let j = 0; j < count[e]; j += 3) n += within(pts[(start[e] + j) * 3], pts[(start[e] + j) * 3 + 2]);
    shops.push(Math.min(40, n / Math.max(1, Math.ceil(count[e] / 3)) * 3)); // ~doors within reach, per stretch
    if ((work += count[e]) > 8000) { work = 0; yield; }
  }
  const nEdges = lens.length;
  const deg = new Int32Array(nNodes + 1);
  for (let e = 0; e < nEdges; e++) (deg[ends[e * 2] + 1]++), (deg[ends[e * 2 + 1] + 1]++);
  for (let i = 0; i < nNodes; i++) deg[i + 1] += deg[i];
  const fill = deg.slice();
  const adj = new Int32Array(deg[nNodes]);
  for (let e = 0; e < nEdges; e++) for (const nd of [ends[e * 2], ends[e * 2 + 1]]) adj[fill[nd]++] = e;
  yield;

  // Junction control: each node takes the record of the tile that owns its junction; each arriving
  // edge end takes the control of the arm it runs along.
  const armCtl = new Uint8Array(nEdges * 2), nodeKey = new Float32Array(nNodes), nodeSet = new Float32Array(nNodes);
  for (const f of junc) {
    for (const J of unpackJunctions(f)) {
      const sl = T.find(J.x, J.z), nd = sl < 0 ? -1 : nodeOf[sl];
      if (nd < 0) continue;
      nodeKey[nd] = J.key;
      nodeSet[nd] = J.setback;
      for (let k = deg[nd]; k < deg[nd + 1]; k++) {
        const e = adj[k];
        for (const end of [0, 1]) {
          if (ends[e * 2 + end] !== nd) continue;
          // heading from the node into the edge, ~8 m along
          const c = count[e], i0 = start[e] + (end ? c - 1 : 0), i1 = start[e] + (end ? Math.max(0, c - 3) : Math.min(c - 1, 2));
          const dx = pts[i1 * 3] - pts[i0 * 3], dz = pts[i1 * 3 + 2] - pts[i0 * 3 + 2], l = Math.hypot(dx, dz) || 1;
          let best = 0, bd = -2;
          for (const m of J.arms) { const d = (m.dx * dx + m.dz * dz) / l; if (d > bd) (bd = d), (best = m.ctl); }
          if (bd > 0.5) armCtl[e * 2 + end] = best;
        }
      }
    }
    yield;
  }
  const dr = new Float32Array(doors.length * 6);
  doors.forEach((d, i) => dr.set([d.x, d.y, d.z, d.fx, d.fy, d.fz], i * 6));
  return {
    ...base,
    // base arrays are shared across reinits — fresh copies, since init buffers transfer to the worker
    beachPts: base.beachPts.slice(),
    waterGrid: base.waterGrid.slice(),
    edgePts: new Float32Array(pts),
    edgeStart: new Int32Array(start),
    edgeCount: new Int32Array(count),
    edgeLen: new Float32Array(lens),
    edgeInfo: new Float32Array(info),
    edgeKerb: new Float32Array(kerb),
    edgeNodes: new Int32Array(ends),
    nodeEdgeStart: deg,
    nodeEdges: adj,
    doors: dr,
    edgeShops: new Float32Array(shops),
    armCtl, nodeKey, nodeSet,
    nodeXZ: new Float32Array(nodeXZ),
  };
}

// ---------------- models ----------------
function part(g: THREE.BufferGeometry, hex: number, id: number) {
  const geo = g.index ? g.toNonIndexed() : g;
  geo.deleteAttribute('uv');
  const n = geo.attributes.position.count;
  const c = new THREE.Color(hex);
  const col = new Float32Array(n * 3), pa = new Float32Array(n).fill(id);
  for (let i = 0; i < n; i++) col.set([c.r, c.g, c.b], i * 3);
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  geo.setAttribute('aPart', new THREE.BufferAttribute(pa, 1));
  return geo;
}
const box = (w: number, h: number, d: number, x: number, y: number, z: number) => new THREE.BoxGeometry(w, h, d).translate(x, y, z);

function gullGeo() {
  return mergeGeometries([
    part(new THREE.SphereGeometry(1, 8, 6).scale(0.12, 0.11, 0.3), 0xffffff, 0),
    part(new THREE.SphereGeometry(0.085, 8, 6).translate(0, 0.07, -0.27), 0xffffff, 0),
    part(new THREE.ConeGeometry(0.025, 0.1, 5).rotateX(-Math.PI / 2).translate(0, 0.06, -0.38), 0xe8b93a, 0),
    part(box(0.14, 0.03, 0.14, 0, 0.02, 0.33), 0x8e969d, 0),
    part(box(0.5, 0.025, 0.22, 0.33, 0.04, 0.02), 0xa1a9b0, 1),
    part(box(0.5, 0.025, 0.22, -0.33, 0.04, 0.02), 0xa1a9b0, 1),
    part(box(0.16, 0.022, 0.16, 0.66, 0.04, 0.05), 0x2a2c30, 1),
    part(box(0.16, 0.022, 0.16, -0.66, 0.04, 0.05), 0x2a2c30, 1),
    part(box(0.02, 0.2, 0.02, 0.05, -0.17, 0.02), 0xd9a07a, 0),
    part(box(0.02, 0.2, 0.02, -0.05, -0.17, 0.02), 0xd9a07a, 0),
  ]);
}
/** Walkers and residents: the foundry's jointed person (src/assets/people.ts), varied per
 *  instance in the shader — use creatureMaterial({ LEGS: 1, PEOPLE: 1 }). */
export function pedGeo() { return personLib().clone(); }
// Cars and boats come from the asset kit (src/assets/kit.ts): one InstancedMesh per type.
import { peopleU, creatureMaterial } from '../render/creature';
export { peopleU, creatureMaterial };

const CAR_COLORS = [0xf2f2ee, 0xb9bcc0, 0x26282c, 0x5a5e64, 0x2b3f63, 0x9c2a26, 0x3d5a46, 0xcdbf9e];
const DOG_CAP = 96;
const SHIRTS = [0xe8d8b0, 0x5b7fa6, 0xc4553f, 0xf2efe6, 0x6e8c5a, 0xe0a33b, 0x7a5b8c, 0x3f6f78, 0xd98a8a, 0x2f3a4a];
const BOATS = [0xf5f3ee, 0xf5f3ee, 0xe9eef0, 0x2d4a6a, 0xc9d8de, 0x9b3b32];

interface Group { mesh: THREE.InstancedMesh; meshes: THREE.InstancedMesh[]; anim: THREE.InstancedBufferAttribute; range: readonly [number, number]; scale: number }

export interface LifeStats {
  nearestCar: number; carPan: number; carSpeed: number;
  gullsNear: number; gullPan: number; gullDist: number;
  pedsNear: number; active: number; simMs: number; mode: string;
}

export class LifeClient {
  readonly group = new THREE.Group();
  private worker!: Worker; // assigned by spawn() in the constructor
  private buf: ArrayBuffer | SharedArrayBuffer;
  private V: ReturnType<typeof views>;
  private sab: boolean;
  private lastTick = -1;
  private tickAt = 0;
  private groups: Group[] = [];
  private dogs!: THREE.InstancedMesh;
  private dogAnim!: THREE.InstancedBufferAttribute;
  private leads!: THREE.LineSegments;
  private nDogs = 0;
  private headPts: THREE.Points;
  private m = new THREE.Matrix4();
  private q = new THREE.Quaternion();
  private p = new THREE.Vector3();
  private sc = new THREE.Vector3();
  private up = new THREE.Vector3(0, 1, 0);
  private envFrame = 0;
  readonly stats: LifeStats = { nearestCar: 1e9, carPan: 0, carSpeed: 0, gullsNear: 0, gullPan: 0, gullDist: 1e9, pedsNear: 0, active: 0, simMs: 0, mode: 'sab' };

  constructor(init: LifeInit) {
    this.group.name = 'life';
    this.sab = typeof SharedArrayBuffer !== 'undefined' && (globalThis as { crossOriginIsolated?: boolean }).crossOriginIsolated === true;
    const total = layout().total;
    this.buf = this.sab ? new SharedArrayBuffer(total) : new ArrayBuffer(total);
    this.V = views(this.buf);
    this.V.header[H.DENSITY] = 100;
    this.V.header[H.HOUR] = 1200;
    this.spawn(init);

    // One InstancedMesh per model variant (the asset kit's car / boat types); an agent shows
    // in the mesh its variant picks and is zero-scaled in the others.
    const make = (geos: THREE.BufferGeometry | THREE.BufferGeometry[], defines: Record<string, number>, range: readonly [number, number], scale: number, colors?: (i: number) => number, names?: string[]) => {
      const n = range[1] - range[0];
      const anim = new THREE.InstancedBufferAttribute(new Float32Array(n * 3), 3);
      anim.setUsage(THREE.DynamicDrawUsage);
      const meshes = (Array.isArray(geos) ? geos : [geos]).map((g0, gi) => {
        const geo = g0.clone();
        geo.setAttribute('aAnim', anim);
        const mesh = new THREE.InstancedMesh(geo, creatureMaterial(defines), n);
        mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
        mesh.frustumCulled = false;
        mesh.layers.enable(1);
        const zero = new THREE.Matrix4().makeScale(0, 0, 0);
        for (let i = 0; i < n; i++) mesh.setMatrixAt(i, zero);
        if (colors) {
          const c = new THREE.Color();
          for (let i = 0; i < n; i++) mesh.setColorAt(i, c.set(colors(i)));
        }
        if (names) mesh.name = names[gi];
        this.group.add(mesh);
        return mesh;
      });
      this.groups.push({ mesh: meshes[0], meshes, anim, range, scale });
    };
    make(gullGeo(), { WINGS: 1 }, RANGES.gulls, 1.8);
    make(CAR_TYPES.map((t) => carLib(t)), {}, RANGES.cars, 1, () => 0xffffff, CAR_TYPES.map((t) => `life-car:${t}`));
    make(pedGeo(), { LEGS: 1, PEOPLE: 1 }, RANGES.peds, 1, () => 0xffffff, ['life-ped']);
    { const st = activeStyle(), now = new Date(); peopleU.uWarmth.value = warmthFor(st.climate, now.getMonth() + 1, st.region === "oceania"); }
    // gear on the roofs of passing cars (placed on each car's own roof height per frame)
    for (const gname of LIFE_GEAR) {
      const m = new THREE.InstancedMesh(gearGeometry(gname, 0, 4.6, 1.86, 1), propMaterial(), CAPS.cars);
      m.name = `life-gear:${gname}`;
      m.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      m.frustumCulled = false;
      for (let i = 0; i < CAPS.cars; i++) m.setMatrixAt(i, this.zeroM);
      m.layers.enable(1);
      this.group.add(m);
      this.gear.set(gname, m);
    }
    make(LIFE_BOATS.map((t) => boatLib(t)), {}, RANGES.boats, 1, () => 0xffffff, LIFE_BOATS.map((t) => `life-boat:${t}`));
    // dogs out for a walk: one per dog walker, trotting a lead's length ahead and to the side
    {
      const geo = dogLib().clone();
      this.dogAnim = new THREE.InstancedBufferAttribute(new Float32Array(DOG_CAP * 3), 3);
      this.dogAnim.setUsage(THREE.DynamicDrawUsage);
      geo.setAttribute('aAnim', this.dogAnim);
      this.dogs = new THREE.InstancedMesh(geo, critterMaterial('fox'), DOG_CAP);
      this.dogs.name = 'life-dog';
      this.dogs.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      this.dogs.frustumCulled = false;
      this.dogs.layers.enable(1);
      for (let i = 0; i < DOG_CAP; i++) { this.dogs.setMatrixAt(i, this.zeroM); this.dogs.setColorAt(i, this.tmpC.set(0xffffff)); }
      this.dogs.count = 0;
      this.group.add(this.dogs);
      // the lead: a thin dark line from the walker's hand to the collar
      const lg = new THREE.BufferGeometry();
      lg.setAttribute('position', new THREE.BufferAttribute(new Float32Array(DOG_CAP * 6), 3));
      this.leads = new THREE.LineSegments(lg, new THREE.LineBasicMaterial({ color: 0x2a2320 }));
      this.leads.frustumCulled = false;
      this.group.add(this.leads);
    }

    // Headlight / masthead halos at night (positions rewritten per frame).
    const hg = new THREE.BufferGeometry();
    hg.setAttribute('position', new THREE.BufferAttribute(new Float32Array((CAPS.cars * 2 + CAPS.boats) * 3).fill(-9999), 3));
    this.headPts = new THREE.Points(hg, new THREE.ShaderMaterial({
      uniforms: { uNight: U.uNight },
      vertexShader: /* glsl */ `
        varying float vFade;
        void main() { vec4 mv = modelViewMatrix * vec4(position, 1.0); gl_Position = projectionMatrix * mv; gl_PointSize = clamp(900.0 / -mv.z, 1.5, 90.0); vFade = clamp(1.0 + mv.z / 900.0, 0.0, 1.0); }`,
      fragmentShader: /* glsl */ `
        uniform float uNight; varying float vFade;
        ${GLSL_NOISE}
        void main() { float r = length(gl_PointCoord - 0.5) * 2.0; float a = smoothstep(1.0, 0.0, r); a *= a * uNight * vFade; gl_FragColor = vec4(vec3(1.0, 0.86, 0.62) * a, a); }`,
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    }));
    this.headPts.frustumCulled = false;
    this.headPts.renderOrder = 8;
    this.group.add(this.headPts);
  }

  // (Re)start the sim worker with a fresh road graph — called when the streamed tile set changes.
  /** The player's car at (x,z) moving (vx,vz): walkers in its path are knocked down (lifeSim.bump). */
  bump(x: number, z: number, vx: number, vz: number) { this.worker.postMessage({ kind: 'bump', x, z, vx, vz }); }
  onBumped: ((n: number) => void) | null = null;
  /** Moving traffic near the player this frame (x, z, velocity) — the critters give way to it. */
  readonly movers: { x: number; z: number; vx: number; vz: number }[] = [];
  private nMovers = 0;
  /** The boats under way this frame (wakes.ts): slot, place, heading, speed from the last tick's move. */
  readonly boats: { id: number; x: number; z: number; yaw: number; v: number; stern: number; beam: number }[] = [];
  private nBoats = 0;
  /** The road graph changed (tiles streamed in or out): hand the worker the new graph. Its agents
   *  carry over by position (LifeSim.adopt), so traffic and walkers never reset. */
  reinit(init: LifeInit) {
    const transfer = [init.edgePts.buffer, init.edgeStart.buffer, init.edgeCount.buffer, init.edgeLen.buffer, init.edgeInfo.buffer, init.edgeNodes.buffer, init.nodeEdgeStart.buffer, init.nodeEdges.buffer, init.beachPts.buffer, init.waterGrid.buffer, init.doors.buffer] as ArrayBuffer[];
    this.worker.postMessage({ kind: 'regraph', init }, transfer);
  }

  private spawn(init: LifeInit) {
    const total = layout().total;
    this.worker = new Worker(new URL('./ambient.worker.ts', import.meta.url), { type: 'module' });
    this.worker.addEventListener('message', (e) => { if (e.data?.kind === 'bumped') this.onBumped?.(e.data.n as number); });
    const transfer: Transferable[] = [init.edgePts.buffer, init.edgeStart.buffer, init.edgeCount.buffer, init.edgeLen.buffer, init.edgeInfo.buffer, init.edgeNodes.buffer, init.nodeEdgeStart.buffer, init.nodeEdges.buffer, init.beachPts.buffer, init.waterGrid.buffer, init.doors.buffer] as ArrayBuffer[];
    if (this.sab) {
      this.worker.postMessage({ kind: 'init', init, sab: this.buf }, transfer);
    } else {
      this.stats.mode = 'copy';
      const pool = [new ArrayBuffer(total), new ArrayBuffer(total)];
      this.worker.postMessage({ kind: 'init', init, pool, header: this.V.header.slice() }, [...transfer, ...pool]);
      this.worker.onmessage = (e) => {
        if (e.data.kind !== 'snap') return;
        const old = this.buf as ArrayBuffer;
        this.buf = e.data.buf as ArrayBuffer;
        const hdr = this.V.header.slice();
        this.V = views(this.buf);
        this.V.header.set(hdr.subarray(H.PLAYER_X, H.WIND + 1), H.PLAYER_X);
        this.V.header[H.CLOCK] = hdr[H.CLOCK];
        this.V.header[H.PLAYER_YAW] = hdr[H.PLAYER_YAW];
        this.worker.postMessage({ kind: 'return', buf: old }, [old]);
      };
    }
  }

  /** The dog of walker i: a lead's length ahead and to the right, trotting when they walk,
   *  standing (and sniffing) when they stop; its coat is the walker's own pick of the breeds. */
  private walkDog(i: number, x: number, y: number, z: number, yaw: number, amt: number, anim: number) {
    const k = this.nDogs++;
    const fx = -Math.sin(yaw), fz = -Math.cos(yaw), rx = Math.cos(yaw), rz = -Math.sin(yaw);
    const wob = Math.sin(anim * 0.23 + i) * 0.25;
    const dx = x + fx * 1.25 + rx * (0.55 + wob), dz = z + fz * 1.25 + rz * (0.55 + wob);
    const dyaw = yaw + wob * 0.6 + (amt > 0.5 ? 0 : Math.sin(anim * 0.05 + i * 3) * 0.8);
    this.q.setFromAxisAngle(this.up, dyaw);
    const size = 0.75 + hashf(i * 131) * 0.55; // a terrier to a shepherd
    this.m.compose(this.p.set(dx, y - 0.08, dz), this.q, this.sc.setScalar(size));
    this.dogs.setMatrixAt(k, this.m);
    this.dogs.setColorAt(k, this.tmpC.set(DOG_COATS[Math.floor(hashf(i * 977) * DOG_COATS.length)]));
    const A = this.dogAnim.array as Float32Array;
    // gait cycles per metre walked (the walker's phase is 5.2 rad a metre), fast little steps
    A[k * 3] = anim / 5.2 / (0.55 * size); A[k * 3 + 1] = amt > 0.5 ? 1 : 0; A[k * 3 + 2] = amt > 0.5 ? 1 : 0;
    const lp = this.leads.geometry.attributes.position as THREE.BufferAttribute;
    lp.setXYZ(k * 2, x + rx * 0.26 + fx * 0.15, y + 0.86, z + rz * 0.26 + fz * 0.15); // the hand
    lp.setXYZ(k * 2 + 1, dx - Math.sin(dyaw) * 0.28 * size, y + 0.34 * size, dz - Math.cos(dyaw) * 0.28 * size); // the collar
  }

  update(now: number, player: { x: number; z: number; yaw: number }, env: { night: number; hour: number; wind: number; clock?: number }) {
    const h = this.V.header;
    this.group.visible = lifeParams.enabled;
    const hdr = [Math.round(player.x * 100), Math.round(player.z * 100), Math.round(env.night * 1000), Math.round(env.hour * 100), Math.round(lifeParams.density * this.crowd * 100), Math.round(env.wind * 1000)];
    h[H.PLAYER_X] = hdr[0]; h[H.PLAYER_Z] = hdr[1]; h[H.NIGHT] = hdr[2]; h[H.HOUR] = hdr[3]; h[H.DENSITY] = hdr[4]; h[H.WIND] = hdr[5];
    h[H.CLOCK] = Math.round((env.clock ?? now / 1000) * 100) | 0;
    h[H.PLAYER_YAW] = Math.round((((player.yaw % (2 * Math.PI)) + 3 * Math.PI) % (2 * Math.PI) - Math.PI) * 1000);
    if (!this.sab && this.envFrame++ % 3 === 0) this.worker.postMessage({ kind: 'env', header: h.slice() });

    const tick = Atomics.load(h, H.TICK);
    if (tick !== this.lastTick) { this.lastTick = tick; this.tickAt = now; }
    if (tick === 0) return;
    const a = Math.min(1, (now - this.tickAt) / (1000 / SIM_HZ));
    const snap = this.V.snaps[h[H.FRONT]];
    const st = this.stats;
    st.nearestCar = 1e9; st.gullsNear = 0; st.gullDist = 1e9; st.pedsNear = 0;
    this.nMovers = 0;
    this.nBoats = 0;
    st.active = h[H.ACTIVE];
    st.simMs = h[H.SIM_US] / 1000;
    const heads = this.headPts.geometry.attributes.position as THREE.BufferAttribute;
    let hk = 0;
    const fx = -Math.sin(player.yaw), fz = -Math.cos(player.yaw);
    const pan = (x: number, z: number) => {
      const dx = x - player.x, dz = z - player.z, l = Math.hypot(dx, dz) || 1;
      return (dx * -fz + dz * fx) / l;
    };
    this.nDogs = 0;
    for (const g of this.groups) {
      const [r0, r1] = g.range;
      const kind = g.range === RANGES.gulls ? 0 : g.range === RANGES.cars ? 1 : g.range === RANGES.peds ? 2 : 3;
      const A = g.anim.array as Float32Array;
      for (let i = r0; i < r1; i++) {
        const o = i * S.STRIDE, li = i - r0;
        const flags = snap[o + S.FLAGS];
        if (!(flags & 1) || snap[o + S.Y] < -500) {
          for (const mm of g.meshes) mm.setMatrixAt(li, this.zeroM);
          if (kind === 1) for (const gm of this.gear.values()) gm.setMatrixAt(li, this.zeroM);
          continue;
        }
        const x = snap[o + S.PX] + (snap[o + S.X] - snap[o + S.PX]) * a;
        let y = snap[o + S.PY] + (snap[o + S.Y] - snap[o + S.PY]) * a;
        const z = snap[o + S.PZ] + (snap[o + S.Z] - snap[o + S.PZ]) * a;
        let yaw0 = snap[o + S.PYAW], yaw1 = snap[o + S.YAW];
        const d = ((yaw1 - yaw0 + Math.PI) % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2) - Math.PI;
        const yaw = yaw0 + d * a;
        const amt = snap[o + S.AMT];
        const variant = snap[o + S.VARIANT];
        const lights = flags & 2 ? 1 : 0;
        let sx = g.scale, sy = g.scale, sz = g.scale;
        let roll = 0, pitch = 0, spin = 0;
        const dist = Math.hypot(x - player.x, z - player.z);
        // a share of a dense core's traffic is cabs (main sets taxiShare from the built volume)
        const taxi = kind === 1 && this.taxiShare > 0 && hashf(i * 977 + variant * 3) < this.taxiShare;
        if (kind === 0) {
          if (amt < 0) y += 0.2 * g.scale;
          if (amt >= 0 && dist < 70) { st.gullsNear++; if (dist < st.gullDist) { st.gullDist = dist; st.gullPan = pan(x, z); } }
          roll = amt >= 0 ? -d * 2.5 : 0;
        } else if (kind === 1) {
          // down a tunnel portal: out of sight (the sim drives it on under the blocks)
          const gc = this.ground ? this.ground(x, z, y) : y;
          if (y < gc - 1) {
            for (const mm of g.meshes) mm.setMatrixAt(li, this.zeroM);
            for (const gm of this.gear.values()) gm.setMatrixAt(li, this.zeroM);
            continue;
          }
          if (variant >= 10) { sx = 1.06; sy = 1.22; sz = 1.04; }
          if (dist < st.nearestCar) { st.nearestCar = dist; st.carPan = pan(x, z); st.carSpeed = amt; }
          if (dist < 100 && amt > 2 && this.nMovers < 48) {
            const m = this.movers[this.nMovers] ?? (this.movers[this.nMovers] = { x: 0, z: 0, vx: 0, vz: 0 });
            m.x = x; m.z = z; m.vx = -Math.sin(yaw) * amt; m.vz = -Math.cos(yaw) * amt; this.nMovers++;
          }
          // the body rides the road under its four wheels: pitched up a grade, rolled on a camber
          // (a flat car on an 18% Seattle street buried its bonnet in the hill and hung its boot
          // in the air). Wheels at ±1.4 m along, ±0.8 m across — the kit's sedan axles and track.
          if (this.ground && dist < 420 && y > gc - 0.4) {
            const gr = this.ground, hb = 1.4, cfx = -Math.sin(yaw), cfz = -Math.cos(yaw);
            const yf = gr(x + cfx * hb, z + cfz * hb, y), yb = gr(x - cfx * hb, z - cfz * hb, y);
            pitch = Math.atan2(yf - yb, hb * 2);
            let yc = (yf + yb) / 2;
            if (dist < 160) {
              const ht = 0.8, crx = Math.cos(yaw), crz = -Math.sin(yaw);
              const yr = gr(x + crx * ht, z + crz * ht, y), yl = gr(x - crx * ht, z - crz * ht, y);
              roll = Math.atan2(yr - yl, ht * 2);
              yc = (2 * yc + yr + yl) / 4;
            }
            y = yc + 0.06; // (the asphalt ribbons ride a few centimetres over the ground)
          }
          if (lights) {
            const hx = x - Math.sin(yaw) * 2.3, hz = z - Math.cos(yaw) * 2.3, hy = y + 0.76 + Math.sin(pitch) * 2.3;
            const rx = Math.cos(yaw) * 0.62, rz = -Math.sin(yaw) * 0.62;
            heads.setXYZ(hk++, hx + rx, hy, hz + rz);
            heads.setXYZ(hk++, hx - rx, hy, hz - rz);
          }
          g.mesh.setColorAt(li, this.tmpC.set(taxi ? TAXI_PAINT(activeStyle().region) : CAR_COLORS[variant % 10 % CAR_COLORS.length]));
          // the kit's vans / SUVs are their own models; each car breathes a little within its type
          sx = 0.97 + hashf(i * 7919 + variant) * 0.06; sy = 0.96 + hashf(i * 104729 + variant) * 0.08; sz = 0.97 + hashf(i * 31 + variant * 131) * 0.06;
        } else if (kind === 2) {
          if (dist < 25) st.pedsNear++;
          if (flags & (PED.DOG << 1) && amt > -0.5 && dist < 220 && this.nDogs < DOG_CAP) this.walkDog(i, x, y, z, yaw, amt, snap[o + S.ANIM]);
          if (amt < -0.5 && amt > -1.999) {
            // knocked down: laid back over ~0.15 s with one log-roll as they slide, then sprawled
            // face-up (the pose itself — knees up, an arm flung out — is in the shader)
            const t = -1 - amt;
            pitch = Math.PI / 2 * Math.min(1, t / 0.1);
            spin = Math.PI * 2 * Math.min(1, t / 0.35);
            y += 0.13 * Math.min(1, t / 0.1);
          }
          g.mesh.setColorAt(li, this.tmpC.set(SHIRTS[variant % SHIRTS.length]));
        } else {
          const t = snap[o + S.ANIM];
          // (under way or lying to a mooring: the speed is the last tick's own move)
          const bv = Math.hypot(snap[o + S.X] - snap[o + S.PX], snap[o + S.Z] - snap[o + S.PZ]) * SIM_HZ;
          if (bv > 0.5 && this.nBoats < CAPS.boats) {
            const b = this.boats[this.nBoats] ?? (this.boats[this.nBoats] = { id: 0, x: 0, z: 0, yaw: 0, v: 0, stern: 3.4, beam: 2.6 });
            b.id = i; b.x = x; b.z = z; b.yaw = yaw; b.v = bv; this.nBoats++;
          }
          y = Math.sin(t * 1.3 + i) * 0.12;
          roll = Math.sin(t * 0.9 + i * 2) * 0.05;
          if (lights) heads.setXYZ(hk++, x, 2.3, z);
          g.mesh.setColorAt(li, this.tmpC.set(BOATS[variant % BOATS.length]));
        }
        this.q.setFromAxisAngle(this.up, yaw);
        if (roll) this.q.multiply(this.tmpQ.setFromAxisAngle(this.fwdAxis, roll));
        if (pitch) this.q.multiply(this.tmpQ.setFromAxisAngle(this.sideAxis, pitch));
        if (spin) this.q.multiply(this.tmpQ.setFromAxisAngle(this.up, spin));
        this.m.compose(this.p.set(x, y, z), this.q, this.sc.set(sx, sy, sz));
        if (g.meshes.length > 1) {
          // the agent's model: a stable pick from its variant (cars follow the street mix)
          const pick = kind === 1 ? CAR_TYPES.indexOf(pickFrom(carMix(activeStyle().region, activeStyle().climate), ((variant * 0.618034) % 1 + (i * 0.1234) % 1) % 1)) : (variant + i) % g.meshes.length;
          if (kind === 1) {
            const gr = taxi ? 'taxi' : gearFor(hashf(i * 613 + variant * 7), this.coastal);
            const gname = gr === 'bike' ? null : gr;
            for (const [gk, gm] of this.gear) {
              if (gk === gname) gm.setMatrixAt(li, this.gm.multiplyMatrices(this.m, this.gt.makeTranslation(0, ROOF[CAR_TYPES[pick]], 0)));
              else gm.setMatrixAt(li, this.zeroM);
            }
          }
          for (let k = 0; k < g.meshes.length; k++) {
            if (k === pick) {
              g.meshes[k].setMatrixAt(li, this.m);
              if (g.meshes[k] !== g.mesh && g.mesh.instanceColor) { g.mesh.getColorAt(li, this.tmpC); g.meshes[k].setColorAt(li, this.tmpC); }
            } else g.meshes[k].setMatrixAt(li, this.zeroM);
          }
        } else g.mesh.setMatrixAt(li, this.m);
        const aph = snap[o + S.ANIM];
        A[li * 3] = aph; A[li * 3 + 1] = amt; // walkers pass the knockdown code (< 0) through to the pose shader A[li * 3 + 2] = lights;
        if (kind === 1) A[li * 3 + 1] = 0;
      }
      if (kind === 1) for (const gm of this.gear.values()) gm.instanceMatrix.needsUpdate = true;
      for (const mm of g.meshes) {
        mm.instanceMatrix.needsUpdate = true;
        if (mm.instanceColor) mm.instanceColor.needsUpdate = true;
      }
      g.anim.needsUpdate = true;
    }
    for (let k = hk; k < heads.count; k++) heads.setXYZ(k, 0, -9999, 0);
    heads.needsUpdate = true;
    this.dogs.count = this.nDogs;
    this.dogs.instanceMatrix.needsUpdate = true;
    if (this.dogs.instanceColor) this.dogs.instanceColor.needsUpdate = true;
    this.dogAnim.needsUpdate = true;
    const lp = this.leads.geometry.attributes.position as THREE.BufferAttribute;
    this.leads.geometry.setDrawRange(0, this.nDogs * 2);
    lp.needsUpdate = true;
    this.movers.length = this.nMovers;
    this.boats.length = this.nBoats;
  }
  private tmpC = new THREE.Color();
  private zeroM = new THREE.Matrix4().makeScale(0, 0, 0);
  private gear = new Map<CarGear, THREE.InstancedMesh>();
  private gm = new THREE.Matrix4();
  private gt = new THREE.Matrix4();
  /** near the coast, cars carry surfboards and kayaks (main sets this from the walker's position) */
  coastal = true;
  /** share of passing cars that are taxis — 0 in town, up to ~0.35 among towers */
  taxiShare = 0;
  /** crowd multiplier for the place (main: 1 in town, up to ~2.6 among towers) */
  crowd = 1;
  /** the open-air surface at (x,z) nearest height y (main: WalkWorld.outdoorNear) — cars pitch
   *  and roll to it; null keeps them level on the sim's centreline height */
  ground: ((x: number, z: number, y: number) => number) | null = null;
  private tmpQ = new THREE.Quaternion();
  private fwdAxis = new THREE.Vector3(0, 0, 1);
  private sideAxis = new THREE.Vector3(1, 0, 0);
}
