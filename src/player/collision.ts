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

const DEAD_SEG: Seg = [0, 0, 0, 0, 0, 0];

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
  private segFree: number[] = []; // purged wall ids (out of every grid cell), free to reuse
  private polyDead: number[] = [];
  private deckDead: number[] = [];
  private scopeIds = new Map<number, { segs: number[]; polys: number[]; decks: number[] }>();

  constructor(private terrain: Terrain, public bounds: Box) {}

  beginScope(id: number) { this.curScope = id; if (!this.scopeIds.has(id)) this.scopeIds.set(id, { segs: [], polys: [], decks: [] }); }
  endScope() { this.curScope = 0; }
  /** Register into scope `id` from inside any other (an interior's walls going in mid-frame): the
   *  open scope is restored afterwards. */
  withScope<T>(id: number, fn: () => T): T {
    const prev = this.curScope;
    this.beginScope(id);
    try { return fn(); } finally { this.curScope = prev; }
  }
  /** Drop scope `id`. `purge`: also take its walls out of the grid and recycle their ids — a scope
   *  that comes and goes all session (an open building's partitions) would otherwise leave a pile
   *  of tombstones in the cells it covers. */
  removeScope(id: number, purge = false) {
    const s = this.scopeIds.get(id);
    if (!s) return;
    for (const i of s.segs) this.segDead[i] = 1;
    for (const i of s.polys) this.polyDead[i] = 1;
    for (const i of s.decks) this.deckDead[i] = 1;
    this.scopeIds.delete(id);
    if (!purge) return;
    const cells = new Set<number>();
    for (const i of s.segs) {
      const g = this.segs[i];
      const i0 = Math.floor(Math.min(g[0], g[2]) / this.cell), i1 = Math.floor(Math.max(g[0], g[2]) / this.cell);
      const j0 = Math.floor(Math.min(g[1], g[3]) / this.cell), j1 = Math.floor(Math.max(g[1], g[3]) / this.cell);
      for (let a = i0; a <= i1; a++) for (let b = j0; b <= j1; b++) cells.add(a * 73856093 ^ b * 19349663);
    }
    const gone = new Set(s.segs);
    for (const k of cells) {
      const l = this.grid.get(k);
      if (!l) continue;
      const kept = l.filter((q) => !gone.has(q));
      if (kept.length) this.grid.set(k, kept);
      else this.grid.delete(k);
    }
    for (const i of s.segs) { this.segs[i] = DEAD_SEG; this.segFree.push(i); }
  }
  private track(rec: 'segs' | 'polys' | 'decks', id: number) {
    const s = this.scopeIds.get(this.curScope);
    if (s) s[rec].push(id);
  }

  // True if (x,z) is inside a footprint or within r of any wall.
  blocked(x: number, z: number, r: number) {
    if (this.buildingAt(x, z) >= 0) return true;
    return this.touching(x, z, r);
  }
  /** A wall within r of (x,z) — with feetY, only walls whose height band holds those feet. (Not
   *  the footprint test: someone standing in a building's rooms isn't "in a wall".) */
  touching(x: number, z: number, r: number, feetY?: number) {
    const [nx, nz] = this.move1(x, z, 0, 0, r, feetY);
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
    const seg: Seg = [a[0], a[1], b[0], b[1], y0, y1];
    const id = this.segFree.length ? this.segFree.pop()! : this.segs.length;
    if (id === this.segs.length) { this.segs.push(seg); this.segDead.push(0); }
    else { this.segs[id] = seg; this.segDead[id] = 0; }
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
  /** Retire the short walls lying inside a (yawed) rectangle — the outline of a parked car the
   *  player just drove off in (it was boxing its own car in: a second of travel, then a wall).
   *  Long walls merely passing through (a building's side) stay. Returns how many went. */
  clearFootprint(x: number, z: number, yaw: number, hl: number, hw: number) {
    const c = Math.cos(yaw), s = Math.sin(yaw), m = 0.3;
    const inside = (px: number, pz: number) => {
      const dx = px - x, dz = pz - z, u = dx * c - dz * s, v = dx * s + dz * c; // into the car's frame (x across, z along)
      return Math.abs(u) <= hw + m && Math.abs(v) <= hl + m;
    };
    let n = 0;
    const r = Math.hypot(hl, hw) + m;
    for (let i = Math.floor((x - r) / this.cell); i <= Math.floor((x + r) / this.cell); i++)
      for (let j = Math.floor((z - r) / this.cell); j <= Math.floor((z + r) / this.cell); j++)
        for (const id of this.grid.get(i * 73856093 ^ j * 19349663) ?? []) {
          if (this.segDead[id]) continue;
          const g = this.segs[id];
          if (Math.hypot(g[2] - g[0], g[3] - g[1]) > 2 * hl + 2 * m) continue;
          if (inside(g[0], g[1]) && inside(g[2], g[3])) { this.segDead[id] = 1; n++; }
        }
    return n;
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
  /** The open-air surface: the ground and any deck over it (bridges, piers, boardwalks), never a
   *  building's floors — what street life walks on (a sidewalk way that clips a footprint used to
   *  put its walkers on the top floor, striding through the air along the shopfronts). */
  outdoorSurfaceAt(x: number, z: number) {
    const c = this.cands;
    c.length = 0;
    c.push(Math.max(this.terrain.heightAt(x, z), -0.2));
    this.deckHeights(x, z, c);
    return Math.max(...c);
  }
  /** A token for the open-air surface inside a box (Terrain.genIn): read heights there stay good
   *  while it holds — the box's cell took no new ground (its decks come and go with that same
   *  tile). −1 when the box spans cells. */
  surfaceGen(x0: number, z0: number, x1: number, z1: number) { return this.terrain.genIn(x0, z0, x1, z1); }
  /** The open-air surface nearest height y: the ground, or the deck a car or walker is already on
   *  (a street passing under a bridge keeps its traffic on the street, not up on the deck). */
  outdoorNear(x: number, z: number, y: number) {
    const c = this.cands;
    c.length = 0;
    c.push(Math.max(this.terrain.heightAt(x, z), -0.2));
    this.deckHeights(x, z, c);
    let best = c[0];
    for (const h of c) if (Math.abs(h - y) < Math.abs(best - y)) best = h;
    return best;
  }
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
  // are ignored. Returns the new position. A step longer than most of the body goes in pieces: in one,
  // a slow frame (0.1 s at a run is 0.6 m) or a fast car (38 m/s) could land past a wall's line and
  // be pushed out on its far side — through the wall, into a building with no way out.
  move(x: number, z: number, dx: number, dz: number, r = 0.32, feetY?: number): P2 {
    const L = Math.hypot(dx, dz), n = L > r * 0.75 ? Math.min(24, Math.ceil(L / (r * 0.75))) : 1;
    if (n === 1) return this.move1(x, z, dx, dz, r, feetY);
    let p: P2 = [x, z];
    for (let k = 0; k < n; k++) p = this.move1(p[0], p[1], dx / n, dz / n, r, feetY);
    return p;
  }
  private move1(x: number, z: number, dx: number, dz: number, r: number, feetY?: number): P2 {
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
