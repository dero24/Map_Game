// Traffic control at junctions — one analysis, shared by the tile builder (signal masts, stop and
// yield signs) and the life sim (cars stop at red, take their turn at a stop sign, yield to the
// main road). The tile builder analyses its own junctions from the real road network and ships
// the result with the tile, so what a driver sees and what the traffic does can't disagree.
//
// Mapped control (OSM highway=traffic_signals / stop / give_way, stop=all) wins; unmapped junctions
// get the rule of the road for their shape and roads: two main roads crossing are signalled; a
// street meeting a bigger road stops (North America) or gives way (elsewhere); two equal streets
// crossing are an all-way stop in North America; the stem of a T stops or yields. Except where the
// map marks its signs: with stop and give-way signs mapped round a corner that has none, that corner
// has none — it's uncontrolled (OPEN: give way, first come), as most of Seattle's side streets are,
// instead of a stop sign at every corner and a town of cars standing still.
import type { Point, Road } from '../world/data';

/** Road class → rank (drivable ≥ 2). The life sim's speeds and route choice read the same table. */
export const RANK: Record<string, number> = {
  primary: 5, trunk: 5, primary_link: 4, trunk_link: 4, secondary: 4, secondary_link: 3, tertiary: 3, tertiary_link: 3,
  residential: 2, unclassified: 2, living_street: 2, pedestrian: 1, footway: 0, path: 0,
};

/** A car waiting at a junction stops with its centre this far behind the setback (the junction's
 *  kerb line + 1.5 m): its bumper just short of the painted crosswalk, which the walkers use —
 *  and the stop sign stands at its bumper. */
export const STOP_BACK = 5.4;

/** What a driver arriving along an arm must do. */
/** OPEN: an unmarked corner — no sign; give way to whoever has the right of way or is in the box
 *  first (the rule of an uncontrolled intersection). */
export const CTL = { GO: 0, STOP: 1, YIELD: 2, SIG_A: 3, SIG_B: 4, ALL_STOP: 5, OPEN: 6 } as const;

/** `inb`: traffic arrives along this arm (false for a one-way leaving the junction). */
export interface Arm { dx: number; dz: number; rank: number; w: number; ctl: number; inb: boolean }
export interface Junction { x: number; z: number; key: number; setback: number; arms: Arm[]; signal: boolean }

// ---------------- signal timing (the same clock drives the sim and the lit lenses) ----------------
export const SIG = { gA: 26, gB: 16, amber: 3.5, red: 2.5 } as const; // (all-red long enough for an amber runner to clear the box)
export const SIG_CYCLE = SIG.gA + SIG.amber + SIG.red + SIG.gB + SIG.amber + SIG.red;
/** A junction's phase offset (0..1) from its position — neighbours aren't in lockstep. */
export function signalKey(x: number, z: number) {
  const h = Math.imul(Math.round(x) | 0, 73856093) ^ Math.imul(Math.round(z) | 0, 19349663);
  return ((h >>> 0) % 10007) / 10007;
}
/** 0 green · 1 amber · 2 red, for the arms of phase group 0 (the main road) or 1 (the cross street). */
export function signalState(group: number, t: number, key: number) {
  const c = (((t + key * SIG_CYCLE) % SIG_CYCLE) + SIG_CYCLE) % SIG_CYCLE;
  const g0 = group === 0 ? 0 : SIG.gA + SIG.amber + SIG.red, len = group === 0 ? SIG.gA : SIG.gB;
  const u = c - g0;
  return u >= 0 && u < len ? 0 : u >= len && u < len + SIG.amber ? 1 : 2;
}
/** GLSL twin of signalState (lens shader). Needs nothing but the arguments. */
export const SIGNAL_GLSL = /* glsl */ `
float signalState(float group, float t, float key) {
  float C = ${SIG_CYCLE.toFixed(2)};
  float c = mod(t + key * C, C);
  float g0 = group < 0.5 ? 0.0 : ${(SIG.gA + SIG.amber + SIG.red).toFixed(2)};
  float len = group < 0.5 ? ${SIG.gA.toFixed(2)} : ${SIG.gB.toFixed(2)};
  float u = c - g0;
  return u >= 0.0 && u < len ? 0.0 : (u >= len && u < len + ${SIG.amber.toFixed(2)} ? 1.0 : 2.0);
}`;

// ---------------- junction analysis ----------------
export const vkey = (x: number, z: number) => `${Math.round(x * 2)},${Math.round(z * 2)}`;
/** How far round a corner (in 50 m cells: ~250 m) the map's own signs say it marks them. */
const MARKED_R = 5;
const drivable = (r: Road) => !r.lod && (RANK[r.c] ?? 0) >= 2;

/** Every junction (≥ 3 drivable arms) whose centre passes `keep`, with the control on each arm. */
export function analyzeJunctions(roads: Road[], points: Point[], na: boolean, keep: (x: number, z: number) => boolean = () => true): Junction[] {
  type Acc = { x: number; z: number; arms: Arm[] };
  const at = new Map<string, Acc>();
  for (const r of roads) {
    if (!drivable(r)) continue;
    const n = r.p.length / 2;
    const X = (i: number) => r.p[i * 2] / 10, Z = (i: number) => r.p[i * 2 + 1] / 10;
    for (let i = 0; i < n; i++) {
      const k = vkey(X(i), Z(i));
      let a = at.get(k);
      if (!a) at.set(k, (a = { x: X(i), z: Z(i), arms: [] }));
      // the arm heads ~6 m along the way (short vertex runs at a kerb don't swing it)
      for (const s of [-1, 1]) {
        let j = i + s, L = 0;
        if (j < 0 || j >= n) continue;
        while (j + s >= 0 && j + s < n && (L = Math.hypot(X(j) - X(i), Z(j) - Z(i))) < 6) j += s;
        L = Math.hypot(X(j) - X(i), Z(j) - Z(i)) || 1;
        a.arms.push({ dx: (X(j) - X(i)) / L, dz: (Z(j) - Z(i)) / L, rank: RANK[r.c], w: r.w, ctl: CTL.GO, inb: !r.ow || s < 0 });
      }
    }
  }
  const out: Junction[] = [];
  const byCell = new Map<string, Junction[]>();
  // the signs the map marks (stop, give way, all-way), by 50 m cell: does it mark them round here?
  const signs = new Map<string, number>();
  for (const p of points) if (p.c === 'stop' || p.c === 'yield' || p.c === 'stop_all') { const k = `${Math.floor(p.x / 50)},${Math.floor(p.z / 50)}`; signs.set(k, (signs.get(k) ?? 0) + 1); }
  const marked = (x: number, z: number) => {
    let n = 0;
    const cx = Math.floor(x / 50), cz = Math.floor(z / 50);
    for (let i = -MARKED_R; i <= MARKED_R; i++) for (let j = -MARKED_R; j <= MARKED_R; j++) n += signs.get(`${cx + i},${cz + j}`) ?? 0;
    return n >= 2;
  };
  for (const a of at.values()) {
    if (a.arms.length < 3 || !keep(a.x, a.z)) continue;
    const setback = Math.max(3, Math.min(12, Math.max(...a.arms.map((m) => m.w)) / 2 + 1.5));
    const J: Junction = { x: a.x, z: a.z, key: signalKey(a.x, a.z), setback, arms: a.arms, signal: false };
    ruleOfTheRoad(J, na, signs.size > 0 && marked(a.x, a.z));
    out.push(J);
    const ck = `${Math.floor(a.x / 40)},${Math.floor(a.z / 40)}`;
    (byCell.get(ck) ?? byCell.set(ck, []).get(ck)!).push(J);
  }
  // mapped control: the nearest junction to each signal / stop / give-way node
  const near = (x: number, z: number, lim: number) => {
    let best: Junction | null = null, bd = lim;
    for (let i = -1; i <= 1; i++) for (let j = -1; j <= 1; j++)
      for (const J of byCell.get(`${Math.floor(x / 40) + i},${Math.floor(z / 40) + j}`) ?? []) {
        const d = Math.hypot(J.x - x, J.z - z);
        if (d < bd) (bd = d), (best = J);
      }
    return best;
  };
  const touched = new Set<Junction>();
  for (const p of points) {
    if (p.c === 'signal' || p.c === 'stop_all') {
      const J = near(p.x, p.z, 22);
      if (!J) continue;
      if (p.c === 'signal') signalise(J);
      else for (const m of J.arms) m.ctl = CTL.ALL_STOP;
      touched.add(J);
    }
  }
  for (const p of points) {
    if (p.c !== 'stop' && p.c !== 'yield') continue;
    const J = near(p.x, p.z, 30);
    if (!J || J.signal) continue;
    if (!touched.has(J)) { for (const m of J.arms) m.ctl = CTL.GO; touched.add(J); } // the map says which arms stop
    const ux = p.x - J.x, uz = p.z - J.z, ul = Math.hypot(ux, uz) || 1;
    let arm = J.arms[0], bd = -2;
    for (const m of J.arms) { const d = (m.dx * ux + m.dz * uz) / ul; if (d > bd) (bd = d), (arm = m); }
    arm.ctl = p.c === 'stop' ? CTL.STOP : CTL.YIELD;
  }
  return out;
}

/** Arms paired into straight-through axes (a way through the junction), strays on their own. */
function axes(arms: Arm[]) {
  const used = new Set<number>(), out: { arms: Arm[]; rank: number; w: number }[] = [];
  for (let i = 0; i < arms.length; i++) {
    if (used.has(i)) continue;
    used.add(i);
    const g = [arms[i]];
    let best = -1, bd = -0.85;
    for (let j = 0; j < arms.length; j++) {
      if (used.has(j)) continue;
      const d = arms[i].dx * arms[j].dx + arms[i].dz * arms[j].dz;
      if (d < bd) (bd = d), (best = j);
    }
    if (best >= 0) { used.add(best); g.push(arms[best]); }
    out.push({ arms: g, rank: Math.max(...g.map((m) => m.rank)), w: Math.max(...g.map((m) => m.w)) });
  }
  return out.sort((a, b) => b.rank - a.rank || b.w - a.w);
}

function signalise(J: Junction) {
  J.signal = true;
  // phase A: the widest road's axis (the tile builder's masts face the same way)
  const main = J.arms.reduce((a, b) => (b.w > a.w + 0.01 || (Math.abs(b.w - a.w) <= 0.01 && b.rank > a.rank) ? b : a));
  for (const m of J.arms) m.ctl = Math.abs(m.dx * main.dx + m.dz * main.dz) > 0.7 ? CTL.SIG_A : CTL.SIG_B;
}

/** `marked`: the map marks the signs round this corner (two or more within ~250 m), so if it marks
 *  none here there are none: the minor arms give way unsigned, a crossroads of equals is open. */
function ruleOfTheRoad(J: Junction, na: boolean, marked = false) {
  const A = axes(J.arms);
  const minor = marked ? CTL.OPEN : na ? CTL.STOP : CTL.YIELD;
  if (A.length >= 2 && A[0].rank >= 4 && A[1].rank >= 4) return signalise(J); // two main roads cross
  const top = A.filter((x) => x.rank === A[0].rank);
  if (top.length === 1) {
    for (const x of A) for (const m of x.arms) m.ctl = x === A[0] ? CTL.GO : minor;
    return;
  }
  // equal roads: a straight-through street has the way over a T's stem; a crossroads of equals is
  // an all-way stop (North America) or everyone gives way
  const through = top.filter((x) => x.arms.length === 2);
  if (through.length === 1) {
    for (const x of A) for (const m of x.arms) m.ctl = x === through[0] ? CTL.GO : minor;
    return;
  }
  for (const m of J.arms) m.ctl = marked ? CTL.OPEN : na && A[0].rank >= 2 ? CTL.ALL_STOP : CTL.YIELD;
}

// ---------------- packing (tile → main thread → life worker) ----------------
/** [x, z, key, setback, n, (dx, dz, ctl) × n] per junction. */
export function packJunctions(js: Junction[]): Float32Array {
  const out: number[] = [];
  for (const J of js) {
    out.push(J.x, J.z, J.key, J.setback, J.arms.length);
    for (const m of J.arms) out.push(m.dx, m.dz, m.ctl);
  }
  return new Float32Array(out);
}
export function* unpackJunctions(f: Float32Array): Generator<{ x: number; z: number; key: number; setback: number; arms: { dx: number; dz: number; ctl: number }[] }> {
  for (let i = 0; i + 4 < f.length;) {
    const n = f[i + 4], arms: { dx: number; dz: number; ctl: number }[] = [];
    for (let k = 0; k < n; k++) arms.push({ dx: f[i + 5 + k * 3], dz: f[i + 6 + k * 3], ctl: f[i + 7 + k * 3] });
    yield { x: f[i], z: f[i + 1], key: f[i + 2], setback: f[i + 3], arms };
    i += 5 + n * 3;
  }
}
