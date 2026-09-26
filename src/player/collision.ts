// 2D walk physics with a little bit of height: building walls as segments in a uniform grid (with gaps
// where the front doors are), walkable = land / shallows / decks (bridges, piers, stairs, porches),
// multi-storey floors inside buildings (with stairwell openings), and walls that only exist over a height
// band — so a stair rail blocks the upstairs landing but not the hallway below, and you can walk
// between the pilings under a raised beach house.
import type { Terrain, Box } from '../world/data';

type P2 = [number, number];
type Seg = [number, number, number, number, number, number]; // ax az bx bz y0 y1

export interface Deck {
  pts: P2[];
  cum: number[]; // cumulative length at each point
  halfWidth: number;
  heightAt: (s: number) => number;
  // The height profile, when the builder knows it — lets the tile stream ship the deck across a
  // worker boundary exactly instead of sampling heightAt.
  profile?: DeckProfile;
}
export type DeckProfile =
  | { k: 'const'; y: number }
  | { k: 'ramp'; y0: number; y1: number; total: number }
  | { k: 'arch'; hA: number; hB: number; peak: number; total: number };
// Stairwell opening: storey `level` has no floor inside `ring`.
export interface Hole { level: number; ring: P2[] }
export interface Floors { floor0: number; floorH: number; levels: number; holes?: Hole[]; ground?: boolean }

const inRing = (x: number, z: number, ring: P2[]) => {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, zi] = ring[i], [xj, zj] = ring[j];
    if (zi > z !== zj > z && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi) inside = !inside;
  }
  return inside;
};

export class WalkWorld {
  private cell = 8;
  private grid = new Map<number, number[]>();
  private segs: Seg[] = [];
  decks: Deck[] = [];
  private deckGrid = new Map<number, number[]>();
  private polys: P2[][] = [];
  private floors: (Floors | null)[] = [];
  private polyGrid = new Map<number, number[]>();
  private marks: number[] = [];
  private markId = 0;
  // Scoped registration: everything added between beginScope/endScope can be dropped with removeScope
  // (tile streaming unloads whole neighbourhoods this way). Tombstoned ids stay in the grids but are
  // skipped by every query — cheap and correct; a compact() pass can reclaim them later if needed.
  private curScope = 0;
  private segDead: number[] = [];
  private polyDead: number[] = [];
  private deckDead: number[] = [];
  private scopeIds = new Map<number, { segs: number[]; polys: number[]; decks: number[] }>();

  constructor(private terrain: Terrain, public bounds: Box) {}

  beginScope(id: number) { this.curScope = id; if (!this.scopeIds.has(id)) this.scopeIds.set(id, { segs: [], polys: [], decks: [] }); }
  endScope() { this.curScope = 0; }
  removeScope(id: number) {
    const s = this.scopeIds.get(id);
    if (!s) return;
    for (const i of s.segs) this.segDead[i] = 1;
    for (const i of s.polys) this.polyDead[i] = 1;
    for (const i of s.decks) this.deckDead[i] = 1;
    this.scopeIds.delete(id);
  }
  private track(rec: 'segs' | 'polys' | 'decks', id: number) {
    const s = this.scopeIds.get(this.curScope);
    if (s) s[rec].push(id);
  }

  // True if (x,z) is inside a footprint or within r of any wall.
  blocked(x: number, z: number, r: number) {
    if (this.buildingAt(x, z) >= 0) return true;
    const [nx, nz] = this.move(x, z, 0, 0, r);
    return nx !== x || nz !== z;
  }

  buildingAt(x: number, z: number) {
    const k = Math.floor(x / 16) * 73856093 ^ Math.floor(z / 16) * 19349663;
    for (const id of this.polyGrid.get(k) ?? []) if (!this.polyDead[id] && inRing(x, z, this.polys[id])) return id;
    return -1;
  }
  // The building whose rooms you are standing in (not the one you're walking underneath).
  interiorAt(x: number, z: number, feetY: number) {
    const id = this.buildingAt(x, z);
    const f = id >= 0 ? this.floors[id] : null;
    if (!f || (f.ground && feetY < f.floor0 - 0.6)) return -1;
    return id;
  }
  floorsOf(id: number) { return this.floors[id] ?? null; }

  // A wall segment; y0..y1 is the band of feet heights it blocks (default: all).
  addWall(a: P2, b: P2, y0 = -Infinity, y1 = Infinity) {
    const id = this.segs.length;
    this.segs.push([a[0], a[1], b[0], b[1], y0, y1]);
    this.segDead.push(0);
    this.track('segs', id);
    const i0 = Math.floor(Math.min(a[0], b[0]) / this.cell), i1 = Math.floor(Math.max(a[0], b[0]) / this.cell);
    const j0 = Math.floor(Math.min(a[1], b[1]) / this.cell), j1 = Math.floor(Math.max(a[1], b[1]) / this.cell);
    for (let i = i0; i <= i1; i++)
      for (let j = j0; j <= j1; j++) {
        const k = i * 73856093 ^ j * 19349663;
        let l = this.grid.get(k);
        if (!l) this.grid.set(k, (l = []));
        l.push(id);
      }
  }
  // Closed outline of walls (posts, parked cars, planters).
  addLoop(pts: P2[], y0 = -Infinity, y1 = Infinity) {
    for (let i = 0; i < pts.length; i++) this.addWall(pts[i], pts[(i + 1) % pts.length], y0, y1);
  }

  // Register a footprint. `gap` leaves a doorway in the nearest wall; `floors` makes it walkable inside.
  // wallY0: walls only block above this height (raised houses stand on open pilings).
  addPolygon(ring: P2[], floors: Floors | null = null, gap: { x: number; z: number; w: number } | null = null, wallY0 = -Infinity) {
    const pid = this.polys.length;
    this.polys.push(ring);
    this.floors.push(floors);
    this.polyDead.push(0);
    this.track('polys', pid);
    let x0 = Infinity, z0 = Infinity, x1 = -Infinity, z1 = -Infinity;
    for (const [x, z] of ring) (x0 = Math.min(x0, x)), (z0 = Math.min(z0, z)), (x1 = Math.max(x1, x)), (z1 = Math.max(z1, z));
    for (let i = Math.floor(x0 / 16); i <= Math.floor(x1 / 16); i++)
      for (let j = Math.floor(z0 / 16); j <= Math.floor(z1 / 16); j++) {
        const k = i * 73856093 ^ j * 19349663;
        let l = this.polyGrid.get(k);
        if (!l) this.polyGrid.set(k, (l = []));
        l.push(pid);
      }
    let gapEdge = -1, gapT = 0;
    if (gap) {
      let bd = Infinity;
      for (let i = 0; i < ring.length; i++) {
        const a = ring[i], b = ring[(i + 1) % ring.length];
        const dx = b[0] - a[0], dz = b[1] - a[1], l2 = dx * dx + dz * dz;
        const t = l2 > 0 ? Math.max(0, Math.min(1, ((gap.x - a[0]) * dx + (gap.z - a[1]) * dz) / l2)) : 0;
        const d = Math.hypot(a[0] + dx * t - gap.x, a[1] + dz * t - gap.z);
        if (d < bd) (bd = d), (gapEdge = i), (gapT = t);
      }
    }
    for (let i = 0; i < ring.length; i++) {
      const a = ring[i], b = ring[(i + 1) % ring.length];
      if (i === gapEdge && gap) {
        const len = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1;
        const h = (gap.w / 2 + 0.15) / len;
        const t0 = Math.max(0, gapT - h), t1 = Math.min(1, gapT + h);
        const at = (t: number): P2 => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
        if (t0 > 0) this.addWall(a, at(t0), wallY0);
        if (t1 < 1) this.addWall(at(t1), b, wallY0);
      } else this.addWall(a, b, wallY0);
    }
    return pid;
  }

  addDeck(d: Deck) {
    const id = this.decks.length;
    this.decks.push(d);
    this.deckDead.push(0);
    this.track('decks', id);
    let x0 = Infinity, z0 = Infinity, x1 = -Infinity, z1 = -Infinity;
    for (const [x, z] of d.pts) (x0 = Math.min(x0, x)), (z0 = Math.min(z0, z)), (x1 = Math.max(x1, x)), (z1 = Math.max(z1, z));
    const m = d.halfWidth + 1;
    for (let i = Math.floor((x0 - m) / 50); i <= Math.floor((x1 + m) / 50); i++)
      for (let j = Math.floor((z0 - m) / 50); j <= Math.floor((z1 + m) / 50); j++) {
        const k = i * 92821 + j;
        let l = this.deckGrid.get(k);
        if (!l) this.deckGrid.set(k, (l = []));
        l.push(id);
      }
  }

  private deckHeights(x: number, z: number, out: number[]) {
    const test = (d: Deck) => {
      for (let i = 0; i + 1 < d.pts.length; i++) {
        const [ax, az] = d.pts[i], [bx, bz] = d.pts[i + 1];
        const dx = bx - ax, dz = bz - az;
        const l2 = dx * dx + dz * dz;
        if (l2 < 1e-6) continue;
        const t = Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / l2));
        const ex = ax + dx * t - x, ez = az + dz * t - z;
        if (ex * ex + ez * ez <= d.halfWidth * d.halfWidth) { out.push(d.heightAt(d.cum[i] + Math.sqrt(l2) * t)); return; }
      }
    };
    for (const id of this.deckGrid.get(Math.floor(x / 50) * 92821 + Math.floor(z / 50)) ?? []) if (!this.deckDead[id]) test(this.decks[id]);
    return out;
  }

  // Highest deck surface at (x,z), or null.
  deckAt(x: number, z: number): number | null {
    const h = this.deckHeights(x, z, []);
    return h.length ? Math.max(...h) : null;
  }

  private cands: number[] = [];
  // Walking surface. With feetY, picks the highest surface you could step onto (stairs, storeys, decks).
  surfaceAt(x: number, z: number, feetY?: number) {
    const c = this.cands;
    c.length = 0;
    const b = this.buildingAt(x, z);
    const f = b >= 0 ? this.floors[b] : null;
    if (f) {
      for (let k = 0; k < f.levels; k++) {
        if (f.holes?.some((h) => h.level === k && inRing(x, z, h.ring))) continue;
        c.push(f.floor0 + k * f.floorH);
      }
      if (f.ground || !c.length) c.push(Math.max(this.terrain.heightAt(x, z), -0.2));
    } else c.push(Math.max(this.terrain.heightAt(x, z), -0.2));
    this.deckHeights(x, z, c);
    if (feetY === undefined) return Math.max(...c);
    let best = -Infinity, low = Infinity;
    for (const h of c) {
      if (h <= feetY + 0.75 && h > best) best = h;
      low = Math.min(low, h);
    }
    return best > -Infinity ? best : low;
  }

  walkable(x: number, z: number) {
    const b = this.bounds;
    if (x < b.x0 + 30 || x > b.x1 - 30 || z < b.z0 + 30 || z > b.z1 - 30) return false;
    if (this.terrain.heightAt(x, z) > -0.75 || this.terrain.sdfAt(x, z) > -0.8) return true;
    return this.deckAt(x, z) !== null;
  }

  // Nearest walkable spot (spiral search), for landing after flight.
  nearestWalkable(x: number, z: number): P2 {
    if (this.walkable(x, z) && this.buildingAt(x, z) < 0) return [x, z];
    for (let r = 3; r < 1500; r *= 1.25)
      for (let a = 0; a < 16; a++) {
        const px = x + Math.cos((a / 16) * Math.PI * 2) * r, pz = z + Math.sin((a / 16) * Math.PI * 2) * r;
        if (this.walkable(px, pz) && this.buildingAt(px, pz) < 0) return [px, pz];
      }
    return [x, z];
  }

  private pushOut(nx: number, nz: number, r: number, s: Seg): [number, number, boolean] {
    const [ax, az, bx, bz] = s;
    const sx = bx - ax, sz = bz - az;
    const l2 = sx * sx + sz * sz;
    const t = l2 > 0 ? Math.max(0, Math.min(1, ((nx - ax) * sx + (nz - az) * sz) / l2)) : 0;
    const px = ax + sx * t, pz = az + sz * t;
    const ex = nx - px, ez = nz - pz;
    const d2 = ex * ex + ez * ez;
    if (d2 < r * r && d2 > 1e-10) {
      const d = Math.sqrt(d2);
      return [px + (ex / d) * r, pz + (ez / d) * r, true];
    }
    return [nx, nz, false];
  }

  // Move a circle from (x,z) by (dx,dz), sliding along walls. With feetY, walls outside their height band
  // are ignored. Returns the new position.
  move(x: number, z: number, dx: number, dz: number, r = 0.32, feetY?: number): P2 {
    let nx = x + dx, nz = z + dz;
    if (!isFinite(nx) || !isFinite(nz)) return [x, z];
    if ((dx !== 0 || dz !== 0) && !this.walkable(nx, nz)) {
      if (this.walkable(x + dx, z)) nz = z;
      else if (this.walkable(x, z + dz)) nx = x;
      else return [x, z];
    }
    for (let iter = 0; iter < 3; iter++) {
      const i0 = Math.floor((nx - r) / this.cell), i1 = Math.floor((nx + r) / this.cell);
      const j0 = Math.floor((nz - r) / this.cell), j1 = Math.floor((nz + r) / this.cell);
      let pushed = false;
      const mark = ++this.markId;
      for (let i = i0; i <= i1; i++)
        for (let j = j0; j <= j1; j++) {
          const l = this.grid.get(i * 73856093 ^ j * 19349663);
          if (!l) continue;
          for (const id of l) {
            if (this.segDead[id] || this.marks[id] === mark) continue;
            this.marks[id] = mark;
            const s = this.segs[id];
            if (feetY !== undefined && (feetY < s[4] || feetY > s[5])) continue;
            const [px, pz, p] = this.pushOut(nx, nz, r, s);
            if (p) (nx = px), (nz = pz), (pushed = true);
          }
        }
      if (!pushed) break;
    }
    return [nx, nz];
  }
}
