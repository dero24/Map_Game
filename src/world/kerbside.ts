// The kerb: where a car may park along a street, and where the map says the paint goes across it.
//   Parking follows the rules most US cities share (Seattle SMC 11.72, New York, Chicago…): spaces
// every 6.3 m (angled bays every 3 m) along each kerb the map parks (realTile `pk`), kept clear of
// street corners, driveways and alley mouths, crosswalks, hydrants and bus zones — every one of
// them where OSM puts it: the nodes a street shares with other ways, the crossing, hydrant and
// bus-stop nodes beside it. Then the town decides how many are taken: four in five downtown, a
// car every few houses in the suburbs, none along a country road.
//   Crosswalks: a mapped `highway=crossing` node on a street is painted exactly there, across the
// carriageway (ladder bars, or two lines where `crossing:markings` says so; nothing where it's
// unmarked), and the junction's inferred crosswalk steps aside for it.
import type { Point, Road } from './data';
import { hashf } from '../assets/core';

type P = [number, number];
const CARRIAGE = /^(motorway|trunk|primary|secondary|tertiary|residential|unclassified|living_street)(_link)?$/;
const CUT = /^(service|track)$/; // a driveway, an alley, a lot's entrance: a curb cut
const FOOT = /^(footway|path|cycleway|pedestrian|steps|bridleway)$/;

/** Clear kerb, metres from the thing to the nearest parked car's body. */
export const CLEAR = {
  corner: 7.6, // a street corner: the crosswalk at the corner and 20 ft beyond it
  curbCut: 3.3, // a driveway or alley mouth: its half-width and 5 ft either side
  crossing: 7.6, // 20 ft from a crosswalk (from its centre line: a crosswalk is 3 m wide)
  hydrant: 4.6, // 15 ft
  busStop: 12, // the bus zone
};
/** The share of spaces taken where the blocks are fully built up. */
export const OCCUPANCY = 0.82;

export interface KerbSpace { x: number; z: number; yaw: number; mode: 1 | 2; hq: number }
export interface KerbOpts {
  left: boolean; // the region drives on the left
  built: (x: number, z: number) => number; // footprint cover (builtField): 0.03 open country … 0.23+ downtown
  inSlice?: (x: number, z: number) => boolean;
  hl?: number; // half a parked car's length
  all?: boolean; // every legal space, taken or not
}

const unpack = (f: number[]): P[] => {
  const o: P[] = [];
  for (let i = 0; i + 1 < f.length; i += 2) o.push([f[i] / 10, f[i + 1] / 10]);
  return o;
};

/** What meets each node (0.1 m ints, as the tiles store them): street arms (a way through counts
 *  two, one ending there one), curb cuts, footways. */
function meetings(ctx: Road[]) {
  const m = new Map<number, { arms: number; cut: number; foot: number }>();
  for (const r of ctx) {
    if (r.lod || r.br || r.tu) continue;
    const kind = CARRIAGE.test(r.c) ? 0 : CUT.test(r.c) ? 1 : FOOT.test(r.c) ? 2 : -1;
    if (kind < 0) continue;
    const n = r.p.length / 2;
    for (let i = 0; i < n; i++) {
      const k = r.p[2 * i] * 1e6 + r.p[2 * i + 1];
      const e = m.get(k) ?? { arms: 0, cut: 0, foot: 0 };
      if (kind === 0) e.arms += i === 0 || i === n - 1 ? 1 : 2;
      else if (kind === 1) e.cut++;
      else e.foot++;
      m.set(k, e);
    }
  }
  return m;
}

/** Where a point lies along a polyline: arc length, signed offset (+ the right of travel, +z south
 *  being right of east), distance. */
function along(p: P[], cum: number[], x: number, z: number) {
  let best = { s: 0, off: 0, d: Infinity };
  for (let i = 0; i + 1 < p.length; i++) {
    const [ax, az] = p[i], dx = p[i + 1][0] - ax, dz = p[i + 1][1] - az, L2 = dx * dx + dz * dz;
    if (L2 < 1e-6) continue;
    const t = Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / L2));
    const qx = ax + dx * t, qz = az + dz * t, d = Math.hypot(x - qx, z - qz);
    if (d < best.d) {
      const L = Math.sqrt(L2);
      best = { s: cum[i] + t * L, off: ((x - ax) * -dz + (z - az) * dx) / L, d };
    }
  }
  return best;
}

/** Every parkable space along the tile's streets, taken or not decided by the caller's hash test
 *  (`hq` below the street's occupancy is a parked car): centre, heading, parallel (1) or angled (2).
 *  `roads`: the tile's own streets; `ctx`: every way round them (to see what meets a node);
 *  `points`: hydrants, bus stops, crossings (context included — a hydrant over the cell edge
 *  still keeps its kerb clear). */
export function kerbSpaces(roads: Road[], ctx: Road[], points: Point[], o: KerbOpts): KerbSpace[] {
  const HL = o.hl ?? 2.35;
  const meet = meetings(ctx);
  const feats = points.filter((q) => q.c === 'hydrant' || q.c === 'bus' || q.c === 'bus_shelter' || q.c.startsWith('xing'));
  const out: KerbSpace[] = [];
  for (const r of roads) {
    if (!r.pk || r.lod || r.br || r.tu || r.w < 10) continue;
    const p = unpack(r.p);
    const cum = [0];
    for (let i = 1; i < p.length; i++) cum.push(cum[i - 1] + Math.hypot(p[i][0] - p[i - 1][0], p[i][1] - p[i - 1][1]));
    // the kerb kept clear, as intervals of a car's centre along the way: [s0, s1, side (0 both)]
    const keep: [number, number, number][] = [];
    const clear = (s: number, c: number, side = 0) => keep.push([s - c - HL, s + c + HL, side]);
    for (let i = 0; i < p.length; i++) {
      const e = meet.get(r.p[2 * i] * 1e6 + r.p[2 * i + 1]);
      if (!e) continue;
      if (e.arms >= 3) clear(cum[i], CLEAR.corner);
      else if (e.foot) clear(cum[i], CLEAR.crossing);
      else if (e.cut) clear(cum[i], CLEAR.curbCut);
    }
    let x0 = Infinity, z0 = Infinity, x1 = -Infinity, z1 = -Infinity;
    for (const [x, z] of p) (x0 = Math.min(x0, x)), (z0 = Math.min(z0, z)), (x1 = Math.max(x1, x)), (z1 = Math.max(z1, z));
    const reach = r.w / 2 + 12;
    for (const q of feats) {
      if (q.x < x0 - reach || q.x > x1 + reach || q.z < z0 - reach || q.z > z1 + reach) continue;
      const a = along(p, cum, q.x, q.z);
      if (q.c.startsWith('xing')) {
        if (a.d < Math.max(4, r.w / 2)) clear(a.s, CLEAR.crossing);
      } else {
        // a hydrant or a stop keeps its own kerb clear, not the far one
        // (…one mapped on the street's own line — a stop node on the way — keeps both)
        const lat = Math.abs(a.off), side = lat < r.w / 2 - 3 ? 0 : a.off >= 0 ? 1 : -1;
        if (lat < r.w / 2 + (q.c === 'hydrant' ? 6 : 12)) clear(a.s, q.c === 'hydrant' ? CLEAR.hydrant : CLEAR.busStop, side);
      }
    }
    for (const sd of [-1, 1] as const) {
      const mode = (sd < 0 ? r.pk & 3 : (r.pk >> 2) & 3) as 0 | 1 | 2;
      if (!mode) continue;
      const step = mode === 2 ? 3 : 6.3;
      // the cars on this side face with the traffic beside them
      const fwd = r.ow ? 1 : (sd > 0) !== o.left ? 1 : -1;
      for (let i = 0; i + 1 < p.length; i++) {
        const [ax, az] = p[i], [bx, bz] = p[i + 1], L = cum[i + 1] - cum[i];
        if (L < 1) continue;
        const tx = (bx - ax) / L, tz = (bz - az) / L, nx = -tz * sd, nz = tx * sd; // n: toward this kerb
        for (let s = Math.ceil((cum[i] + 1) / step) * step; s < cum[i + 1]; s += step) {
          // the way's two ends are the street's corners (or its cut at the cell's margin, where the
          // neighbour's spaces take over): a car's length from each
          if (s < HL + 1 || s > cum[cum.length - 1] - HL - 1) continue;
          if (keep.some(([s0, s1, side]) => s > s0 && s < s1 && (side === 0 || side === sd))) continue;
          const t = s - cum[i], mx = ax + tx * t, mz = az + tz * t;
          const hq = hashf(Math.floor(mx * 3.1) * 92821 + Math.floor(mz * 4.3));
          if (!o.all && hq > OCCUPANCY * Math.min(1, Math.max(0, (o.built(mx, mz) - 0.03) / 0.2))) continue;
          const off = r.w / 2 - (mode === 2 ? 2.5 : 1.15);
          const x = mx + nx * off, z = mz + nz * off;
          if (o.inSlice && !o.inSlice(x, z)) continue;
          // angled bays: nose in toward the kerb at 55° to the street
          const a = mode === 2 ? 0.96 : 0;
          const dx = tx * fwd * Math.cos(a) + nx * Math.sin(a), dz = tz * fwd * Math.cos(a) + nz * Math.sin(a);
          out.push({ x, z, yaw: Math.atan2(-dx, -dz), mode, hq });
        }
      }
    }
  }
  return out;
}

/** One car to a space: of parked cars whose bodies (`corners`, a box) overlap, the first keeps it.
 *  The inside of a bend pulls a kerb's spaces together, a lot drawn up to the street puts stalls on
 *  its kerb, two streets' kerbs meet at a corner the map didn't join. Order in, order out. */
export function oneToASpace<T extends { x: number; z: number; corners: P[] }>(cars: T[]): T[] {
  const apart = (A: P[], B: P[]) => {
    for (const Q of [A, B])
      for (let e = 0; e < 2; e++) {
        const nx = Q[e + 1][1] - Q[e][1], nz = Q[e][0] - Q[e + 1][0];
        let a0 = Infinity, a1 = -Infinity, b0 = Infinity, b1 = -Infinity;
        for (const [x, z] of A) { const d = x * nx + z * nz; a0 = Math.min(a0, d); a1 = Math.max(a1, d); }
        for (const [x, z] of B) { const d = x * nx + z * nz; b0 = Math.min(b0, d); b1 = Math.max(b1, d); }
        if (a1 <= b0 || b1 <= a0) return true;
      }
    return false;
  };
  const grid = new Map<number, P[][]>(), out: T[] = [];
  for (const c of cars) {
    const gx = Math.floor(c.x / 8), gz = Math.floor(c.z / 8);
    let taken = false;
    for (let a = -1; a <= 1 && !taken; a++) for (let b = -1; b <= 1 && !taken; b++) for (const q of grid.get((gx + a) * 92821 + gz + b) ?? []) if (!apart(q, c.corners)) { taken = true; break; }
    if (taken) continue;
    const g = gx * 92821 + gz;
    (grid.get(g) ?? grid.set(g, []).get(g)!).push(c.corners);
    out.push(c);
  }
  return out;
}

/** The tile's mapped crossings, for the ground paint: [x, z, ux, uz, w, style] each — the point on
 *  the street's centre line, the street's direction and width there, and 1 ladder bars · 2 two
 *  lines · 0 unmarked (paints nothing, but the junction's inferred crosswalk still steps aside). */
export function crossingPaint(roads: Road[], points: Point[]): number[] {
  const out: number[] = [];
  // the streets' segments on a 16 m grid (padded by the 4 m a crossing may lie off the centre line)
  const C = 16, grid = new Map<number, [Road, number][]>(), key = (i: number, j: number) => (i + 65536) * 131072 + (j + 65536);
  for (const r of roads) {
    if (r.lod || r.br || r.tu || !CARRIAGE.test(r.c)) continue;
    for (let i = 0; i + 3 < r.p.length; i += 2) {
      const ax = r.p[i] / 10, az = r.p[i + 1] / 10, bx = r.p[i + 2] / 10, bz = r.p[i + 3] / 10;
      for (let u = Math.floor((Math.min(ax, bx) - 4) / C); u <= Math.floor((Math.max(ax, bx) + 4) / C); u++)
        for (let v = Math.floor((Math.min(az, bz) - 4) / C); v <= Math.floor((Math.max(az, bz) + 4) / C); v++) (grid.get(key(u, v)) ?? grid.set(key(u, v), []).get(key(u, v))!).push([r, i]);
    }
  }
  for (const q of points) {
    if (!q.c.startsWith('xing') || q.own === 0) continue;
    let best: { d: number; x: number; z: number; ux: number; uz: number; w: number } | null = null;
    for (const [r, i] of grid.get(key(Math.floor(q.x / C), Math.floor(q.z / C))) ?? []) {
      const ax = r.p[i] / 10, az = r.p[i + 1] / 10, dx = r.p[i + 2] / 10 - ax, dz = r.p[i + 3] / 10 - az, L = Math.hypot(dx, dz);
      if (L < 0.5) continue;
      const t = Math.max(0, Math.min(1, ((q.x - ax) * dx + (q.z - az) * dz) / (L * L)));
      const x = ax + dx * t, z = az + dz * t, d = Math.hypot(q.x - x, q.z - z);
      if (d < (best?.d ?? 4)) best = { d, x, z, ux: dx / L, uz: dz / L, w: r.w };
    }
    if (!best) continue;
    const style = q.c === 'xing_u' ? 0 : q.c === 'xing_l' ? 2 : 1;
    out.push(Math.round(best.x * 10) / 10, Math.round(best.z * 10) / 10, +best.ux.toFixed(4), +best.uz.toFixed(4), best.w, style);
  }
  return out;
}
