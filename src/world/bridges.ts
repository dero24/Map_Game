// Road bridges: the deck a mapped bridge carries its road on, with a real bridge's long section —
// coming up off its approach streets at their own height on an easy grade, standing its clearance
// over the water (a movable span's closed clearance; a fixed bridge the higher the wider the water)
// and over any road or railway under it, never sagging below the straight line between its ends —
// a slab with real depth on girders, sidewalks and parapets with a railing, piers down into the
// riverbed between its spans, abutments where it lands; a movable span's leaves on their bascule
// piers, a tender house at each corner, timber fenders along the channel. Collision is the deck as
// drawn: the roadway and sidewalks at their drawn heights, the parapets as walls, the piers too.
//   A bridge is mapped as a chain of ways (its approach spans, its movable span), and a tile owns
// only some of them: each tile profiles the whole chain from every way it can see — its own and
// its margin's — and draws the ways it owns, so the pieces meet where their owners' tiles do.
// (Each tile used to profile only the ways it owned and brought its piece down to the ground
// wherever it stopped: the Rumson–Sea Bright bascule, owned by two tiles, sagged to the water at
// their seam, mid-river — a collapsed span.)
import * as THREE from 'three';
import type { Line, Road } from './data';
import { tableHeight, type WalkWorld } from '../player/collision';

type P = [number, number];

/** The ground under a deck: its height (the bed, under water), and its side of the shore (sdf < 0: water). */
export interface Ground { heightAt(x: number, z: number): number; sdfAt(x: number, z: number): number }
/** The mesh builder the structures share (structures.ts Mesher). */
export interface Sink {
  color(hex: number): Sink;
  quad(a: THREE.Vector3, b: THREE.Vector3, c: THREE.Vector3, d: THREE.Vector3, facing?: THREE.Vector3): void;
  tri(a: THREE.Vector3, b: THREE.Vector3, c: THREE.Vector3, facing?: THREE.Vector3): void;
  box(cx: number, cz: number, ang: number, l: number, w: number, y0: number, y1: number): void;
}

/** Ways that are footbridges (a path, a sidewalk); one running beside a road bridge is its sidewalk. */
const FOOT = new Set(['footway', 'path', 'cycleway', 'steps', 'bridleway', 'corridor']);
export const isRoadBridge = (r: Road) => !!r.br && !r.lod && !r.tu && !FOOT.has(r.c);
const isSidePath = (r: Road) => !!r.br && !r.lod && !r.tu && FOOT.has(r.c) && r.c !== 'steps';
/** Highways cross on a shoulder behind a barrier, no sidewalk; lesser roads on a strip of kerb. */
const HIGHWAY = new Set(['motorway', 'motorway_link', 'trunk', 'trunk_link']);
const MINOR = new Set(['service', 'track', 'unclassified', 'living_street', 'construction', 'raceway', 'busway', 'road']);
/** The grade a deck climbs from its approaches at (the approach itself may be 30% steeper where
 *  the water or a road under it asks for the height). */
const GRADE: Record<string, number> = {
  motorway: 0.04, motorway_link: 0.05, trunk: 0.04, trunk_link: 0.05, primary: 0.05, primary_link: 0.06,
  secondary: 0.05, secondary_link: 0.06, tertiary: 0.06, tertiary_link: 0.06,
};
const gradeOf = (c: string) => GRADE[c] ?? 0.07;
/** A movable span's clearance closed (m, water to soffit): boats taller wait for it to open. */
export const CLEAR_MOVABLE = 3.5;
/** A fixed bridge's clearance over W metres of water crossed: a creek's bridge stands a metre and
 *  a half over it, a broad river's high enough for its boats — up to 8 m; a highway's, built for
 *  the masts of the channel under it, up to 20. */
export const clearOver = (W: number, highway: boolean) => (highway ? clamp(1.5 + 0.04 * W, 1.5, 20) : clamp(1.5 + 0.015 * W, 1.5, 8));
/** How far over a crossing a deck's soffit stands: a road's lorries, a railway's wires, walkers. */
const UNDER = { road: 5.0, rail: 6.6, tram: 5.6, path: 2.6 };

export const STEP = 2; // m between the long section's stations (and at every vertex of the way)
export const LIFT = 0.04; // the roadway stands this far over the ground where it lands: clear of the paint
const KERB = 0.15; // a sidewalk's step up from the roadway
const PARAPET = 0.85; // a parapet's top over its sidewalk
const CAP = 0.35; // its thickness
const SLAB = 0.35; // the deck slab's depth under the roadway
const SPAN = 30; // m a span between piers (a highway's 36, a lesser road's 18)

const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));
const unpack = (f: number[]): P[] => {
  const o: P[] = [];
  for (let i = 0; i + 1 < f.length; i += 2) o.push([f[i] / 10, f[i + 1] / 10]);
  return o;
};
/** The value at s of a table v over increasing stations S, straight between them. */
function interp(S: ArrayLike<number>, v: ArrayLike<number>, s: number) {
  const n = S.length - 1;
  if (s <= S[0]) return v[0];
  if (s >= S[n]) return v[n];
  let lo = 0, hi = n;
  while (hi - lo > 1) {
    const m = (lo + hi) >> 1;
    if (S[m] <= s) lo = m;
    else hi = m;
  }
  return v[lo] + ((v[hi] - v[lo]) * (s - S[lo])) / Math.max(1e-9, S[hi] - S[lo]);
}

// ---------------------------------------------------------------- chains

/** One mapped way of a chain: its stretch [s0, s1] along it, and whether this tile owns it. */
export interface ChainWay { r: Road; own: boolean; s0: number; s1: number; movable: boolean }
/** An end of a chain: a street to land on there (`approach`), or another bridge way (`junction`). */
export interface ChainEnd { x: number; z: number; approach: boolean; junction: boolean }
export interface Chain {
  pts: P[]; cum: number[]; L: number; ways: ChainWay[]; ends: [ChainEnd, ChainEnd];
  w: number; c: string; movable: boolean; oneway: boolean;
  /** its OSM layer (a bridge untagged is a layer up): one higher crosses over it */
  layer: number;
}

/** The road bridges among `roads` (a tile's own ways and its margin's), joined into chains where
 *  exactly two of them meet end to end. Each chain runs from its end with the lesser (x, z), so
 *  every tile that sees the same ways builds the same chain, point for point. */
export function chainBridges(roads: Road[]): Chain[] {
  const ways: { r: Road; p: P[] }[] = [];
  for (const r of roads) {
    if (!isRoadBridge(r)) continue;
    const p = unpack(r.p);
    if (p.length >= 2) ways.push({ r, p });
  }
  const K = (p: P) =>`${Math.round(p[0] * 10)},${Math.round(p[1] * 10)}`;
  const endsAt = new Map<string, number[]>();
  const deckV = new Map<string, number>(); // every road-bridge vertex: how many ways pass or end there
  ways.forEach((w, i) => {
    for (const q of [w.p[0], w.p[w.p.length - 1]]) {
      const k = K(q), l = endsAt.get(k);
      if (l) l.push(i);
      else endsAt.set(k, [i]);
    }
    for (const q of new Set(w.p.map(K))) deckV.set(q, (deckV.get(q) ?? 0) + 1);
  });
  // the streets a bridge can land on: every vertex of a road that isn't a bridge or a tunnel
  const street = new Set<string>();
  for (const r of roads) if (!r.br && !r.tu) for (let i = 0; i + 1 < r.p.length; i += 2) street.add(`${r.p[i]},${r.p[i + 1]}`);
  const joinAt = (k: string) => {
    const l = endsAt.get(k);
    return l && l.length === 2 && l[0] !== l[1] && (deckV.get(k) ?? 0) === 2 ? l : null;
  };
  const used = new Uint8Array(ways.length);
  const chains: Chain[] = [];
  for (let i = 0; i < ways.length; i++) {
    if (used[i]) continue;
    used[i] = 1;
    const seq: [number, boolean][] = [[i, false]]; // [way, reversed]
    for (const atEnd of [true, false]) {
      for (;;) {
        const [wi, rev] = atEnd ? seq[seq.length - 1] : seq[0];
        const p = ways[wi].p;
        const tip = atEnd !== rev ? p[p.length - 1] : p[0];
        const j = joinAt(K(tip));
        if (!j) break;
        const o = j[0] === wi ? j[1] : j[0];
        if (used[o]) break;
        used[o] = 1;
        const startsHere = K(ways[o].p[0]) === K(tip);
        if (atEnd) seq.push([o, !startsHere]);
        else seq.unshift([o, startsHere]);
      }
    }
    // the polyline, and each way's stretch of it (vertex indices)
    let pts: P[] = [];
    const span: { r: Road; a: number; b: number }[] = [];
    for (const [wi, rev] of seq) {
      const q = rev ? ways[wi].p.slice().reverse() : ways[wi].p;
      const a = Math.max(0, pts.length - 1);
      pts = pts.length ? pts.concat(q.slice(1)) : q.slice();
      span.push({ r: ways[wi].r, a, b: pts.length - 1 });
    }
    // (runs from its lesser end)
    const f = pts[0], l = pts[pts.length - 1];
    if (l[0] < f[0] || (l[0] === f[0] && l[1] < f[1])) {
      const n = pts.length - 1;
      pts = pts.slice().reverse();
      for (const s of span) [s.a, s.b] = [n - s.b, n - s.a];
      span.reverse();
    }
    // (a vertex repeated in place is no vertex)
    const keep: P[] = [pts[0]], idx = [0];
    for (let k = 1; k < pts.length; k++) {
      if (Math.hypot(pts[k][0] - keep[keep.length - 1][0], pts[k][1] - keep[keep.length - 1][1]) > 1e-3) keep.push(pts[k]);
      idx.push(keep.length - 1);
    }
    if (keep.length < 2) continue;
    const cum = [0];
    for (let k = 1; k < keep.length; k++) cum.push(cum[k - 1] + Math.hypot(keep[k][0] - keep[k - 1][0], keep[k][1] - keep[k - 1][1]));
    const L = cum[cum.length - 1];
    const end = (p: P): ChainEnd => {
      const k = K(p);
      return { x: p[0], z: p[1], approach: street.has(k), junction: (deckV.get(k) ?? 0) > 1 };
    };
    let wMax = 0, c = span[0].r.c;
    for (const s of span) if (s.r.w > wMax) (wMax = s.r.w), (c = s.r.c);
    chains.push({
      pts: keep, cum, L,
      ways: span.map((s) => ({ r: s.r, own: s.r.own !== 0, s0: cum[idx[s.a]], s1: cum[idx[s.b]], movable: s.r.br === 'movable' })).filter((w) => w.s1 - w.s0 > 1e-3),
      ends: [end(keep[0]), end(keep[keep.length - 1])],
      w: wMax, c,
      movable: span.some((s) => s.r.br === 'movable'),
      oneway: span.every((s) => !!s.r.ow),
      layer: Math.max(...span.map((s) => s.r.l ?? 1)),
    });
  }
  return chains;
}

/** Where a chain is at station s: the point, its direction, its left, and on a vertex the mitre's
 *  stretch (the offsets lengthened to keep the deck's width round the bend). */
export function chainAt(ch: Chain, s: number) {
  const { pts, cum } = ch;
  s = clamp(s, 0, ch.L);
  let lo = 0, hi = cum.length - 1;
  while (hi - lo > 1) {
    const m = (lo + hi) >> 1;
    if (cum[m] <= s) lo = m;
    else hi = m;
  }
  const seg = (i: number): [number, number] => {
    const dx = pts[i + 1][0] - pts[i][0], dz = pts[i + 1][1] - pts[i][1], l = Math.hypot(dx, dz) || 1;
    return [dx / l, dz / l];
  };
  const len = cum[hi] - cum[lo], t = len > 1e-9 ? (s - cum[lo]) / len : 0;
  const x = pts[lo][0] + (pts[hi][0] - pts[lo][0]) * t, z = pts[lo][1] + (pts[hi][1] - pts[lo][1]) * t;
  let [tx, tz] = seg(lo), mi = 1;
  const at = Math.abs(s - cum[lo]) < 1e-6 && lo > 0 ? lo : Math.abs(s - cum[hi]) < 1e-6 && hi < pts.length - 1 ? hi : -1;
  if (at > 0) {
    const [ax, az] = seg(at - 1), [bx, bz] = seg(at);
    const mx = ax + bx, mz = az + bz, ml = Math.hypot(mx, mz);
    if (ml > 1e-6) {
      tx = mx / ml;
      tz = mz / ml;
      mi = Math.min(1.6, 1 / Math.max(1e-3, tx * bx + tz * bz));
    }
  }
  return { x, z, tx, tz, nx: tz, nz: -tx, mi }; // n: the left of the way it runs
}

/** The nearest point of a chain's centreline to (x, z): its station and distance. */
function nearestOn(ch: Chain, x: number, z: number) {
  let best = Infinity, S = 0;
  for (let k = 0; k + 1 < ch.pts.length; k++) {
    const [ax, az] = ch.pts[k], [bx, bz] = ch.pts[k + 1], dx = bx - ax, dz = bz - az, l2 = dx * dx + dz * dz;
    const t = l2 > 0 ? clamp(((x - ax) * dx + (z - az) * dz) / l2, 0, 1) : 0;
    const d = Math.hypot(ax + dx * t - x, az + dz * t - z);
    if (d < best) (best = d), (S = ch.cum[k] + t * Math.sqrt(l2));
  }
  return { S, d: best };
}

// ---------------------------------------------------------------- the long section

/** Something passing under a chain at station S: the ground there, how far over it the deck's
 *  soffit has to stand, and over how much of the chain either side. */
export interface Under { S: number; h: number; need: number; half: number }

/** The roads, railways and paths a chain crosses over (not the streets it lands on). */
export function crossingsUnder(ch: Chain, roads: Road[], lines: Line[], g: Ground): Under[] {
  const out: Under[] = [];
  let x0 = Infinity, z0 = Infinity, x1 = -Infinity, z1 = -Infinity;
  for (const [x, z] of ch.pts) (x0 = Math.min(x0, x)), (x1 = Math.max(x1, x)), (z0 = Math.min(z0, z)), (z1 = Math.max(z1, z));
  const own = new Set(ch.pts.map(([x, z]) => `${Math.round(x * 10)},${Math.round(z * 10)}`));
  const test = (f: number[], need: number, half: number) => {
    for (let i = 0; i + 1 < f.length; i += 2) if (own.has(`${f[i]},${f[i + 1]}`)) return; // (it meets the bridge: a street it lands on)
    for (let i = 0; i + 3 < f.length; i += 2) {
      const ax = f[i] / 10, az = f[i + 1] / 10, bx = f[i + 2] / 10, bz = f[i + 3] / 10;
      if (Math.max(ax, bx) < x0 || Math.min(ax, bx) > x1 || Math.max(az, bz) < z0 || Math.min(az, bz) > z1) continue;
      for (let k = 0; k + 1 < ch.pts.length; k++) {
        const [px, pz] = ch.pts[k], [qx, qz] = ch.pts[k + 1];
        const rx = qx - px, rz = qz - pz, sx = bx - ax, sz = bz - az, den = rx * sz - rz * sx;
        if (Math.abs(den) < 1e-9) continue;
        const t = ((ax - px) * sz - (az - pz) * sx) / den, u = ((ax - px) * rz - (az - pz) * rx) / den;
        if (t < 0 || t > 1 || u < 0 || u > 1) continue;
        const S = ch.cum[k] + t * (ch.cum[k + 1] - ch.cum[k]);
        if (S < 1 || S > ch.L - 1) continue;
        // (a crossing at a slant takes more of the deck)
        const sin = Math.abs(den) / ((Math.hypot(rx, rz) || 1) * (Math.hypot(sx, sz) || 1));
        out.push({ S, h: g.heightAt(px + rx * t, pz + rz * t), need, half: half / Math.max(0.3, sin) + 2 });
      }
    }
  };
  for (const r of roads) {
    if (r.br || r.tu || r.lod) continue;
    test(r.p, FOOT.has(r.c) || r.c === 'pedestrian' ? UNDER.path : UNDER.road, r.w / 2);
  }
  for (const l of lines) if ((l.c === 'rail' || l.c === 'tram') && !l.br) test(l.p, l.c === 'rail' ? UNDER.rail : UNDER.tram, 2.5);
  return out;
}

/** A chain's long section: the roadway's surface at its stations, and what stands under it. */
export interface Profile {
  S: number[]; y: number[]; ground: number[]; wet: Uint8Array;
  /** the water's surface under each station (−Infinity: dry), the structure's depth under the roadway there */
  level: number[]; depth: number[];
  /** each end: on its street (`land`, at its height `h` — the roadway's surface there), or in the air */
  ends: [{ land: boolean; h: number }, { land: boolean; h: number }];
}

/** What carries a way's deck, from its mapped bridge:structure: girders on piers (a beam bridge,
 *  and anything the map doesn't say), trusses either side of it, an arch, a suspension bridge's
 *  cables from its towers, a cable-stayed bridge's stays from its pylons. */
export type Carried = 'beam' | 'truss' | 'arch' | 'suspension' | 'stayed';
export const carriedBy = (bs: string | undefined): Carried =>
  !bs ? 'beam' : /truss/.test(bs) ? 'truss' : /arch/.test(bs) ? 'arch' : /suspension/.test(bs) ? 'suspension' : /stay/.test(bs) ? 'stayed' : 'beam';

/** How many spans a way of `len` metres is carried in (piers between them), and how deep its
 *  structure stands under the roadway (girders about a twenty-fifth of their span, and the slab;
 *  a deck hung from trusses, an arch or cables is a metre deep, and spans the whole way). */
export function spansOf(w: { movable: boolean; s0: number; s1: number; r?: Road }, c: string) {
  const len = w.s1 - w.s0, kind = carriedBy(w.r?.bs);
  if (w.movable) return { n: 1, depth: 1.6 };
  if (kind !== 'beam') return { n: kind === 'truss' ? Math.max(1, Math.round(len / 80)) : 1, depth: 1.0 };
  const n = Math.max(1, Math.round(len / (MINOR.has(c) ? 18 : HIGHWAY.has(c) ? 36 : SPAN)));
  return { n, depth: clamp(0.3 + len / n / 25, 0.7, 2.2) };
}

/** The roadway's long section. It lands on its approach streets at their own height; stands its
 *  clearance (and its depth) over the water and over whatever passes under it; climbs from its
 *  ends at its class's grade (30% steeper off the street, eased in over a vertical curve); never
 *  drops under the straight line between its ends; a movable span's leaves run straight from heel
 *  to heel; and it is smoothed into one long curve. Pure: the same chain and ground, the same
 *  section — every station a vertex of the way or a subdivision of its segment, so a tile seeing
 *  a little more or less of a long chain still puts the same stations on the ways both see. */
export function bridgeProfile(ch: Chain, g: Ground, under: Under[] = []): Profile {
  const S: number[] = [];
  for (let k = 0; k + 1 < ch.pts.length; k++) {
    const a = ch.cum[k], b = ch.cum[k + 1], n = Math.max(1, Math.ceil((b - a) / STEP - 1e-9));
    for (let j = 0; j < n; j++) S.push(a + ((b - a) * j) / n);
  }
  S.push(ch.L);
  const N = S.length;
  const h: number[] = [], wet = new Uint8Array(N), chan = new Uint8Array(N), depth: number[] = new Array(N).fill(0);
  for (let i = 0; i < N; i++) {
    const p = chainAt(ch, S[i]);
    h.push(g.heightAt(p.x, p.z));
    wet[i] = g.sdfAt(p.x, p.z) < 0 ? 1 : 0;
  }
  for (const w of ch.ways) {
    const { depth: d } = spansOf(w, ch.c);
    for (let i = 0; i < N; i++) {
      if (S[i] < w.s0 - 1e-6 || S[i] > w.s1 + 1e-6) continue;
      depth[i] = Math.max(depth[i], d);
      if (w.movable) chan[i] = 1; // (a movable span is the channel, whatever the shore's mapping says)
    }
  }
  for (let i = 0; i < N; i++) if (!depth[i]) depth[i] = 1;
  const highway = HIGHWAY.has(ch.c);
  // its ends: on a street (or dry ground at the end of what this tile can see), or up in the air
  // where it runs into more bridge, or stops over the water
  const endOf = (e: ChainEnd) => ({
    land: e.approach || (!e.junction && g.sdfAt(e.x, e.z) >= 0),
    h: Math.max(g.heightAt(e.x, e.z), -0.2) + LIFT, // (the walk surface: the ground, or the water's skin)
  });
  const A = endOf(ch.ends[0]), B = endOf(ch.ends[1]);
  // A crossing's width runs from shore to shore: each edge found to the millimetre between the
  // stations either side of it — and where the water runs on past an end in the air (more bridge,
  // out of this tile's sight), on along the way's line to the far shore. Every tile that draws a
  // piece of the bridge then gives the crossing the same width, and the same clearance.
  const shore = (wetAt: (d: number) => boolean, dry: number, inWet: number) => {
    for (let n = 0; n < 24; n++) {
      const mid = (dry + inWet) / 2;
      if (wetAt(mid)) inWet = mid;
      else dry = mid;
    }
    return (dry + inWet) / 2;
  };
  const wetOn = (s: number) => { const p = chainAt(ch, s); return g.sdfAt(p.x, p.z) < 0; };
  const beyond = (k: number, inward: number) => {
    const p = ch.pts[k], q = ch.pts[k + inward], l = Math.hypot(p[0] - q[0], p[1] - q[1]) || 1;
    const dx = (p[0] - q[0]) / l, dz = (p[1] - q[1]) / l;
    const wetAt = (d: number) => g.sdfAt(p[0] + dx * d, p[1] + dz * d) < 0;
    let d = 0;
    while (d < 3000 && wetAt(d + 4)) d += 4;
    return d < 3000 ? shore(wetAt, d + 4, d) : d;
  };
  // the water: each run of it the chain crosses, at its level (the sea's datum, or a lake's — its
  // bed lies half a metre under its surface), with its clearance
  const level: number[] = new Array(N).fill(-Infinity), req: number[] = new Array(N);
  for (let i = 0; i < N; ) {
    if (!wet[i] && !chan[i]) { i++; continue; }
    let j = i;
    while (j + 1 < N && (wet[j + 1] || chan[j + 1])) j++;
    const beds: number[] = [];
    let mov = false;
    for (let k = i; k <= j; k++) {
      if (wet[k]) beds.push(h[k]);
      mov ||= !!chan[k];
    }
    beds.sort((a, b) => a - b);
    const lv = beds.length ? Math.max(0, beds[beds.length >> 1] + 0.5) : 0;
    const s0 = i > 0 ? shore(wetOn, S[i - 1], S[i]) : !A.land && wet[0] ? -beyond(0, 1) : 0;
    const s1 = j < N - 1 ? shore(wetOn, S[j + 1], S[j]) : !B.land && wet[N - 1] ? ch.L + beyond(ch.pts.length - 1, -1) : ch.L;
    const W = s1 - s0;
    const clear = mov ? CLEAR_MOVABLE : clearOver(W, highway);
    for (let k = i; k <= j; k++) (level[k] = lv), (req[k] = lv + clear + depth[k]);
    i = j + 1;
  }
  // over dry ground, just clear of it (girders past it stand in their embankment)
  for (let i = 0; i < N; i++) if (level[i] === -Infinity) req[i] = h[i] + 0.25;
  for (const u of under) for (let i = 0; i < N; i++) if (Math.abs(S[i] - u.S) <= u.half) req[i] = Math.max(req[i], u.h + u.need + depth[i]);
  // the lowest deck over all of that that falls away no steeper than its grade
  const grade = gradeOf(ch.c), steep = grade * 1.3;
  const E = req.slice();
  for (let i = 1; i < N; i++) E[i] = Math.max(E[i], E[i - 1] - grade * (S[i] - S[i - 1]));
  for (let i = N - 2; i >= 0; i--) E[i] = Math.max(E[i], E[i + 1] - grade * (S[i + 1] - S[i]));
  const Lv = Math.min(20, ch.L / 4); // the vertical curve where it leaves the street
  const rise = (d: number) => (d < Lv ? (steep * d * d) / (2 * Lv) : steep * (d - Lv / 2));
  const crown = Math.min(0.5, 0.004 * ch.L);
  const y: number[] = new Array(N);
  const base: number[] = new Array(N).fill(-Infinity);
  for (let i = 0; i < N; i++) {
    const t = S[i] / ch.L;
    let cap = E[i];
    if (A.land) cap = Math.min(cap, A.h + rise(S[i]));
    if (B.land) cap = Math.min(cap, B.h + rise(ch.L - S[i]));
    if (A.land && B.land) base[i] = A.h + (B.h - A.h) * t + crown * 4 * t * (1 - t);
    y[i] = Math.max(base[i], cap);
  }
  if (A.land) y[0] = A.h;
  if (B.land) y[N - 1] = B.h;
  // one long curve: what stands over the line between the ends, smoothed (a triangle 12 m either
  // side, shrinking to nothing at the ends — which stay where they land — so nothing sinks below it)
  const both = A.land && B.land;
  const r = both ? y.map((v, i) => v - base[i]) : y.slice();
  for (let pass = 0; pass < 2; pass++) {
    const src = r.slice();
    for (let i = 1; i < N - 1; i++) {
      const R = Math.min(12, S[i] - S[0], S[N - 1] - S[i]);
      if (R < 1e-6) continue;
      let sw = 0, sv = 0;
      for (let j = i; j >= 0 && S[i] - S[j] < R; j--) { const w = 1 - (S[i] - S[j]) / R; sw += w; sv += w * src[j]; }
      for (let j = i + 1; j < N && S[j] - S[i] < R; j++) { const w = 1 - (S[j] - S[i]) / R; sw += w; sv += w * src[j]; }
      r[i] = sv / sw;
    }
  }
  // (…and where the curve rounded a clearance's shoulder off, back up to it — to the envelope,
  // which climbs no steeper than the grade itself)
  for (let i = 0; i < N; i++) y[i] = Math.max(both ? base[i] + r[i] : r[i], Math.min(y[i], E[i]));
  // a bascule's leaves are straight girders: heel to heel
  for (const w of ch.ways) {
    if (!w.movable) continue;
    let i0 = -1, i1 = -1;
    for (let i = 0; i < N; i++) if (S[i] >= w.s0 - 1e-6 && S[i] <= w.s1 + 1e-6) { if (i0 < 0) i0 = i; i1 = i; }
    if (i1 - i0 < 2) continue;
    for (let i = i0 + 1; i < i1; i++) y[i] = y[i0] + ((y[i1] - y[i0]) * (S[i] - S[i0])) / (S[i1] - S[i0]);
  }
  return { S, y, ground: h, wet, level, depth, ends: [A, B] };
}

/** The profile's roadway surface at station s. */
export const profileAt = (pf: Profile, s: number) => interp(pf.S, pf.y, s);

// ---------------------------------------------------------------- the deck's width

/** How far the deck reaches either side of the centreline (to the parapets' inner faces), at the
 *  profile's stations: the carriageway and its sidewalks (a highway's shoulders, a lesser road's
 *  kerb strip) — and a sidewalk or path mapped as a way of its own alongside, which the deck
 *  carries out to its far edge. `taken`: those ways. */
export function deckEdges(ch: Chain, pf: Profile, roads: Road[]) {
  const S = pf.S, N = S.length;
  const base = ch.w / 2 + (HIGHWAY.has(ch.c) ? 1.2 : MINOR.has(ch.c) ? 0.6 : 1.8);
  const left: number[] = new Array(N).fill(base), right: number[] = new Array(N).fill(base);
  const taken = new Set<Road>();
  let x0 = Infinity, z0 = Infinity, x1 = -Infinity, z1 = -Infinity;
  for (const [x, z] of ch.pts) (x0 = Math.min(x0, x)), (x1 = Math.max(x1, x)), (z0 = Math.min(z0, z)), (z1 = Math.max(z1, z));
  const reach = base + 5;
  for (const r of roads) {
    if (!isSidePath(r)) continue;
    let near = false;
    for (let i = 0; i + 1 < r.p.length && !near; i += 2) near = r.p[i] / 10 > x0 - reach && r.p[i] / 10 < x1 + reach && r.p[i + 1] / 10 > z0 - reach && r.p[i + 1] / 10 < z1 + reach;
    if (!near) continue;
    const p = unpack(r.p);
    const smp: { S: number; o: number; ok: boolean }[] = [];
    for (let k = 0; k + 1 < p.length; k++) {
      const [ax, az] = p[k], [bx, bz] = p[k + 1], len = Math.hypot(bx - ax, bz - az);
      if (len < 1e-6) continue;
      const ux = (bx - ax) / len, uz = (bz - az) / len;
      for (let d = 0; d < len; d += 3) {
        const x = ax + ux * d, z = az + uz * d;
        const q = nearestOn(ch, x, z);
        const c = chainAt(ch, q.S), along = Math.abs(ux * c.tx + uz * c.tz);
        smp.push({ S: q.S, o: (x - c.x) * c.nx + (z - c.z) * c.nz, ok: q.d <= base + 4.5 && along > 0.9 && q.S > 0.5 && q.S < ch.L - 0.5 });
      }
    }
    if (smp.length < 2 || smp.filter((s) => s.ok).length < smp.length * 0.7) continue;
    taken.add(r);
    for (const s of smp) {
      if (!s.ok) continue;
      const e = Math.abs(s.o) + r.w / 2 + 0.2, side = s.o > 0 ? left : right;
      for (let i = 0; i < N; i++) if (Math.abs(S[i] - s.S) <= 3) side[i] = Math.max(side[i], e);
    }
  }
  // the widening tapers in (1 in 4) and runs smooth
  for (const e of [left, right]) {
    for (let i = 1; i < N; i++) e[i] = Math.max(e[i], e[i - 1] - 0.25 * (S[i] - S[i - 1]));
    for (let i = N - 2; i >= 0; i--) e[i] = Math.max(e[i], e[i + 1] - 0.25 * (S[i + 1] - S[i]));
    const src = e.slice();
    for (let i = 1; i < N - 1; i++) e[i] = Math.max(src[i], (src[i - 1] + src[i] * 2 + src[i + 1]) / 4);
  }
  return { left, right, base, taken };
}

// ---------------------------------------------------------------- building

const C = {
  asphalt: 0x74767a, grid: 0x5f6266, yellow: 0xe2c14e, white: 0xe6e3da, kerb: 0xbdb7aa, walk: 0xcfc9bc, shoulder: 0x8d8c88,
  parapet: 0xd6d1c6, cap: 0xe2ddd2, fascia: 0xb9b4aa, soffit: 0x8a8680, girder: 0xa29d94,
  steel: 0x4f6c66, pier: 0x9b968c, pierCap: 0xaaa59b, abut: 0xa29d93, house: 0xe9e4d8, roof: 0x5d6b58, trim: 0x6d6a66, wale: 0x6a5a48,
};

export interface BridgeOut {
  towers: THREE.Vector3[]; // a tender house's lamp (the night's warm points)
  posts: THREE.Matrix4[]; // railing posts (a unit box, scaled)
  piles: THREE.Matrix4[]; // fender piles (the timber posts' cylinder, scaled)
  taken: Set<Road>; // footways the decks carry as their sidewalks
}

/** Every bridge a tile can see, drawn where it owns the ways: the deck, its piers and abutments, a
 *  bascule's piers, tender houses and fenders, and their collision. `roads`/`lines`: the tile's,
 *  its margin's included (own: 0). */
export function buildBridges(m: Sink, walk: WalkWorld, roads: Road[], lines: Line[], g: Ground): BridgeOut {
  const out: BridgeOut = { towers: [], posts: [], piles: [], taken: new Set() };
  // (lowest layer first: a flyover clears the deck it crosses, as that deck was profiled)
  const done: { ch: Chain; pf: Profile }[] = [];
  for (const ch of chainBridges(roads).sort((a, b) => a.layer - b.layer)) {
    if (ch.L < 2) continue;
    const under = crossingsUnder(ch, roads, lines, g);
    for (const o of done) if (o.ch.layer < ch.layer) under.push(...decksUnder(ch, o.ch, o.pf));
    const pf = bridgeProfile(ch, g, under);
    done.push({ ch, pf });
    if (!ch.ways.some((w) => w.own)) continue;
    const ed = deckEdges(ch, pf, roads);
    for (const r of ed.taken) out.taken.add(r);
    ch.ways.forEach((w, k) => { if (w.own) drawWay(m, walk, ch, pf, ed, k, g, out); });
  }
  return out;
}

/** Where a chain crosses over a lower bridge's deck: that deck's roadway, a road's clearance under it. */
export function decksUnder(ch: Chain, lo: Chain, pf: Profile): Under[] {
  const out: Under[] = [];
  for (let k = 0; k + 1 < ch.pts.length; k++)
    for (let q = 0; q + 1 < lo.pts.length; q++) {
      const [px, pz] = ch.pts[k], [qx, qz] = ch.pts[k + 1], [ax, az] = lo.pts[q], [bx, bz] = lo.pts[q + 1];
      const rx = qx - px, rz = qz - pz, sx = bx - ax, sz = bz - az, den = rx * sz - rz * sx;
      if (Math.abs(den) < 1e-9) continue;
      const t = ((ax - px) * sz - (az - pz) * sx) / den, u = ((ax - px) * rz - (az - pz) * rx) / den;
      if (t < 0 || t > 1 || u < 0 || u > 1) continue;
      const sin = Math.abs(den) / ((Math.hypot(rx, rz) || 1) * (Math.hypot(sx, sz) || 1));
      out.push({ S: ch.cum[k] + t * (ch.cum[k + 1] - ch.cum[k]), h: profileAt(pf, lo.cum[q] + u * (lo.cum[q + 1] - lo.cum[q])), need: UNDER.road, half: lo.w / 2 / Math.max(0.3, sin) + 3 });
    }
  return out;
}

/** One way of a chain: the stretch of deck it carries, what holds it up, and its collision. */
function drawWay(m: Sink, walk: WalkWorld, ch: Chain, pf: Profile, ed: ReturnType<typeof deckEdges>, k: number, g: Ground, out: BridgeOut) {
  const w = ch.ways[k], movable = w.movable, highway = HIGHWAY.has(ch.c), minor = MINOR.has(ch.c);
  const hw = ch.w / 2;
  const kerb = highway ? 0 : KERB; // (a highway's shoulder runs on at the roadway's level, to its barrier)
  const railed = !highway && !minor; // (a pedestrian's railing over the parapet)
  // stations: the profile's within the way, the leaves' joint, then thinned to those the deck's
  // curve and width need (and one every 30 m at least)
  const forced = new Set<number>([w.s0, w.s1]);
  for (const s of ch.cum) if (s > w.s0 + 1e-6 && s < w.s1 - 1e-6) forced.add(s);
  if (movable) forced.add((w.s0 + w.s1) / 2);
  const fine = [...new Set([...pf.S.filter((s) => s > w.s0 + 1e-6 && s < w.s1 - 1e-6), ...forced])].sort((a, b) => a - b);
  const yAt = (s: number) => profileAt(pf, s);
  const fs = [yAt, (v: number) => interp(pf.S, ed.left, v), (v: number) => interp(pf.S, ed.right, v), (v: number) => interp(pf.S, pf.depth, v)];
  const straight = (a: number, b: number) => {
    for (let q = a + 1; q < b; q++) {
      const t = (fine[q] - fine[a]) / (fine[b] - fine[a]);
      for (const f of fs) if (Math.abs(f(fine[q]) - (f(fine[a]) + (f(fine[b]) - f(fine[a])) * t)) > 0.015) return false;
    }
    return true;
  };
  const st: number[] = [fine[0]];
  for (let j = 1, a = 0; j < fine.length; j++) {
    const keep = j === fine.length - 1 || forced.has(fine[j]) || fine[j + 1] - fine[a] > 30 || !straight(a, j + 1);
    if (keep) st.push(fine[(a = j)]);
  }
  const N = st.length;
  const px: number[] = [], pz: number[] = [], nx: number[] = [], nz: number[] = [], mi: number[] = [];
  const y: number[] = [], eL: number[] = [], eR: number[] = [], gb: number[] = [];
  for (let j = 0; j < N; j++) {
    const c = chainAt(ch, st[j]);
    px.push(c.x), pz.push(c.z), nx.push(c.nx), nz.push(c.nz), mi.push(c.mi);
    y.push(yAt(st[j]));
    eL.push(interp(pf.S, ed.left, st[j]));
    eR.push(interp(pf.S, ed.right, st[j]));
    // the girders' foot: the structure's depth under the roadway — over the water, never into it
    // (the end span, coming down to the bank, shallows into its abutment instead)
    const lv = interp(pf.S, pf.level.map((v) => (v === -Infinity ? -1e3 : v)), st[j]);
    gb.push(Math.min(y[j] - SLAB - 0.05, Math.max(y[j] - interp(pf.S, pf.depth, st[j]), lv + 0.3)));
  }
  const V = (j: number, o: number, dy: number) => new THREE.Vector3(px[j] + nx[j] * o * mi[j], y[j] + dy, pz[j] + nz[j] * o * mi[j]);
  const up = new THREE.Vector3(0, 1, 0), down = new THREE.Vector3(0, -1, 0);
  const side = (j: number, s: number) => new THREE.Vector3(nx[j] * s, 0, nz[j] * s);
  type F = (j: number) => number;
  // a strip lying flat from offset oa to ob, dy over the roadway; a face standing at offset o from
  // dy0 to dy1, facing out (+1 the left, −1 the right) — each dy a number or a function of the station
  const dyOf = (d: number | F, j: number) => (typeof d === 'number' ? d : d(j));
  const flat = (j: number, oa: F, ob: F, dy: number | F, face = up) => {
    const a = V(j, oa(j), dyOf(dy, j)), b = V(j + 1, oa(j + 1), dyOf(dy, j + 1)), c = V(j + 1, ob(j + 1), dyOf(dy, j + 1)), d = V(j, ob(j), dyOf(dy, j));
    m.quad(a, b, c, d, face);
  };
  const wall = (j: number, o: F, dy0: number | F, dy1: number | F, outw: number) =>
    m.quad(V(j, o(j), dyOf(dy0, j)), V(j + 1, o(j + 1), dyOf(dy0, j + 1)), V(j + 1, o(j + 1), dyOf(dy1, j + 1)), V(j, o(j), dyOf(dy1, j)), side(j, outw));
  const k0 = (v: number): F => () => v;
  const Lf: F = (j) => eL[j], Rf: F = (j) => -eR[j];
  const foot: F = (j) => gb[j] - y[j];
  const top = kerb + PARAPET;
  for (let j = 0; j + 1 < N; j++) {
    // the roadway — a bascule's leaves an open steel grid — and its lines
    m.color(movable ? C.grid : C.asphalt);
    flat(j, k0(-hw), k0(hw), 0);
    if (!movable && ch.w >= 5) {
      m.color(C.white);
      flat(j, k0(-hw + 0.3), k0(-hw + 0.45), 0.012);
      flat(j, k0(hw - 0.45), k0(hw - 0.3), 0.012);
      if (!ch.oneway) {
        m.color(C.yellow);
        flat(j, k0(-0.2), k0(-0.08), 0.012);
        flat(j, k0(0.08), k0(0.2), 0.012);
      }
    }
    // kerbs and sidewalks (a highway's shoulders at the roadway's level)
    if (kerb) {
      m.color(C.kerb);
      wall(j, k0(hw), 0, kerb, -1);
      wall(j, k0(-hw), 0, kerb, 1);
    }
    m.color(highway ? C.shoulder : C.walk);
    flat(j, k0(hw), Lf, kerb);
    flat(j, Rf, k0(-hw), kerb);
    // parapets: the inner face, the cap, the fascia from the slab's foot up (a bascule's in steel)
    for (const [o, ow] of [[Lf, 1], [Rf, -1]] as const) {
      const oo: F = (q) => o(q) + ow * CAP;
      m.color(movable ? C.steel : C.parapet);
      wall(j, o, kerb, top, -ow);
      m.color(movable ? C.steel : C.cap);
      flat(j, ow > 0 ? o : oo, ow > 0 ? oo : o, top);
      m.color(movable ? C.steel : C.fascia);
      wall(j, oo, -SLAB, top, ow);
      if (railed) {
        // a railing over the cap: two rails (its posts are instanced)
        const mid: F = (q) => o(q) + ow * CAP * 0.5;
        m.color(C.steel);
        for (const dy of [top + 0.28, top + 0.5]) {
          wall(j, mid, dy - 0.05, dy, ow);
          wall(j, mid, dy - 0.05, dy, -ow);
        }
      }
    }
    // the slab's soffit, and the girders under it (down to the structure's depth)
    m.color(C.soffit);
    flat(j, (q) => -eR[q] - CAP, (q) => eL[q] + CAP, -SLAB, down);
    m.color(movable ? C.steel : C.girder);
    const ng = Math.max(2, Math.round((eL[j] + eR[j]) / 2.8));
    for (let gi = 0; gi < ng; gi++) {
      const at: F = (q) => -eR[q] + 0.7 + ((eL[q] + eR[q] - 1.4) * gi) / (ng - 1);
      const gw = movable ? 0.4 : 0.55;
      wall(j, (q) => at(q) + gw / 2, foot, -SLAB, 1);
      wall(j, (q) => at(q) - gw / 2, foot, -SLAB, -1);
      flat(j, (q) => at(q) - gw / 2, (q) => at(q) + gw / 2, foot, down);
    }
  }
  // a bascule's joints across the roadway: where its leaves meet, and at their heels
  if (movable) {
    m.color(C.trim);
    for (const s of [w.s0, (w.s0 + w.s1) / 2, w.s1]) {
      const c = chainAt(ch, s), yy = yAt(s) + 0.015, tx = c.tx * 0.1, tz = c.tz * 0.1;
      const P0 = (o: number, d: number) => new THREE.Vector3(c.x + c.nx * o * c.mi + d * tx, yy, c.z + c.nz * o * c.mi + d * tz);
      m.quad(P0(-hw, -1), P0(hw, -1), P0(hw, 1), P0(-hw, 1), up);
    }
  }
  // railing posts every 2.5 m along the chain (counted from its start: the same posts whichever
  // tile draws them)
  if (railed) {
    const q = new THREE.Quaternion(), e = new THREE.Euler(), sc = new THREE.Vector3(0.07, 0.6, 0.07);
    for (let s = Math.ceil((w.s0 + 0.3) / 2.5) * 2.5; s < w.s1 - 0.3; s += 2.5) {
      const c = chainAt(ch, s), yy = yAt(s) + top;
      q.setFromEuler(e.set(0, -Math.atan2(c.tz, c.tx), 0));
      for (const [ee, ow] of [[interp(pf.S, ed.left, s), 1], [interp(pf.S, ed.right, s), -1]] as const) {
        const o = ow * (ee + CAP * 0.5) * c.mi;
        out.posts.push(new THREE.Matrix4().compose(new THREE.Vector3(c.x + c.nx * o, yy + 0.3, c.z + c.nz * o), q.clone(), sc));
      }
    }
  }

  if (!movable && carriedBy(w.r.bs) !== 'beam') superstructure(m, walk, ch, w, pf, ed, g, out, kerb);

  // ---- collision: the roadway and its sidewalks at their drawn heights; the parapets as walls
  const pts: P[] = [], cum: number[] = [];
  for (let j = 0; j < N; j++) {
    pts.push([px[j], pz[j]]);
    cum.push(j ? cum[j - 1] + Math.hypot(px[j] - px[j - 1], pz[j] - pz[j - 1]) : 0);
  }
  const deck = (p: P[], half: number, dy: number) => {
    const c = [0];
    for (let j = 1; j < p.length; j++) c.push(c[j - 1] + Math.hypot(p[j][0] - p[j - 1][0], p[j][1] - p[j - 1][1]));
    const yy = y.map((v) => v + dy);
    walk.addDeck({ pts: p, cum: c, halfWidth: half, heightAt: tableHeight(c, yy), profile: { k: 'table', y: yy }, cut: 1 });
  };
  if (kerb) {
    deck(pts, hw + 0.02, 0);
    for (const ow of [1, -1]) {
      const e = ow > 0 ? eL : eR;
      let half = 0;
      const p: P[] = [];
      for (let j = 0; j < N; j++) {
        const o = ow * ((hw + e[j]) / 2) * mi[j];
        p.push([px[j] + nx[j] * o, pz[j] + nz[j] * o]);
        half = Math.max(half, (e[j] - hw) / 2);
      }
      deck(p, half + 0.02, kerb);
    }
  } else {
    // (a highway's shoulders are the roadway's own level: one deck, centred between its barriers)
    const p: P[] = [];
    let half = 0;
    for (let j = 0; j < N; j++) {
      const o = ((eL[j] - eR[j]) / 2) * mi[j];
      p.push([px[j] + nx[j] * o, pz[j] + nz[j] * o]);
      half = Math.max(half, (eL[j] + eR[j]) / 2);
    }
    deck(p, half + 0.02, 0);
  }
  for (const ow of [1, -1]) {
    const e = ow > 0 ? eL : eR;
    for (let j = 0; j + 1 < N; j++) {
      const a: P = [px[j] + nx[j] * ow * e[j] * mi[j], pz[j] + nz[j] * ow * e[j] * mi[j]];
      const b: P = [px[j + 1] + nx[j + 1] * ow * e[j + 1] * mi[j + 1], pz[j + 1] + nz[j + 1] * ow * e[j + 1] * mi[j + 1]];
      walk.addWall(a, b, Math.min(y[j], y[j + 1]) - 0.7, Math.max(y[j], y[j + 1]) + kerb + 1.2);
    }
  }

  // ---- what carries it: piers between its spans, abutments where it lands, a bascule's piers
  const gbAt = (s: number) => interp(st, gb, s);
  const pierAt = (s: number) => {
    const c = chainAt(ch, s), l = interp(pf.S, ed.left, s), r = interp(pf.S, ed.right, s);
    const capTop = gbAt(s), capBot = capTop - 0.8, ang = Math.atan2(c.tz, c.tx);
    const nc = clamp(Math.round((l + r) / 6.5), 2, 4);
    const cols: [number, number, number][] = [];
    let low = Infinity;
    for (let q = 0; q < nc; q++) {
      const o = -r + 1.2 + ((l + r - 2.4) * q) / (nc - 1), x = c.x + c.nx * o, z = c.z + c.nz * o;
      const gh = g.heightAt(x, z);
      cols.push([x, z, gh]);
      low = Math.min(low, gh);
    }
    const lv = interp(pf.S, pf.level.map((v) => (v === -Infinity ? -1e3 : v)), s);
    if (capBot - Math.max(low, lv) < 0.6) return; // (the deck's on the ground here: an embankment, not a pier)
    const mid = (l - r) / 2;
    m.color(C.pierCap).box(c.x + c.nx * mid, c.z + c.nz * mid, ang, 1.4, l + r + 2 * CAP, capBot, capTop);
    m.color(C.pier);
    for (const [x, z, gh] of cols) {
      prism(m, x, z, 0.55, 10, gh - 1, capBot);
      walk.addLoop(ring(x, z, 0.6, 6), -50, capBot);
    }
  };
  const { n: spans } = spansOf(w, ch.c);
  for (let q = 1; q < spans; q++) pierAt(w.s0 + ((w.s1 - w.s0) * q) / spans);
  // a joint between two fixed ways: the way that starts there carries it
  const prev = ch.ways[k - 1];
  if (prev && Math.abs(prev.s1 - w.s0) < 1e-3 && !movable && !prev.movable) pierAt(w.s0);
  // abutments where it lands: a wall under its end, posts on its parapets' ends
  const abut = (s: number, dir: number) => {
    const c = chainAt(ch, s), yy = yAt(s), l = interp(pf.S, ed.left, s), r = interp(pf.S, ed.right, s), ang = Math.atan2(c.tz, c.tx);
    const cx = c.x + c.tx * dir * 0.7, cz = c.z + c.tz * dir * 0.7;
    let low = Infinity;
    for (const o of [-r - CAP, 0, l + CAP]) low = Math.min(low, g.heightAt(cx + c.nx * o, cz + c.nz * o));
    const mid = (l - r) / 2;
    m.color(C.abut).box(cx + c.nx * mid, cz + c.nz * mid, ang, 1.4, l + r + 2 * CAP, Math.min(low, yy - SLAB) - 1.5, yy - SLAB);
    m.color(C.cap);
    for (const [o, ow] of [[l, 1], [-r, -1]] as const) {
      const oo = o + ow * CAP * 0.5;
      m.box(c.x + c.nx * oo + c.tx * dir * 0.35, c.z + c.nz * oo + c.tz * dir * 0.35, ang, 0.7, CAP + 0.2, yy - SLAB, yy + top + 0.3);
    }
  };
  if (k === 0 && pf.ends[0].land) abut(0, 1);
  if (k === ch.ways.length - 1 && pf.ends[1].land) abut(ch.L, -1);
  // a movable span: the bascule piers at both its ends — wide, the leaves' counterweights inside —
  // a tender house on each corner, and the channel's timber fenders off their faces
  if (movable) {
    for (const [s, into] of [[w.s0, 1], [w.s1, -1]] as const) {
      const c = chainAt(ch, s), yy = yAt(s), l = interp(pf.S, ed.left, s), r = interp(pf.S, ed.right, s), ang = Math.atan2(c.tz, c.tx);
      const reach = 5.0, len = 8;
      const cx = c.x - c.tx * into * 2, cz = c.z - c.tz * into * 2; // (mostly under the fixed span's end: the leaf's heel)
      let low = Infinity;
      for (const o of [-r - reach, 0, l + reach]) for (const d of [-len / 2, len / 2]) low = Math.min(low, g.heightAt(cx + c.nx * o + c.tx * d, cz + c.nz * o + c.tz * d));
      const lv = Math.max(0, interp(pf.S, pf.level.map((v) => (v === -Infinity ? 0 : v)), s));
      const pTop = yy - SLAB - 0.05, mid = (l - r) / 2;
      m.color(C.pier).box(cx + c.nx * mid, cz + c.nz * mid, ang, len, l + r + 2 * reach, Math.min(low, lv) - 1, pTop);
      const pr: P[] = [];
      for (const [o, d] of [[-r - reach, -len / 2], [l + reach, -len / 2], [l + reach, len / 2], [-r - reach, len / 2]]) pr.push([cx + c.nx * o + c.tx * d, cz + c.nz * o + c.tz * d]);
      walk.addLoop(pr, -50, pTop - 0.4);
      // the tender houses, on the pier past the parapets
      for (const [o, ow] of [[l, 1], [-r, -1]] as const) {
        const oc = o + ow * (CAP + 0.5 + 1.6), hx = cx + c.nx * oc, hz = cz + c.nz * oc;
        m.color(C.house).box(hx, hz, ang, 3.6, 3.2, pTop, yy + 1.4);
        m.color(C.trim).box(hx, hz, ang, 3.65, 3.25, yy + 1.4, yy + 2.3); // (its band of windows)
        m.color(C.house).box(hx, hz, ang, 3.6, 3.2, yy + 2.3, yy + 3.0);
        roofTo(m, hx, hz, ang, 4.1, 3.7, yy + 3.0, yy + 4.5);
        out.towers.push(new THREE.Vector3(hx, yy + 4.6, hz));
      }
      // fenders: a line of timber piles along the channel's edge off the pier's face, its wales
      // across them, running on past the pier up- and downstream
      const fd = len / 2 + 0.8, fx = cx + c.tx * into * fd, fz = cz + c.tz * into * fd;
      const a0 = -r - reach - 10, a1 = l + reach + 10, ftop = lv + 1.8;
      const q = new THREE.Quaternion();
      for (let o = a0; o <= a1 + 1e-6; o += 2) {
        const x = fx + c.nx * o, z = fz + c.nz * o, gh = g.heightAt(x, z);
        out.piles.push(new THREE.Matrix4().compose(new THREE.Vector3(x, (ftop + gh - 0.5) / 2, z), q, new THREE.Vector3(1.6, ftop - gh + 0.5, 1.6)));
      }
      m.color(C.wale);
      for (const wy of [lv + 0.6, lv + 1.5]) {
        const A = (o: number, yy2: number) => new THREE.Vector3(fx + c.nx * o + c.tx * into * 0.25, yy2, fz + c.nz * o + c.tz * into * 0.25);
        m.quad(A(a0, wy - 0.25), A(a1, wy - 0.25), A(a1, wy + 0.05), A(a0, wy + 0.05), new THREE.Vector3(c.tx * into, 0, c.tz * into));
        m.quad(A(a0, wy - 0.25), A(a1, wy - 0.25), A(a1, wy + 0.05), A(a0, wy + 0.05), new THREE.Vector3(-c.tx * into, 0, -c.tz * into));
      }
      const fA: P = [fx + c.nx * a0, fz + c.nz * a0], fB: P = [fx + c.nx * a1, fz + c.nz * a1];
      walk.addWall(fA, fB, -50, ftop);
    }
  }
}

// ---------------------------------------------------------------- superstructures

/** A square member from a to b, t thick (a truss's chord, a hanger, a cable, a stay). */
function strut(m: Sink, a: THREE.Vector3, b: THREE.Vector3, t: number) {
  const d = new THREE.Vector3().subVectors(b, a);
  if (d.lengthSq() < 1e-6) return;
  d.normalize();
  const u = Math.abs(d.y) < 0.9 ? new THREE.Vector3(0, 1, 0).cross(d).normalize() : new THREE.Vector3(1, 0, 0).cross(d).normalize();
  const v = new THREE.Vector3().crossVectors(d, u);
  const h = t / 2;
  const c = (p: THREE.Vector3, su: number, sv: number) => p.clone().addScaledVector(u, su * h).addScaledVector(v, sv * h);
  for (const [su0, sv0, su1, sv1, fu, fv] of [[1, -1, 1, 1, 1, 0], [-1, 1, -1, -1, -1, 0], [1, 1, -1, 1, 0, 1], [-1, -1, 1, -1, 0, -1]] as const)
    m.quad(c(a, su0, sv0), c(b, su0, sv0), c(b, su1, sv1), c(a, su1, sv1), u.clone().multiplyScalar(fu).addScaledVector(v, fv));
}

/** What holds up a deck the map says isn't a beam bridge: through trusses along its parapets; an
 *  arch — over a deck that stands low over its gap, hangers down to it, under one that stands
 *  high, columns up to it; a suspension bridge's towers and cables, their hangers; a cable-stayed
 *  bridge's pylons and fans of stays. Its towers and pylons stand to the riverbed (walls there). */
function superstructure(m: Sink, walk: WalkWorld, ch: Chain, w: ChainWay, pf: Profile, ed: ReturnType<typeof deckEdges>, g: Ground, out: BridgeOut, kerb: number) {
  const kind = carriedBy(w.r.bs), len = w.s1 - w.s0;
  const yAt = (s: number) => profileAt(pf, s);
  const edge = (s: number, side: number) => interp(pf.S, side > 0 ? ed.left : ed.right, s);
  const levels = pf.level.map((v) => (v === -Infinity ? -1e3 : v));
  /** a point over the deck's edge line (side ±1, `outw` past its parapet's inner face), dy over the roadway */
  const at = (s: number, side: number, dy: number, outw = CAP / 2) => {
    const c = chainAt(ch, s), o = side * (edge(s, side) + outw) * c.mi;
    return new THREE.Vector3(c.x + c.nx * o, yAt(s) + dy, c.z + c.nz * o);
  };
  /** what stands under the deck at s: the ground, or the water's surface over it */
  const under = (s: number) => {
    const c = chainAt(ch, s);
    return Math.max(g.heightAt(c.x, c.z), interp(pf.S, levels, s));
  };
  m.color(C.steel);
  if (kind === 'truss') {
    const { n } = spansOf(w, ch.c), span = len / n, H = clamp(span / 7, 5.5, 11);
    for (let q = 0; q < n; q++) {
      const a = w.s0 + span * q, np = Math.max(2, Math.round(span / 6));
      const sk = (k: number) => a + (span * k) / np;
      for (const side of [1, -1]) {
        const B = (k: number) => at(sk(k), side, kerb + 0.15), T = (k: number) => at(sk(k), side, kerb + H);
        for (let k = 0; k < np; k++) {
          if (k === 0) strut(m, B(0), T(1), 0.5); // (its inclined end posts)
          else if (k === np - 1) strut(m, T(k), B(k + 1), 0.5);
          else strut(m, T(k), T(k + 1), 0.5); // the top chord
          if (k > 0) strut(m, B(k), T(k), 0.3);
          if (k > 0 && k < np - 1) strut(m, k % 2 ? B(k) : T(k), k % 2 ? T(k + 1) : B(k + 1), 0.28);
        }
      }
      // the bracing overhead: a strut across at every panel point, and crossed between them
      for (let k = 1; k < np; k++) {
        strut(m, at(sk(k), 1, kerb + H - 0.2), at(sk(k), -1, kerb + H - 0.2), 0.25);
        if (k + 1 < np) strut(m, at(sk(k), 1, kerb + H - 0.2), at(sk(k + 1), -1, kerb + H - 0.2), 0.15);
      }
    }
    return;
  }
  if (kind === 'arch') {
    const mid = (w.s0 + w.s1) / 2, NS = Math.max(8, Math.round(len / 4));
    if (yAt(mid) - under(mid) > len / 5) {
      // a deck arch: ribs from springings at the gap's sides up to under the deck at mid-span,
      // and columns from them up to it
      const sA = w.s0 + 0.03 * len, sB = w.s1 - 0.03 * len, yS0 = under(sA) + 0.3, yS1 = under(sB) + 0.3;
      const crown = yAt(mid) - SLAB - 1.2;
      const rib = (t: number) => yS0 + (yS1 - yS0) * t + (crown - (yS0 + yS1) / 2) * 4 * t * (1 - t);
      for (const side of [1, -1]) {
        const P = (t: number) => {
          const s = sA + (sB - sA) * t, c = chainAt(ch, s), o = side * Math.max(1, edge(s, side) - 1.2) * c.mi;
          return new THREE.Vector3(c.x + c.nx * o, rib(t), c.z + c.nz * o);
        };
        for (let k = 0; k < NS; k++) strut(m, P(k / NS), P((k + 1) / NS), 1.1);
        for (let k = 1; k < NS; k += 2) {
          const p = P(k / NS), top = yAt(sA + ((sB - sA) * k) / NS) - SLAB - 1;
          if (top - p.y > 0.6) strut(m, p, new THREE.Vector3(p.x, top, p.z), 0.6);
        }
      }
    } else {
      // a through arch: ribs over the deck's edges, hangers down to them, braced overhead
      const H = clamp(len / 5, 6, 45);
      const P = (t: number, side: number) => at(w.s0 + len * t, side, kerb + 0.15 + H * 4 * t * (1 - t));
      for (const side of [1, -1]) {
        for (let k = 0; k < NS; k++) strut(m, P(k / NS, side), P((k + 1) / NS, side), clamp(len / 90, 0.6, 1.6));
        for (let k = 1; k < NS; k++) {
          const t = k / NS, p = P(t, side), d = at(w.s0 + len * t, side, kerb + 0.15);
          if (p.y - d.y > 1) strut(m, p, d, 0.08);
        }
      }
      for (let k = 1; k < NS; k += 2) if (H * 4 * (k / NS) * (1 - k / NS) > 6) strut(m, P(k / NS, 1), P(k / NS, -1), 0.4);
    }
    return;
  }
  // towers (a suspension bridge's a fifth of the way in from each end) and pylons (a cable-stayed
  // bridge's: one at mid-span, or one at each third of a long one)
  const towersAt = kind === 'suspension' ? [w.s0 + 0.2 * len, w.s1 - 0.2 * len] : len > 260 ? [w.s0 + len / 3, w.s1 - len / 3] : [(w.s0 + w.s1) / 2];
  const reach = kind === 'suspension' ? 0.6 * len : towersAt.length > 1 ? len / 3 : len / 2;
  const Ht = kind === 'suspension' ? clamp(reach / 9, 12, 160) : clamp(reach * 0.45, 12, 150);
  const legT = clamp(Ht / 22, 1.2, 5), off = legT / 2 + 0.6;
  for (const s of towersAt) {
    const y0 = yAt(s), c = chainAt(ch, s), ang = Math.atan2(c.tz, c.tx), ca = Math.cos(ang), sa = Math.sin(ang);
    const foot = Math.min(under(s), Math.max(0, interp(pf.S, levels, s))) - 1, h = legT / 2 + 0.2;
    const legs = [1, -1].map((side) => at(s, side, 0, off));
    m.color(C.pier);
    for (const p of legs) {
      m.box(p.x, p.z, ang, legT, legT, foot, y0 + Ht);
      walk.addLoop([[-h, -h], [h, -h], [h, h], [-h, h]].map(([u, v]) => [p.x + u * ca - v * sa, p.z + u * sa + v * ca] as P), -50, y0 + Ht);
    }
    m.color(C.pierCap);
    for (const dy of [-1 - interp(pf.S, pf.depth, s), Ht * 0.55, Ht - 1]) strut(m, new THREE.Vector3(legs[0].x, y0 + dy, legs[0].z), new THREE.Vector3(legs[1].x, y0 + dy, legs[1].z), legT * 0.8);
    out.towers.push(new THREE.Vector3((legs[0].x + legs[1].x) / 2, y0 + Ht + 0.5, (legs[0].z + legs[1].z) / 2));
  }
  m.color(C.steel);
  if (kind === 'suspension') {
    const [tA, tB] = towersAt, NS = Math.max(12, Math.round(len / 8));
    const cableY = (s: number) => {
      if (s <= tA) return yAt(w.s0) + 1 + ((yAt(tA) + Ht - yAt(w.s0) - 1) * (s - w.s0)) / Math.max(1e-6, tA - w.s0);
      if (s >= tB) return yAt(w.s1) + 1 + ((yAt(tB) + Ht - yAt(w.s1) - 1) * (w.s1 - s)) / Math.max(1e-6, w.s1 - tB);
      const u = (s - tA) / (tB - tA), top = yAt(tA) + Ht + (yAt(tB) - yAt(tA)) * u, sag = (2 * u - 1) * (2 * u - 1);
      return yAt(s) + 1.5 + (top - yAt(s) - 1.5) * sag;
    };
    for (const side of [1, -1]) {
      const C3 = (s: number) => { const p = at(s, side, 0, off); p.y = cableY(s); return p; };
      const knots = [...Array.from({ length: NS + 1 }, (_, k) => w.s0 + (len * k) / NS), tA, tB].sort((a, b) => a - b);
      for (let k = 0; k + 1 < knots.length; k++) if (knots[k + 1] - knots[k] > 0.01) strut(m, C3(knots[k]), C3(knots[k + 1]), 0.45);
      for (let s = w.s0 + 6; s < w.s1 - 3; s += 6) {
        if (Math.abs(s - tA) < 3 || Math.abs(s - tB) < 3) continue;
        const top = C3(s), foot = at(s, side, kerb + 0.15, off);
        if (top.y - foot.y > 0.8) strut(m, top, foot, 0.08);
      }
    }
    return;
  }
  // the stays: a fan from high on each pylon out to the deck's edges either side, every 8 m
  for (const s of towersAt)
    for (const side of [1, -1])
      for (const dir of [1, -1])
        for (let d = 10; d < reach * 0.95; d += 8) {
          const sd = s + dir * d;
          if (sd <= w.s0 + 2 || sd >= w.s1 - 2) continue;
          strut(m, at(s, side, Ht * (0.6 + 0.37 * (d / reach)), off), at(sd, side, kerb + 0.3, 0.1), 0.12);
        }
}

const ring = (x: number, z: number, r: number, n: number): P[] => Array.from({ length: n }, (_, i) => [x + Math.cos((i / n) * Math.PI * 2) * r, z + Math.sin((i / n) * Math.PI * 2) * r] as P);

/** A round column: an n-sided prism from y0 to y1. */
function prism(m: Sink, x: number, z: number, r: number, n: number, y0: number, y1: number) {
  for (let i = 0; i < n; i++) {
    const a0 = (i / n) * Math.PI * 2, a1 = ((i + 1) / n) * Math.PI * 2;
    const ax = x + Math.cos(a0) * r, az = z + Math.sin(a0) * r, bx = x + Math.cos(a1) * r, bz = z + Math.sin(a1) * r;
    const o = new THREE.Vector3(Math.cos((a0 + a1) / 2), 0, Math.sin((a0 + a1) / 2));
    m.quad(new THREE.Vector3(ax, y0, az), new THREE.Vector3(bx, y0, bz), new THREE.Vector3(bx, y1, bz), new THREE.Vector3(ax, y1, az), o);
  }
}

/** A hipped roof over a box (l along `ang`, w across) from its eaves at y0 to its ridge at y1. */
function roofTo(m: Sink, cx: number, cz: number, ang: number, l: number, w: number, y0: number, y1: number) {
  const c = Math.cos(ang), s = Math.sin(ang);
  const pt = (u: number, v: number, yy: number) => new THREE.Vector3(cx + u * c - v * s, yy, cz + u * s + v * c);
  const o = (u: number, v: number) => new THREE.Vector3(u * c - v * s, 0.8, u * s + v * c);
  const r = Math.max(0, (l - w) / 2);
  const E = [pt(-l / 2, -w / 2, y0), pt(l / 2, -w / 2, y0), pt(l / 2, w / 2, y0), pt(-l / 2, w / 2, y0)];
  const A = pt(-r, 0, y1), B = pt(r, 0, y1);
  m.color(C.roof);
  m.quad(E[0], E[1], B, A, o(0, -1));
  m.quad(E[2], E[3], A, B, o(0, 1));
  m.tri(E[1], E[2], B, o(1, 0));
  m.tri(E[3], E[0], A, o(-1, 0));
  m.quad(E[0], E[1], E[2], E[3], new THREE.Vector3(0, -1, 0));
}
