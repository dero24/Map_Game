// Buildings standing inside buildings. OSM maps many towers as a "wedding cake": each tier a
// building:part drawn from the ground up (no min_height), the narrower, taller tiers inside the
// wider, lower ones; and now and then a building twice, or one mapped inside another's outline.
// Drawn as they come, the tiers stand one inside another: their walls meet in the same planes and
// flicker against each other (z-fighting), and each tier is a solid footprint with a door of its
// own — you walk in the front door and into the next tier's wall ("a building in a building").
//
// Here each ground-standing building nearly all inside a larger one is set on top of it (a tier:
// it rises from the larger one's roof, as a part of it), or, if it's no taller, hidden inside it.
// A survey-found block (gen 'lidar') inside or across a mapped one is never stacked; it goes.
// Pure and idempotent: a stacked tier is lifted and hidden ones flagged, so a second pass (a
// rebuild of the same tile) changes nothing. Deterministic: sorted by area, ties by index.
import type { Building } from './data';

type P2 = [number, number];
const INSIDE = 0.9; // share of the inner outline inside the outer: nested
const TIER = 1.0; // m taller than its container to count as a tier above it (else it's hidden)
const LIDAR_OVER = 0.3; // a survey block this much over a mapped one is the mapped one

interface N { i: number; ring: P2[]; area: number; x0: number; z0: number; x1: number; z1: number }

const ringOf = (b: Building): P2[] => {
  const r: P2[] = [];
  for (let i = 0; i + 1 < b.r.length; i += 2) r.push([b.r[i] / 10, b.r[i + 1] / 10]);
  return r;
};
const areaOf = (r: P2[]) => {
  let a = 0;
  for (let i = 0, j = r.length - 1; i < r.length; j = i++) a += r[j][0] * r[i][1] - r[i][0] * r[j][1];
  return Math.abs(a) / 2;
};
const pip = (x: number, z: number, r: P2[]) => {
  let ins = false;
  for (let i = 0, j = r.length - 1; i < r.length; j = i++)
    if (r[i][1] > z !== r[j][1] > z && x < ((r[j][0] - r[i][0]) * (z - r[i][1])) / (r[j][1] - r[i][1]) + r[i][0]) ins = !ins;
  return ins;
};
/** Share of `a`'s area inside `b`, sampled on a grid over `a` (≈ 150 samples; boxes first). */
export function shareInside(a: N, b: N, atLeast = 0) {
  const ox = Math.min(a.x1, b.x1) - Math.max(a.x0, b.x0), oz = Math.min(a.z1, b.z1) - Math.max(a.z0, b.z0);
  if (ox <= 0 || oz <= 0) return 0;
  if ((ox * oz) / Math.max(1e-6, (a.x1 - a.x0) * (a.z1 - a.z0)) < atLeast) return 0; // (its box isn't even that far inside)
  const st = Math.max(0.25, Math.sqrt(((a.x1 - a.x0) * (a.z1 - a.z0)) / 150));
  let n = 0, k = 0;
  for (let x = a.x0 + st / 2; x < a.x1; x += st)
    for (let z = a.z0 + st / 2; z < a.z1; z += st) {
      if (!pip(x, z, a.ring)) continue;
      n++;
      if (pip(x, z, b.ring)) k++;
    }
  return n ? k / n : 0;
}

// (an outline its parts draw (hp) stands too: it's the walkable footprint, and can stand inside
// another building — a steeple's outline inside its church, a tower's over a terminal)
const standing = (b: Building) => (b.lf ?? 0) <= 1.5 && !b.cn && !b.in && b.roof !== 'tower';

/** Stack or hide the buildings of a tile that stand inside others (see the header). Mutates the
 *  buildings in place; margin context (own: 0) is read as a container but never changed. */
export function nestBuildings(bs: Building[]) {
  const ns: N[] = [];
  bs.forEach((b, i) => {
    if (!standing(b) || b.r.length < 6) return;
    const ring = ringOf(b);
    let x0 = Infinity, z0 = Infinity, x1 = -Infinity, z1 = -Infinity;
    for (const [x, z] of ring) (x0 = Math.min(x0, x)), (x1 = Math.max(x1, x)), (z0 = Math.min(z0, z)), (z1 = Math.max(z1, z));
    const area = areaOf(ring);
    if (area > 1) ns.push({ i, ring, area, x0, z0, x1, z1 });
  });
  if (ns.length < 2) return 0;
  const C = 32, grid = new Map<string, N[]>();
  for (const n of ns)
    for (let u = Math.floor(n.x0 / C); u <= Math.floor(n.x1 / C); u++)
      for (let v = Math.floor(n.z0 / C); v <= Math.floor(n.z1 / C); v++) (grid.get(u + ',' + v) ?? grid.set(u + ',' + v, []).get(u + ',' + v)!).push(n);
  const near = (a: N) => {
    const out = new Set<N>();
    for (let u = Math.floor(a.x0 / C); u <= Math.floor(a.x1 / C); u++)
      for (let v = Math.floor(a.z0 / C); v <= Math.floor(a.z1 / C); v++) for (const n of grid.get(u + ',' + v) ?? []) if (n !== a) out.add(n);
    return [...out];
  };
  // largest first: a tier's container is settled (and lifted, if it's a tier itself) before it
  const order = ns.slice().sort((a, b) => b.area - a.area || a.i - b.i);
  const top = new Map<number, number>(); // index → its top above the ground (after stacking)
  const topOf = (i: number) => top.get(i) ?? (bs[i].lf ?? 0) + bs[i].h;
  const gone = new Set<number>();
  let changed = 0;
  for (const a of order) {
    const A = bs[a.i];
    if (A.own === 0) continue; // (the neighbour tile draws it, and decides)
    if (A.gen === 'lidar') {
      // a survey block across a mapped building is that building
      if (near(a).some((n) => !bs[n.i].gen && !gone.has(n.i) && shareInside(a, n, LIDAR_OVER * 0.5) > LIDAR_OVER)) { A.in = 1; gone.add(a.i); changed++; }
      continue;
    }
    // its container: the smallest standing building (larger than it, or its equal mapped first)
    // with nearly all of it inside
    let host: N | null = null;
    const ownPart = !!A.pt && A.po != null && A.po >= 0;
    for (const n of near(a)) {
      if (gone.has(n.i) || bs[n.i].gen === 'lidar') continue;
      const B = bs[n.i];
      // never its own outline or one of its own parts; a part isn't nested into an outline that
      // only its parts draw (the outline has no walls to stand on)
      if (n.i === A.po || (B.pt && B.po === a.i) || (ownPart && B.hp)) continue;
      if (n.area < a.area * 0.98 || (n.area <= a.area * 1.02 && n.i > a.i)) continue; // (an equal twin: the first mapped hosts)
      // the smallest container; between equals, the one standing higher, then the first mapped
      if (host && (n.area > host.area * 1.02 || (n.area >= host.area * 0.98 && (topOf(n.i) < topOf(host.i) || (topOf(n.i) === topOf(host.i) && n.i > host.i))))) continue;
      if (shareInside(a, n, INSIDE - 0.05) >= INSIDE) host = n;
    }
    if (!host) continue;
    if (A.hp) {
      // an outline its parts draw, standing inside another building: its footprint and door go (the
      // host's is the walkable building); its parts stay, each nested on its own
      A.in = 1;
      gone.add(a.i);
      changed++;
      continue;
    }
    const hTop = topOf(host.i), aTop = topOf(a.i);
    if (aTop > hTop + TIER) {
      // a tier: rises from its container's roof, one building with it (its look, no door of its own)
      A.lf = +hTop.toFixed(1);
      A.h = +(aTop - hTop).toFixed(1);
      top.set(a.i, aTop);
      if (A.fl && bs[host.i].fl && A.fl > bs[host.i].fl!) A.fl = A.fl - bs[host.i].fl!;
      if (!A.pt) A.pt = 1;
      const H = bs[host.i];
      A.po = H.pt && H.po != null && H.po >= 0 ? H.po : host.i;
    } else {
      A.in = 1; // no taller than what it stands in: hidden inside it
      gone.add(a.i);
    }
    changed++;
  }
  return changed;
}
