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
import type { Building, Point, Road } from './data';
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

export interface KerbSpace { x: number; z: number; yaw: number; mode: 1 | 2; hq: number; road: Road }
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
    if (!r.pk || r.pk === NO_PARK || r.lod || r.br || r.tu || r.w < 10) continue;
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
          out.push({ x, z, yaw: Math.atan2(-dx, -dz), mode, hq, road: r });
        }
      }
    }
  }
  return out;
}

/** A test for a parked car's body (`corners`, its box): is it in the way — a street's centreline
 *  running through it (a driveway's mouth, a lot drawn over a carriageway), standing in two streets'
 *  carriageways that meet at an angle (a side street's mouth), or across one street's lanes rather
 *  than along its kerb (more than a nose over the kerb line; an angled bay's depth at an angle). A
 *  car at its own street's kerb stands in that one only. (Sea Bright's shopfront spaces along Ocean Avenue parked across
 *  Church Street's and New Street's mouths: you couldn't turn in.) Every way a car may take, not a
 *  bridge's deck over it or a tunnel under it. */
export function streetThrough(roads: Road[]) {
  const C = 16, grid = new Map<number, number[]>(), segs: number[] = [], half: number[] = [];
  const key = (i: number, j: number) => (i + 65536) * 131072 + (j + 65536);
  for (const r of roads) {
    if (r.lod || r.br || r.tu || FOOT.test(r.c) || r.c === 'track' || r.c === 'steps') continue;
    for (let i = 0; i + 3 < r.p.length; i += 2) {
      const ax = r.p[i] / 10, az = r.p[i + 1] / 10, bx = r.p[i + 2] / 10, bz = r.p[i + 3] / 10, id = segs.length, hw = r.w / 2;
      segs.push(ax, az, bx, bz);
      half[id / 4] = hw;
      for (let u = Math.floor((Math.min(ax, bx) - hw) / C); u <= Math.floor((Math.max(ax, bx) + hw) / C); u++)
        for (let v = Math.floor((Math.min(az, bz) - hw) / C); v <= Math.floor((Math.max(az, bz) + hw) / C); v++) (grid.get(key(u, v)) ?? grid.set(key(u, v), []).get(key(u, v))!).push(id);
    }
  }
  const cross = (ax: number, az: number, bx: number, bz: number, cx: number, cz: number, dx: number, dz: number) => {
    const d1 = (bx - ax) * (cz - az) - (bz - az) * (cx - ax), d2 = (bx - ax) * (dz - az) - (bz - az) * (dx - ax);
    const d3 = (dx - cx) * (az - cz) - (dz - cz) * (ax - cx), d4 = (dx - cx) * (bz - cz) - (dz - cz) * (bx - cx);
    return d1 * d2 < 0 && d3 * d4 < 0;
  };
  const inside = (x: number, z: number, q: P[]) => {
    let s = 0;
    for (let i = 0; i < q.length; i++) { const [ax, az] = q[i], [bx, bz] = q[(i + 1) % q.length], c = (bx - ax) * (z - az) - (bz - az) * (x - ax); if (c !== 0) { if (s && Math.sign(c) !== s) return false; s = Math.sign(c); } }
    return true;
  };
  return (corners: P[]) => {
    let x0 = Infinity, z0 = Infinity, x1 = -Infinity, z1 = -Infinity;
    for (const [x, z] of corners) (x0 = Math.min(x0, x)), (x1 = Math.max(x1, x)), (z0 = Math.min(z0, z)), (z1 = Math.max(z1, z));
    const seen = new Set<number>(), dirs: number[] = [];
    const heading = Math.atan2(corners[3][1] - corners[0][1], corners[3][0] - corners[0][0]); // (its length)
    for (let u = Math.floor(x0 / C); u <= Math.floor(x1 / C); u++)
      for (let v = Math.floor(z0 / C); v <= Math.floor(z1 / C); v++)
        for (const id of grid.get(key(u, v)) ?? []) {
          if (seen.has(id)) continue;
          seen.add(id);
          const ax = segs[id], az = segs[id + 1], bx = segs[id + 2], bz = segs[id + 3];
          if (inside(ax, az, corners) || inside(bx, bz, corners)) return true;
          for (let k = 0; k < corners.length; k++) { const [cx, cz] = corners[k], [dx, dz] = corners[(k + 1) % corners.length]; if (cross(ax, az, bx, bz, cx, cz, dx, dz)) return true; }
          // in this street's carriageway (a corner 30 cm and more inside its kerb): its heading noted
          const ex = bx - ax, ez = bz - az, L2 = ex * ex + ez * ez;
          if (L2 < 1e-6) continue;
          let near = Infinity;
          for (const [x, z] of corners) { const t = Math.max(0, Math.min(1, ((x - ax) * ex + (z - az) * ez) / L2)); near = Math.min(near, Math.hypot(ax + ex * t - x, az + ez * t - z)); }
          const depth = half[id / 4] - near;
          if (depth < 0.3) continue;
          const a = Math.atan2(ez, ex), turn = Math.abs(((heading - a) % Math.PI) + Math.PI) % Math.PI, rel = Math.min(turn, Math.PI - turn);
          if ((rel > 1.22 && depth > 0.6) || (rel > 0.44 && depth > 5.2)) return true;
          // (two streets at an angle — not one street's ways joined end to end)
          for (const b of dirs) { const d = Math.abs(((a - b) % Math.PI) + Math.PI) % Math.PI; if (Math.min(d, Math.PI - d) > 0.45) return true; }
          dirs.push(a);
        }
    return false;
  };
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

/** Is (x, z) on a carriageway — within the half width (and `pad`) of any way a car may take, not a
 *  bridge's deck over it or a tunnel under it? For what's set at a kerb (a street tree's pit, its litter
 *  bin: props.ts): one street's kerb is another's lane at a junction — Asheville's pits and their
 *  trees stood in the lanes of the streets they met. `skip`: ways that don't count (a parked car's own
 *  street; one a level below it). */
export function carriageAt(roads: Road[]) {
  const C = 16, grid = new Map<number, number[]>(), segs: number[] = [], of: Road[] = [];
  const key = (i: number, j: number) => (i + 65536) * 131072 + (j + 65536);
  for (const r of roads) {
    if (r.lod || r.br || r.tu || FOOT.test(r.c) || r.c === 'track' || r.c === 'steps') continue;
    const hw = r.w / 2;
    for (let i = 0; i + 3 < r.p.length; i += 2) {
      const ax = r.p[i] / 10, az = r.p[i + 1] / 10, bx = r.p[i + 2] / 10, bz = r.p[i + 3] / 10, id = segs.length / 5;
      segs.push(ax, az, bx, bz, hw);
      of.push(r);
      // (a cell lists every segment within its half width and 2 m: a pad up to 2 m is found from the point's cell)
      for (let u = Math.floor((Math.min(ax, bx) - hw - 2) / C); u <= Math.floor((Math.max(ax, bx) + hw + 2) / C); u++)
        for (let v = Math.floor((Math.min(az, bz) - hw - 2) / C); v <= Math.floor((Math.max(az, bz) + hw + 2) / C); v++) (grid.get(key(u, v)) ?? grid.set(key(u, v), []).get(key(u, v))!).push(id);
    }
  }
  return (x: number, z: number, pad = 0, skip?: (r: Road) => boolean) => {
    for (const id of grid.get(key(Math.floor(x / C), Math.floor(z / C))) ?? []) {
      if (skip?.(of[id])) continue;
      const ax = segs[id * 5], az = segs[id * 5 + 1], ex = segs[id * 5 + 2] - ax, ez = segs[id * 5 + 3] - az, L2 = ex * ex + ez * ez;
      const t = L2 ? Math.max(0, Math.min(1, ((x - ax) * ex + (z - az) * ez) / L2)) : 0;
      if (Math.hypot(ax + ex * t - x, az + ez * t - z) < segs[id * 5 + 4] + pad) return true;
    }
    return false;
  };
}
/** A parked lane's width at the kerb, by mode (realTile.ts: 1 parallel, 2 angled). */
const PARK_W = [0, 2.2, 4.8];
/** `pk` for a stretch whose guessed parking fitToFronts gave back: no parked lane at either kerb —
 *  and none assumed (groundCover.ts laneLayout's default for a wide street, props.ts's cars at a
 *  shop's door). */
export const NO_PARK = 16;
/** Open country along a street (fitToFronts): fewer than OPEN_N buildings within OPEN_R m of a sample,
 *  for OPEN_RUN samples (3 m each) or more in a row — a pair of farmhouses doesn't make a town. */
const OPEN_R = 50, OPEN_N = 4, OPEN_RUN = 20;
/** A street's guessed parking given back where its buildings stand (tileBuild.ts). The tile service
 *  widens every untagged street in North America for a parked lane at each kerb (realTile.ts
 *  PARK_DEFAULT: a residential street 10.9 m), and an old town's fronts stand inside that —
 *  Asheville's Wall Street ran its asphalt up to its shops, their stoops out in the lane and no
 *  sidewalk; a twentieth of the streets sampled in Asheville and Chicago had a front inside the
 *  road. Where a tile's own street runs 12 m or more past mapped fronts closer than 1.5 m beyond its
 *  kerb, that stretch parks no cars (NO_PARK): the way is cut there and the stretch drawn at its travel
 *  lanes' width — and where fronts stand both sides closer than that, a canyon's (a width tagged in
 *  feet, Lawyers Alley's "15"), as wide as the room between them less a sidewalk each side, never under
 *  a lane each way. Only the tile's own ways and what it can see (its box and 40 m round it): a neighbour has
 *  the way whole at its first width and keeps its things off that wider street, which is safe. A
 *  lifted part (an arcade, a skyway), a canopy, a nested or a guessed outline isn't a front.
 *  And a stretch with nothing built along it — 60 m or more with fewer than four buildings within 50 m:
 *  a road through the desert, the woods or the fields, a commercial strip's road past its car parks —
 *  parks no one either, drawn the same way at its travel lanes' width. The guess made every rural road
 *  4.4 m too wide: Saguaro's one-way Cactus Forest Drive 10.4 m, its prickly pears 9 m off its middle
 *  where the photo has them at the asphalt's edge.
 *  Returns `roads` itself when nothing changed. */
export function fitToFronts(roads: Road[], buildings: Building[], box: { x0: number; z0: number; x1: number; z1: number }): Road[] {
  const fit = (r: Road) => r.own !== 0 && !r.br && !r.tu && !r.lod && CARRIAGE.test(r.c);
  if (!roads.some(fit)) return roads;
  // every building's middle (a lifted part's too: a skyway is the town's), in a 32 m grid — how built up
  // a way's surroundings are
  const BC = 32, mids = new Map<number, number[]>();
  for (const b of buildings) {
    if (b.in || b.r.length < 6) continue;
    let cx = 0, cz = 0;
    const n = b.r.length / 2;
    for (let i = 0; i < n; i++) (cx += b.r[2 * i] / 10 / n), (cz += b.r[2 * i + 1] / 10 / n);
    const k = (Math.floor(cx / BC) + 65536) * 131072 + (Math.floor(cz / BC) + 65536), l = mids.get(k);
    if (l) l.push(cx, cz);
    else mids.set(k, [cx, cz]);
  }
  const builtNear = (x: number, z: number) => {
    let c = 0;
    for (let u = Math.floor((x - OPEN_R) / BC); u <= Math.floor((x + OPEN_R) / BC); u++)
      for (let v = Math.floor((z - OPEN_R) / BC); v <= Math.floor((z + OPEN_R) / BC); v++) {
        const l = mids.get((u + 65536) * 131072 + (v + 65536));
        if (l) for (let q = 0; q < l.length; q += 2) if (Math.hypot(l[q] - x, l[q + 1] - z) < OPEN_R && ++c >= OPEN_N) return c;
      }
    return c;
  };
  // the fronts' edges, in an 8 m grid
  const C = 8, grid = new Map<number, number[]>(), E: number[] = [];
  const key = (i: number, j: number) => (i + 65536) * 131072 + (j + 65536);
  for (const b of buildings) {
    if (b.gen || b.cn || b.in || (b.lf ?? 0) > 1.5) continue;
    const n = b.r.length / 2;
    for (let i = 0; i < n; i++) {
      const j = (i + 1) % n, ax = b.r[2 * i] / 10, az = b.r[2 * i + 1] / 10, bx = b.r[2 * j] / 10, bz = b.r[2 * j + 1] / 10, id = E.length / 4;
      E.push(ax, az, bx, bz);
      for (let u = Math.floor(Math.min(ax, bx) / C); u <= Math.floor(Math.max(ax, bx) / C); u++)
        for (let v = Math.floor(Math.min(az, bz) / C); v <= Math.floor(Math.max(az, bz) / C); v++) (grid.get(key(u, v)) ?? grid.set(key(u, v), []).get(key(u, v))!).push(id);
    }
  }
  const stamp = new Int32Array(E.length / 4);
  let tick = 0;
  // the nearest front along the ray from (x, z) in the unit direction (nx, nz), out to L (else Infinity)
  const ray = (x: number, z: number, nx: number, nz: number, L: number) => {
    tick++;
    let best = Infinity;
    for (let t = 0; t <= L + C / 2; t += C / 2) {
      const tt = Math.min(t, L), u = Math.floor((x + nx * tt) / C), v = Math.floor((z + nz * tt) / C);
      for (let du = -1; du <= 1; du++)
        for (let dv = -1; dv <= 1; dv++)
          for (const id of grid.get(key(u + du, v + dv)) ?? []) {
            if (stamp[id] === tick) continue;
            stamp[id] = tick;
            const ax = E[id * 4], az = E[id * 4 + 1], ex = E[id * 4 + 2] - ax, ez = E[id * 4 + 3] - az, den = nx * ez - nz * ex;
            if (Math.abs(den) < 1e-9) continue;
            const s = ((ax - x) * ez - (az - z) * ex) / den, w = ((ax - x) * nz - (az - z) * nx) / den;
            if (s >= 0 && s <= L && w >= 0 && w <= 1 && s < best) best = s;
          }
    }
    return best;
  };
  const seen = (x: number, z: number) => x > box.x0 - 40 && x < box.x1 + 40 && z > box.z0 - 40 && z < box.z1 + 40;
  const S = 3; // (a sample every 3 m along the way)
  const out: Road[] = [];
  let changed = false;
  for (const r of roads) {
    if (!fit(r)) { out.push(r); continue; }
    const parks = !!r.pk && r.pk !== NO_PARK, travel = parks ? r.w - PARK_W[r.pk! & 3] - PARK_W[(r.pk! >> 2) & 3] : r.w;
    // (a canyon's street — fronts both sides — no narrower than a lane each way, a one-way's one; never
    // a motorway's or a trunk road's: their lanes are mapped)
    const big = /^(motorway|trunk)/.test(r.c), least = r.ow ? 3.6 : 5.6;
    const gives = parks && travel < r.w && travel >= 3, canyon = !big && r.w > least && E.length > 0;
    if (!gives && !canyon) { out.push(r); continue; }
    const n = r.p.length / 2, X = (i: number) => r.p[2 * i] / 10, Z = (i: number) => r.p[2 * i + 1] / 10;
    const cum = [0];
    for (let i = 1; i < n; i++) cum.push(cum[i - 1] + Math.hypot(X(i) - X(i - 1), Z(i) - Z(i - 1)));
    const total = cum[n - 1], ns = Math.floor(total / S), reach = r.w / 2 + 1.5;
    if (ns < 4) { out.push(r); continue; }
    // each sample's room: the street as it is, its travel lanes where a front stands within 1.5 m past
    // its kerb (the parking given back) or where it runs through open country (below), and where fronts
    // stand so both sides of what's left, the room between them less a 1.5 m sidewalk each side
    const tight = new Uint8Array(ns), room = new Float32Array(ns).fill(r.w), open = new Uint8Array(ns);
    for (let k = 0, i = 0; k < ns; k++) {
      const s = (k + 0.5) * S;
      while (i < n - 2 && cum[i + 1] < s) i++;
      const L = cum[i + 1] - cum[i];
      if (L < 1e-6) continue;
      const tx = (X(i + 1) - X(i)) / L, tz = (Z(i + 1) - Z(i)) / L, x = X(i) + tx * (s - cum[i]), z = Z(i) + tz * (s - cum[i]);
      if (!seen(x, z)) continue;
      const dl = ray(x, z, tz, -tx, reach), dr = ray(x, z, -tz, tx, reach);
      let a = r.w;
      if (gives && Math.min(dl, dr) < reach) a = travel;
      if (canyon && dl < a / 2 + 1.5 && dr < a / 2 + 1.5) a = Math.max(least, Math.min(a, 2 * (Math.min(dl, dr) - 1.5)));
      room[k] = a;
      if (a < r.w - 0.05) tight[k] = 1;
      if (gives && builtNear(x, z) < OPEN_N) open[k] = 1;
    }
    // (the open country's runs: 60 m or more of them parks no one)
    if (gives)
      for (let k = 0; k < ns; ) {
        if (!open[k]) { k++; continue; }
        let b = k;
        while (b + 1 < ns && open[b + 1]) b++;
        if (b - k + 1 >= OPEN_RUN) for (let j = k; j <= b; j++) (room[j] = Math.min(room[j], travel)), (tight[j] = 1);
        k = b + 1;
      }
    // the tight stretches: gaps of 6 m or less closed, 12 m or more kept, a sample wider at each end
    // (each stretch as wide as the narrowest fifth of its samples leave room for: a corner jutting out
    // doesn't pinch the street, a row standing in it does)
    const cuts: [number, number, number][] = [];
    for (let k = 0; k < ns; ) {
      if (!tight[k]) { k++; continue; }
      let b = k, gap = 0;
      for (let j = k + 1; j < ns && gap <= 2; j++) if (tight[j]) (b = j), (gap = 0); else gap++;
      if (b - k + 1 >= 4) {
        let s0 = (k - 1) * S, s1 = (b + 2) * S;
        if (s0 < 6) s0 = 0;
        if (s1 > total - 6) s1 = total;
        const rs = Array.from(room.subarray(k, b + 1)).sort((u, v) => u - v), w = +rs[Math.floor(rs.length * 0.2)].toFixed(1);
        const last = cuts[cuts.length - 1];
        if (last && s0 <= last[1]) (last[1] = s1), (last[2] = Math.min(last[2], w));
        else cuts.push([s0, s1, w]);
      }
      k = b + 1;
    }
    if (!cuts.length) { out.push(r); continue; }
    changed = true;
    // the point at s along the way, in the map's 0.1 m units (shared by the two parts it joins)
    const at = (s: number): [number, number] => {
      let i = 0;
      while (i < n - 2 && cum[i + 1] < s) i++;
      const L = cum[i + 1] - cum[i] || 1, t = Math.max(0, Math.min(1, (s - cum[i]) / L));
      return [Math.round(r.p[2 * i] + (r.p[2 * i + 2] - r.p[2 * i]) * t), Math.round(r.p[2 * i + 1] + (r.p[2 * i + 3] - r.p[2 * i + 1]) * t)];
    };
    const part = (s0: number, s1: number, w = 0) => {
      const p: number[] = [];
      const add = (x: number, z: number) => { if (p.length < 2 || p[p.length - 2] !== x || p[p.length - 1] !== z) p.push(x, z); };
      add(...at(s0));
      for (let i = 0; i < n; i++) if (cum[i] > s0 && cum[i] < s1) add(r.p[2 * i], r.p[2 * i + 1]);
      add(...at(s1));
      if (p.length < 4) return;
      const q: Road = { ...r, p };
      if (w) (q.w = w), parks && (q.pk = NO_PARK);
      out.push(q);
    };
    let s = 0;
    for (const [s0, s1, w] of cuts) {
      if (s0 > s) part(s, s0);
      part(s0, s1, Math.min(w, parks ? +travel.toFixed(1) : w));
      s = s1;
    }
    if (s < total) part(s, total);
  }
  return changed ? out : roads;
}
