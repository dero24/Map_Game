import { describe, it, expect } from 'vitest';
import { synthTile, standInLots } from '../src/world/synth';
import type { Building, TileSpec } from '../src/world/data';

// Neighbouring stand-in cells agree where they meet. Each builds its own cell plus a 48 m margin of
// its neighbours' (context: door snapping, porch clearance); every lot must come out the same from
// either side, and exactly one of them owns it. They used to place lots greedily in the order they
// walked their own streets, so the two sides kept different lots in the same strip (a third of
// them) — and a lot each side owned could stand across the other's: buildings doubled, overlapping
// or missing along the seam, their walls flickering against each other.

const C = 1024, M = 48;
const terrain = { sdfAt: () => 100, heightAt: () => 1 }; // (flat dry land)
const spec = (cx: number, cz: number): TileSpec => ({ id: `s${cx}_${cz}`, box: { x0: cx * C, z0: cz * C, x1: cx * C + C, z1: cz * C + C }, lod: 0, file: '', synth: 1 });
type P = [number, number];
const ring = (b: Building): P[] => { const out: P[] = []; for (let i = 0; i + 1 < b.r.length; i += 2) out.push([b.r[i] / 10, b.r[i + 1] / 10]); return out; };
const centroid = (r: P[]): P => [r.reduce((s, p) => s + p[0], 0) / r.length, r.reduce((s, p) => s + p[1], 0) / r.length];
const key = (b: Building) => b.r.join(',');

/** Do two footprints share any ground (more than touching along an edge)? Sampled on a 0.25 m lattice. */
function overlap(a: P[], b: P[]) {
  const bb = (r: P[]) => r.reduce((q, [x, z]) => [Math.min(q[0], x), Math.min(q[1], z), Math.max(q[2], x), Math.max(q[3], z)], [Infinity, Infinity, -Infinity, -Infinity]);
  const A = bb(a), B = bb(b);
  const x0 = Math.max(A[0], B[0]), z0 = Math.max(A[1], B[1]), x1 = Math.min(A[2], B[2]), z1 = Math.min(A[3], B[3]);
  if (x1 - x0 < 0.1 || z1 - z0 < 0.1) return 0;
  const pip = (x: number, z: number, r: P[]) => { let ins = false; for (let i = 0, j = r.length - 1; i < r.length; j = i++) if (r[i][1] > z !== r[j][1] > z && x < ((r[j][0] - r[i][0]) * (z - r[i][1])) / (r[j][1] - r[i][1]) + r[i][0]) ins = !ins; return ins; };
  let n = 0;
  for (let x = x0 + 0.125; x < x1; x += 0.25) for (let z = z0 + 0.125; z < z1; z += 0.25) if (pip(x, z, a) && pip(x, z, b)) n++;
  return n * 0.0625;
}

/** Owned footprints standing on each other (m² shared > 0.5), among `bs`. */
function overlaps(bs: Building[]) {
  const G = new Map<string, number[]>(), R = bs.map(ring), out: string[] = [];
  R.forEach((r, i) => {
    const [cx, cz] = centroid(r), k = `${Math.floor(cx / 40)},${Math.floor(cz / 40)}`;
    (G.get(k) ?? G.set(k, []).get(k)!).push(i);
  });
  R.forEach((r, i) => {
    const [cx, cz] = centroid(r), u = Math.floor(cx / 40), v = Math.floor(cz / 40);
    for (let du = -1; du <= 1; du++) for (let dv = -1; dv <= 1; dv++)
      for (const j of G.get(`${u + du},${v + dv}`) ?? []) if (j > i) { const a = overlap(r, R[j]); if (a > 0.5) out.push(`${centroid(r).map((q) => q.toFixed(1))} × ${centroid(R[j]).map((q) => q.toFixed(1))}: ${a.toFixed(1)} m²`); }
  });
  return out;
}

// Pairs of neighbours: east–west, north–south, and a diagonal (their margins meet in a corner).
const PAIRS: [[number, number], [number, number]][] = [[[0, 0], [1, 0]], [[-1, 2], [-1, 3]], [[2, -1], [3, 0]]];
const SEEDS = [12345, 987654321, 3];

describe('stand-in cells agree at their seams (synth.ts)', () => {
  it('a cell builds the same lots whatever was built before it', () => {
    for (const seed of SEEDS.slice(0, 2)) {
      const [[ax, az], [bx, bz]] = PAIRS[0];
      const aAlone = JSON.stringify(synthTile(spec(ax, az), seed, terrain).tj.buildings);
      const bAlone = JSON.stringify(synthTile(spec(bx, bz), seed, terrain).tj.buildings);
      const aThenB = [synthTile(spec(ax, az), seed, terrain).tj.buildings, synthTile(spec(bx, bz), seed, terrain).tj.buildings].map((b) => JSON.stringify(b));
      const bThenA = [synthTile(spec(bx, bz), seed, terrain).tj.buildings, synthTile(spec(ax, az), seed, terrain).tj.buildings].map((b) => JSON.stringify(b));
      expect(aThenB[0] === aAlone && bThenA[1] === aAlone).toBe(true);
      expect(aThenB[1] === bAlone && bThenA[0] === bAlone).toBe(true);
    }
  });

  it('a lot is the same seen through any window (standInLots is a pure function of position)', () => {
    let n = 0;
    const bad: string[] = [];
    for (const seed of SEEDS) {
      const big = { x0: -700, z0: 300, x1: 900, z1: 1900 };
      const all = new Map(standInLots(big, seed).map((l) => [`${l.x},${l.z}`, JSON.stringify(l)]));
      // small windows anywhere inside it: their edges cut through the rivalries a big one sees whole
      for (let k = 0; k < 60; k++) {
        const x0 = -600 + ((k * 389) % 1300), z0 = 400 + ((k * 617) % 1300), w = 40 + ((k * 53) % 160);
        const win = { x0, z0, x1: x0 + w, z1: z0 + w };
        const got = standInLots(win, seed);
        const want = [...all.keys()].filter((key) => { const [x, z] = key.split(',').map(Number); return x >= win.x0 && x <= win.x1 && z >= win.z0 && z <= win.z1; });
        n += want.length;
        if (got.length !== want.length) bad.push(`seed ${seed} window ${x0},${z0} (${w} m): ${got.length} lots, the big window has ${want.length}`);
        for (const l of got) if (all.get(`${l.x},${l.z}`) !== JSON.stringify(l)) bad.push(`seed ${seed}: the lot at ${l.x.toFixed(1)},${l.z.toFixed(1)} differs`);
      }
    }
    expect(n).toBeGreaterThan(40);
    expect(bad.length + ' differences: ' + bad.slice(0, 5).join('; ')).toBe('0 differences: ');
  });

  it('both sides see the same lots in their shared margin, each owned by exactly one of them', () => {
    let shared = 0;
    const bad: string[] = [];
    for (const seed of SEEDS)
      for (const [[ax, az], [bx, bz]] of PAIRS) {
        const A = synthTile(spec(ax, az), seed, terrain).tj.buildings, B = synthTile(spec(bx, bz), seed, terrain).tj.buildings;
        const a = spec(ax, az).box, b = spec(bx, bz).box;
        // the ground both build: their boxes grown by the margin, overlapping — minus 10 m inside its
        // edges (an L-shaped house's corner centroid sits a few metres off its lot's centre)
        const Z = { x0: Math.max(a.x0, b.x0) - M + 10, z0: Math.max(a.z0, b.z0) - M + 10, x1: Math.min(a.x1, b.x1) + M - 10, z1: Math.min(a.z1, b.z1) + M - 10 };
        const inZ = (bl: Building) => { const [x, z] = centroid(ring(bl)); return x >= Z.x0 && x < Z.x1 && z >= Z.z0 && z < Z.z1; };
        // (a lot well inside one of the two cells is that cell's; one near a third cell may be the third's)
        const inAB = (x: number, z: number) => [a, b].some((q) => x >= q.x0 && x < q.x1 && z >= q.z0 && z < q.z1);
        const deep = (x: number, z: number) => [[-10, -10], [10, -10], [-10, 10], [10, 10]].every(([dx, dz]) => inAB(x + dx, z + dz));
        const za = new Map(A.filter(inZ).map((bl) => [key(bl), bl])), zb = new Map(B.filter(inZ).map((bl) => [key(bl), bl]));
        shared += za.size;
        for (const [k, bl] of za) {
          const o = zb.get(k);
          const [cx, cz] = centroid(ring(bl)), at = `${cx.toFixed(1)},${cz.toFixed(1)}`;
          if (!o) bad.push(`seed ${seed} ${spec(ax, az).id}|${spec(bx, bz).id}: only ${spec(ax, az).id} has the lot at ${at}`);
          else if (bl.own !== 0 && o.own !== 0) bad.push(`seed ${seed}: the lot at ${at} is owned by both`);
          else if (bl.own === 0 && o.own === 0 && deep(cx, cz)) bad.push(`seed ${seed}: the lot at ${at} is owned by neither`);
          else if (bl.h !== o.h || bl.k !== o.k || bl.roof !== o.roof || bl.s !== o.s) bad.push(`seed ${seed}: the lot at ${at} differs (${bl.k} ${bl.h} / ${o.k} ${o.h})`);
        }
        for (const [k, bl] of zb) if (!za.has(k)) bad.push(`seed ${seed} ${spec(ax, az).id}|${spec(bx, bz).id}: only ${spec(bx, bz).id} has the lot at ${centroid(ring(bl)).map((q) => q.toFixed(1)).join(',')}`);
      }
    expect(shared).toBeGreaterThan(100); // (the strips hold lots to compare)
    expect(bad.length + ' disagreements: ' + bad.slice(0, 6).join('; ')).toBe('0 disagreements: ');
  });

  it('every stretch of street is drawn by the cell holding its middle', () => {
    // (a street line wanders 26 m off its grid line: one just past a cell's far edge has stretches
    // inside it, and the cell only looked for streets past its near edge — they were nobody's)
    const bad: string[] = [];
    let n = 0;
    for (const seed of SEEDS)
      for (const cz of [0, 1]) {
        const cells = [-1, 0, 1, 2, 3].map((cx) => ({ cx, sp: spec(cx, cz) }));
        const built = cells.map(({ sp }) => ({ sp, roads: synthTile(sp, seed, terrain).tj.roads }));
        const all = new Map<string, number[]>();
        for (const { roads } of built) for (const r of roads) all.set(r.p.join(','), r.p);
        for (const [k, p] of all) {
          const m = Math.floor(p.length / 4), x = p[2 * m] / 10, z = p[2 * m + 1] / 10; // (the run's middle point)
          const home = built.find(({ sp: { box: b } }) => x >= b.x0 && x < b.x1 && z >= b.z0 && z < b.z1);
          if (!home || home === built[0] || home === built[built.length - 1]) continue; // (the row's end cells see only one side)
          n++;
          const mine = home.roads.find((r) => r.p.join(',') === k);
          if (!mine || mine.own === 0) bad.push(`seed ${seed}: the street stretch through ${x.toFixed(1)},${z.toFixed(1)} is not drawn by ${home.sp.id}`);
        }
      }
    expect(n).toBeGreaterThan(300);
    expect(bad.length + ' orphans: ' + bad.slice(0, 5).join('; ')).toBe('0 orphans: ');
  }, 60000);

  it("no building stands on another, across the seam or inside a cell", () => {
    const bad: string[] = [];
    let n = 0;
    for (const seed of SEEDS)
      for (const [[ax, az], [bx, bz]] of PAIRS) {
        const own = [...synthTile(spec(ax, az), seed, terrain).tj.buildings, ...synthTile(spec(bx, bz), seed, terrain).tj.buildings].filter((bl) => bl.own !== 0);
        n += own.length;
        bad.push(...overlaps(own).map((s) => `seed ${seed} ${spec(ax, az).id}|${spec(bx, bz).id} ${s}`));
      }
    expect(n).toBeGreaterThan(1000);
    expect(bad.length + ' overlaps: ' + bad.slice(0, 6).join('; ')).toBe('0 overlaps: ');
  });
});
