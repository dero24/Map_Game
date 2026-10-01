// Paints the ground "underpainting" onto canvases from baked vectors: land cover wash, sand, areas,
// roads with sidewalks, curbs and markings, and soft contact shadows around buildings.
// Three canvases: whole backdrop (coarse), whole slice (medium), and a near-field detail window that
// repaints around the walker so paint at your feet is ~15 cm/px.
import * as THREE from 'three';
import type { World, TerrainLayer, Road, Area, WorldJson } from './data';
import { activeStyle } from './styles';
import { lotLayout, type LotLayout } from './lots';
import { MINOR, ROAD_RANK, roadPaint, streetSurface } from './roadPalette';
import { COURT, courtFrame, diamondFrame, surfacePaint, type Sport } from './sports';
import { makeCanvas, type AnyCanvas } from './canvas';

// a lot's stall layout, computed once per prepared outline
const LOTS = new WeakMap<object, LotLayout | null>();
const lotOf = (a: { item: Area; pts: [number, number][][] }) => {
  if (!LOTS.has(a)) LOTS.set(a, a.pts[0] && a.item.o.length ? lotLayout(a.pts[0]) : null);
  return LOTS.get(a)!;
};

// ESA WorldCover class -> ground wash (sRGB). Water cells = sea/river bed.
// Values sit near real-world reflectance (asphalt ~0.1, concrete ~0.35, dry sand ~0.4 linear):
// watercolour keeps the lightest values for highlights, so sunlit ground must stay mid-value.
const COVER: Record<number, string> = {
  // 50 built-up: in towns the unpainted land between roads, walks, lots and houses is lawn —
  // a muted lawn green, not grey khaki (paved things are painted over it)
  10: '#76834f', 20: '#8b9a5c', 30: '#9fb06c', 40: '#b3b070', 50: '#a6b27a', 60: '#d8c8a0', 70: '#f0f0f0',
  80: '#8c8768', 90: '#8e9562', 95: '#708055', 100: '#a8a882', 0: '#aeb08e',
};
const AREA_FILL: Record<string, string> = {
  beach: '#dccb9f', wood: '#617043', scrub: '#8a955c', wetland: '#8c9761', grass: '#9fb56d', pitch: '#8db35f',
  golf: '#9fc373', parking: '#8a8883', plaza: '#c2baa8', pool: '#63c2cf', marina: '#aaa698', commercial: '#aaa597',
  bare: '#cbbb93', pier: '#9c8466',
};
const AREA_ORDER = ['wood', 'scrub', 'wetland', 'grass', 'golf', 'commercial', 'bare', 'beach', 'pitch', 'marina', 'parking', 'plaza', 'pier', 'pool'];

type P = [number, number];
interface Prepared<T> { item: T; pts: P[][]; x0: number; z0: number; x1: number; z1: number }
function prep<T>(item: T, rings: number[][]): Prepared<T> {
  const pts = rings.map((f) => {
    const o: P[] = [];
    for (let i = 0; i + 1 < f.length; i += 2) o.push([f[i] / 10, f[i + 1] / 10]);
    return o;
  });
  let x0 = Infinity, z0 = Infinity, x1 = -Infinity, z1 = -Infinity;
  for (const r of pts) for (const [x, z] of r) (x0 = Math.min(x0, x)), (z0 = Math.min(z0, z)), (x1 = Math.max(x1, x)), (z1 = Math.max(z1, z));
  return { item, pts, x0, z0, x1, z1 };
}
const overlaps = (p: Prepared<unknown>, x0: number, z0: number, x1: number, z1: number, m = 20) => p.x1 > x0 - m && p.x0 < x1 + m && p.z1 > z0 - m && p.z0 < z1 + m;

function pathOf(ctx: CanvasRenderingContext2D, p: P[], close = false) {
  ctx.moveTo(p[0][0], p[0][1]);
  for (let i = 1; i < p.length; i++) ctx.lineTo(p[i][0], p[i][1]);
  if (close) ctx.closePath();
}
// A mapped court or field in its own paint (sports.ts: the same fit props.ts stands the hoops,
// nets and goals in): the run-off, the playing surface and — `lw` > 0, the fine window — its lines.
function paintCourt(ctx: CanvasRenderingContext2D, ring: P[], sport: Sport, sf: string | undefined, lw: number) {
  const C = COURT[sport], own = surfacePaint(sf);
  ctx.save();
  ctx.lineWidth = lw;
  ctx.strokeStyle = C.lines;
  const circle = (u: number, v: number, r: number, a0 = 0, a1 = Math.PI * 2) => { ctx.moveTo(u + r * Math.cos(a0), v + r * Math.sin(a0)); ctx.arc(u, v, r, a0, a1); };
  const seg = (u0: number, v0: number, u1: number, v1: number) => { ctx.moveTo(u0, v0); ctx.lineTo(u1, v1); };
  if (sport === 'baseball' || sport === 'softball') {
    // the diamond frame: p along the first-base line, q along the third, home at the origin
    const d = diamondFrame(ring, sport), r2 = Math.SQRT1_2, s = d.side, k = s / 27.43;
    ctx.transform((d.dx + d.dz) * r2, (d.dz - d.dx) * r2, (d.dx - d.dz) * r2, (d.dx + d.dz) * r2, d.hx, d.hz);
    const dirt = sf === 'grass' || sf === 'artificial_turf' ? own! : '#b88c60', grass = own && sf !== 'dirt' ? own : C.court, m = 0.475 * s;
    ctx.fillStyle = dirt;
    ctx.save();
    ctx.beginPath(); ctx.rect(0, 0, d.foul, d.foul); ctx.clip();
    ctx.beginPath(); ctx.arc(m, m, 29 * k, 0, Math.PI * 2); ctx.fill(); // the skinned infield round the mound
    ctx.restore();
    ctx.fillStyle = grass;
    ctx.fillRect(1.2 * k, 1.2 * k, s - 2.4 * k, s - 2.4 * k); // the infield grass inside the base paths
    ctx.fillStyle = dirt;
    ctx.beginPath(); ctx.arc(m, m, 2.74 * k, 0, Math.PI * 2); ctx.arc(0, 0, 3.96 * k, 0, Math.PI * 2); ctx.fill(); // mound, home circle
    if (lw) { ctx.beginPath(); seg(0, 0, d.foul, 0); seg(0, 0, 0, d.foul); ctx.stroke(); }
    ctx.restore();
    return;
  }
  const f = courtFrame(ring, sport);
  const hard = sport === 'basketball' || sport === 'tennis' || sport === 'pickleball';
  const plain = sf === 'asphalt' || sf === 'concrete' || sf === 'paved';
  if (hard) {
    ctx.fillStyle = own ?? C.apron; // the run-off: the whole mapped block
    ctx.beginPath(); pathOf(ctx, ring, true); ctx.fill();
  } else if (own) {
    ctx.fillStyle = own;
    ctx.beginPath(); pathOf(ctx, ring, true); ctx.fill();
  }
  ctx.transform(f.ux, f.uz, -f.uz, f.ux, f.cx, f.cz); // (u along the courts, v across)
  const L = f.L, W = f.W;
  for (let i = 0; i < f.n; i++) {
    const v0 = (i - (f.n - 1) / 2) * f.step;
    if (hard || sport === 'volleyball') {
      ctx.fillStyle = hard && plain ? own! : C.court;
      ctx.fillRect(-L / 2, v0 - W / 2, L, W);
    }
    if (!lw) continue;
    ctx.beginPath();
    ctx.rect(-L / 2, v0 - W / 2, L, W);
    if (sport === 'basketball') {
      const s = W / 15;
      if (!f.half) { seg(0, v0 - W / 2, 0, v0 + W / 2); circle(0, v0, 1.8 * s); }
      for (const e of f.half ? [1] : [-1, 1]) {
        const bu = (e * L) / 2, ft = bu - e * 5.8 * s, bk = bu - e * 1.575 * s;
        ctx.rect(Math.min(bu, ft), v0 - 2.45 * s, 5.8 * s, 4.9 * s); // the key
        circle(ft, v0, 1.8 * s); // the free-throw circle
        // the three-point line: straight from the baseline 0.9 m in from each side, then the arc
        const R = 6.75 * s, sv = 6.6 * s, du = Math.sqrt(Math.max(0, R * R - sv * sv)), cu = bk - e * du;
        seg(bu, v0 - sv, cu, v0 - sv); seg(bu, v0 + sv, cu, v0 + sv);
        const th = Math.atan2(sv, du);
        if (e > 0) { ctx.moveTo(cu, v0 - sv); ctx.arc(bk, v0, R, -Math.PI + th, Math.PI - th, true); }
        else { ctx.moveTo(cu, v0 - sv); ctx.arc(bk, v0, R, -th, th, false); }
      }
    } else if (sport === 'tennis') {
      const s = W / 10.97, sw = 4.115 * s, sl = 6.4 * s;
      seg(-L / 2, v0 - sw, L / 2, v0 - sw); seg(-L / 2, v0 + sw, L / 2, v0 + sw); // singles sidelines
      seg(-sl, v0 - sw, -sl, v0 + sw); seg(sl, v0 - sw, sl, v0 + sw); // service lines
      seg(-sl, v0, sl, v0); // centre service line
      seg(-L / 2, v0, -L / 2 + 0.3 * s, v0); seg(L / 2, v0, L / 2 - 0.3 * s, v0); // centre marks
    } else if (sport === 'pickleball') {
      const s = W / 6.1, nv = 2.13 * s;
      seg(-nv, v0 - W / 2, -nv, v0 + W / 2); seg(nv, v0 - W / 2, nv, v0 + W / 2); // the kitchen
      seg(nv, v0, L / 2, v0); seg(-L / 2, v0, -nv, v0);
    } else if (sport === 'volleyball') {
      const s = W / 9;
      seg(0, v0 - W / 2, 0, v0 + W / 2); seg(-3 * s, v0 - W / 2, -3 * s, v0 + W / 2); seg(3 * s, v0 - W / 2, 3 * s, v0 + W / 2);
    } else if (sport === 'soccer') {
      const s = L / 100;
      seg(0, v0 - W / 2, 0, v0 + W / 2);
      circle(0, v0, 9.15 * s);
      for (const e of [-1, 1]) {
        const bu = (e * L) / 2, pa = bu - e * 16.5 * s, ga = bu - e * 5.5 * s, spot = bu - e * 11 * s;
        ctx.rect(Math.min(bu, pa), v0 - 20.16 * s, 16.5 * s, 40.32 * s); // the penalty area
        ctx.rect(Math.min(bu, ga), v0 - 9.16 * s, 5.5 * s, 18.32 * s); // the goal area
        const th = Math.acos(5.5 / 9.15);
        if (e > 0) circle(spot, v0, 9.15 * s, Math.PI - th, Math.PI + th);
        else circle(spot, v0, 9.15 * s, -th, th);
      }
    }
    ctx.stroke();
  }
  ctx.restore();
}
// Offset polyline by d meters (left of travel direction in x-east/z-south frame).
function offsetLine(p: P[], d: number): P[] {
  const out: P[] = [];
  for (let i = 0; i < p.length; i++) {
    const a = p[Math.max(0, i - 1)], b = p[Math.min(p.length - 1, i + 1)];
    const dx = b[0] - a[0], dz = b[1] - a[1];
    const l = Math.hypot(dx, dz) || 1;
    out.push([p[i][0] + (dz / l) * d, p[i][1] - (dx / l) * d]);
  }
  return out;
}

function coverImage(L: TerrainLayer) {
  const { w, h } = L.g;
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const ctx = c.getContext('2d')!;
  const img = ctx.createImageData(w, h);
  const cache = new Map<string, number[]>();
  const rgb = (hex: string) => {
    if (!cache.has(hex)) cache.set(hex, [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16)));
    return cache.get(hex)!;
  };
  for (let i = 0; i < w * h; i++) {
    const water = L.flags[i] & 1;
    const ocean = L.flags[i] & 2;
    let col: string;
    if (water) col = ocean ? '#cdb88c' : '#7a7a5a';
    else if (L.oceanD[i] * 2 < 16) col = COVER[60];
    else col = COVER[L.cover[i]] ?? COVER[0];
    const [r, g, b] = rgb(col);
    img.data.set([r, g, b, 255], i * 4);
  }
  ctx.putImageData(img, 0, 0);
  return c;
}

// Paving units as canvas patterns, 4 m a tile (the paint's fine window is ~7 px a metre: a brick is
// a pixel or two, so what reads is each unit's own shade between lighter joints).
const pavePatterns = new Map<string, CanvasPattern | null>();
export function pavePattern(ctx: CanvasRenderingContext2D, kind: 'brick' | 'sett' | 'slab'): CanvasPattern | null {
  if (pavePatterns.has(kind)) return pavePatterns.get(kind)!;
  const N = 128, M = N / 4; // px a tile, px a metre
  const c = makeCanvas(N, N), g = c.getContext('2d') as CanvasRenderingContext2D | null;
  if (!g || typeof DOMMatrix === 'undefined') { pavePatterns.set(kind, null); return null; }
  const joint = kind === 'brick' ? '#c2ab98' : kind === 'sett' ? '#a39d93' : '#b9b2a6';
  g.fillStyle = joint;
  g.fillRect(0, 0, N, N);
  const tone = (i: number, j: number) => { const h = Math.sin(i * 12.9898 + j * 78.233) * 43758.5453; return h - Math.floor(h); };
  const base = kind === 'brick' ? [139, 90, 71] : kind === 'sett' ? [111, 106, 99] : [140, 131, 120];
  const [bw, bh, gap] = kind === 'brick' ? [0.45 * M, 0.22 * M, 1.4] : kind === 'sett' ? [0.3 * M, 0.3 * M, 1.8] : [0.9 * M, 0.6 * M, 1.2];
  for (let j = 0; j * bh < N; j++)
    for (let i = -1; i * bw < N; i++) {
      const off = kind === 'sett' ? (j % 2) * bw * 0.35 : (j % 2) * bw * 0.5; // (running bond; setts in staggered rows)
      const t = 0.82 + 0.3 * tone(i, j);
      g.fillStyle = `rgb(${Math.round(base[0] * t)},${Math.round(base[1] * t)},${Math.round(base[2] * t)})`;
      g.fillRect(i * bw + off + gap / 2, j * bh + gap / 2, bw - gap, bh - gap);
    }
  const pat = ctx.createPattern(c as CanvasImageSource, 'repeat');
  pat?.setTransform(new DOMMatrix().scale(1 / M));
  pavePatterns.set(kind, pat);
  return pat;
}

export class Painter {
  areas: Prepared<Area>[];
  roads: Prepared<Road>[];
  foot: Prepared<number>[]; // (item: how much the footprint counts toward paving its block)
  walks: Prepared<number>[];
  // Streamed tiles (real-lite / synth — everything past the bake) paint too: their roads and
  // footprints join while mounted, so sidewalks, curbs, markings, walks and contact shadows
  // continue wherever the world does.
  private tiles = new Map<string, { roads: Prepared<Road>[]; foot: Prepared<number>[]; front: Prepared<number>[]; areas: Prepared<Area>[]; box: [number, number, number, number]; xing: number[] }>();
  // `fronts` flags the storefronts (shops, apartments over shops): their ground is paved.
  /** `weights`: how much of each footprint counts toward paving its block — a house on its lot
   *  leaves yards (0.45), a city building fills its lot (1). */
  /** `xing`: the tile's mapped crossings (kerbside.ts crossingPaint — x, z, ux, uz, w, style). */
  setTile(id: string, roads: Road[], rings: [number, number][][], box: [number, number, number, number], fronts: boolean[] = [], areas: Area[] = [], weights: number[] = [], xing: number[] = []) {
    const foot = rings.map((r, i) => prep(weights[i] ?? 1, [r.flatMap(([x, z]) => [x * 10, z * 10])]));
    this.tiles.set(id, {
      roads: roads.filter((r) => !r.br).map((r) => prep(r, [r.p])),
      foot,
      front: foot.filter((_, i) => fronts[i]),
      areas: areas.filter((a) => AREA_FILL[a.c]).map((a) => prep(a, [...a.o, ...a.i])),
      box,
      xing,
    });
    this.merged.clear();
    this.census.clear();
  }
  private xingIn(x0: number, z0: number, x1: number, z1: number): number[] {
    const out: number[] = [];
    for (const t of this.tiles.values())
      if (t.xing.length && t.box[2] > x0 - 50 && t.box[0] < x1 + 50 && t.box[3] > z0 - 50 && t.box[1] < z1 + 50)
        for (let i = 0; i + 5 < t.xing.length; i += 6) if (t.xing[i] > x0 - 30 && t.xing[i] < x1 + 30 && t.xing[i + 1] > z0 - 30 && t.xing[i + 1] < z1 + 30) out.push(...t.xing.slice(i, i + 6));
    return out;
  }
  // The lists a window paints from — the bake's own plus every mounted tile's that reaches it —
  // kept per set of tiles: they were concatenated (and the roads and areas sorted) afresh for
  // every window, and a grass cell's mask is a window (a 20 m one, a few a frame on a drive).
  private merged = new Map<string, { roads?: Prepared<Road>[]; areas?: Prepared<Area>[]; foot?: Prepared<number>[]; front?: Prepared<number>[] }>();
  // block-paving censuses by window (paint): the footprints round a window, binned
  private census = new Map<string, { cells: Map<string, [number, number, number][]>; at: Map<Prepared<number>, [number, number, number]> }>();
  private near(x0: number, z0: number, x1: number, z1: number) {
    let key = '';
    for (const [id, t] of this.tiles) if (t.box[2] > x0 - 50 && t.box[0] < x1 + 50 && t.box[3] > z0 - 50 && t.box[1] < z1 + 50) key += id + ' ';
    let m = this.merged.get(key);
    if (!m) {
      if (this.merged.size > 64) this.merged.clear();
      this.merged.set(key, (m = {}));
    }
    return { key, m };
  }
  private tilesOf(key: string) { return key ? key.trim().split(' ').map((id) => this.tiles.get(id)!) : []; }
  private areasIn(x0: number, z0: number, x1: number, z1: number): Prepared<Area>[] {
    if (!this.tiles.size) return this.areas;
    const { key, m } = this.near(x0, z0, x1, z1);
    if (!m.areas) {
      const extra: Prepared<Area>[] = [];
      for (const t of this.tilesOf(key)) extra.push(...t.areas);
      m.areas = !extra.length ? this.areas : [...this.areas, ...extra].sort((a, b) => AREA_ORDER.indexOf(a.item.c) - AREA_ORDER.indexOf(b.item.c));
    }
    return m.areas;
  }
  dropTile(id: string) { this.tiles.delete(id); this.tileWalks.delete(id); this.merged.clear(); this.census.clear(); }
  private roadsIn(x0: number, z0: number, x1: number, z1: number): Prepared<Road>[] {
    if (!this.tiles.size) return this.roads;
    const { key, m } = this.near(x0, z0, x1, z1);
    if (!m.roads) {
      const extra: Prepared<Road>[] = [];
      for (const t of this.tilesOf(key)) extra.push(...t.roads);
      m.roads = !extra.length ? this.roads : [...this.roads, ...extra].sort((a, b) => (ROAD_RANK[a.item.c] ?? 1) - (ROAD_RANK[b.item.c] ?? 1));
    }
    return m.roads;
  }
  private frontIn(x0: number, z0: number, x1: number, z1: number): Prepared<number>[] {
    const { key, m } = this.near(x0, z0, x1, z1);
    if (!m.front) {
      const out: Prepared<number>[] = [];
      for (const t of this.tilesOf(key)) out.push(...t.front);
      m.front = out;
    }
    return m.front;
  }
  private footIn(x0: number, z0: number, x1: number, z1: number): Prepared<number>[] {
    if (!this.tiles.size) return this.foot;
    const { key, m } = this.near(x0, z0, x1, z1);
    if (!m.foot) {
      const out = [...this.foot];
      for (const t of this.tilesOf(key)) out.push(...t.foot);
      m.foot = out;
    }
    return m.foot;
  }
  // front walks: the bake's, plus each mounted tile's (they go with it — they used to pile up
  // for the whole session, a tile's again every time it remounted)
  private tileWalks = new Map<string, { box: [number, number, number, number]; walks: Prepared<number>[] }>();
  private walksIn(x0: number, z0: number, x1: number, z1: number): Prepared<number>[] {
    if (!this.tileWalks.size) return this.walks;
    const out = [...this.walks];
    for (const t of this.tileWalks.values()) if (t.box[2] > x0 - 10 && t.box[0] < x1 + 10 && t.box[3] > z0 - 10 && t.box[1] < z1 + 10) out.push(...t.walks);
    return out;
  }
  private bakedRoads = new Set<Prepared<Road>>();
  constructor(json: WorldJson, walks: number[] = []) {
    this.areas = json.areas.filter((a) => AREA_FILL[a.c]).sort((a, b) => AREA_ORDER.indexOf(a.c) - AREA_ORDER.indexOf(b.c)).map((a) => prep(a, [...a.o, ...a.i]));
    this.roads = json.roads.filter((r) => !r.br).sort((a, b) => (ROAD_RANK[a.c] ?? 1) - (ROAD_RANK[b.c] ?? 1)).map((r) => prep(r, [r.p]));
    this.bakedRoads = new Set(this.roads);
    this.foot = json.buildings.filter((b) => !b.lod).map((b) => prep(1, [b.r])); // (item: the paving weight — the bake keeps its look)
    this.walks = [];
    this.addWalks(walks);
  }
  // Front-walk paint arrives per tile as the stream loads them (`id`: the tile's, dropped with it).
  addWalks(walks: number[], id?: string) {
    const list: Prepared<number>[] = [];
    let x0 = Infinity, z0 = Infinity, x1 = -Infinity, z1 = -Infinity;
    for (let i = 0; i + 4 < walks.length; i += 5) {
      list.push(prep(walks[i + 4], [[walks[i], walks[i + 1], walks[i + 2], walks[i + 3]].map((v) => v * 10)]));
      x0 = Math.min(x0, walks[i], walks[i + 2]), x1 = Math.max(x1, walks[i], walks[i + 2]), z0 = Math.min(z0, walks[i + 1], walks[i + 3]), z1 = Math.max(z1, walks[i + 1], walks[i + 3]);
    }
    if (id === undefined) this.walks.push(...list);
    else if (list.length) this.tileWalks.set(id, { box: [x0, z0, x1, z1], walks: list });
    else this.tileWalks.delete(id);
  }

  /** Paints the window x0..x1, z0..z1. With `clip` (a part of the window: the slice DetailGround is
   *  painting) only what reaches that part is drawn; what the window decides — how paved a building's
   *  block is, from its neighbours — is decided by the window, so a slice's pixels are the window's. */
  paint(ctx: CanvasRenderingContext2D, x0: number, z0: number, x1: number, z1: number, pxPerM: number, level: 0 | 1 | 2, clip?: [number, number, number, number]) {
    const detail = level >= 1;
    const [c0, d0, c1, d1] = clip ?? [x0, z0, x1, z1];
    // Dense blocks are paved: where footprints cover a quarter of the ground within 60 m of a
    // building (a city block, not a suburb), the ground round it is concrete and flagstone out to
    // 8–14 m (the denser, the wider), so the gaps between a city's buildings and the strips to its
    // kerbs pave, not lawn; the grass field (grassMask) then stays off it. Paved round the buildings
    // themselves, each judged by the ground round its own middle: 40 m cells north-up laid lawn in
    // stair-steps through any grid that isn't (Seattle's is turned 32°). Under the areas: a city
    // park stays a park.
    if (detail) {
      const C = 40, R = 60, near: [Prepared<number>, number, number, number][] = [];
      // the window's census: each footprint's middle and weighted area, in 40 m cells (a window's
      // slices share it — counted once a window, not once a slice)
      const ck = `${x0},${z0},${x1},${z1}`;
      let cen = clip ? this.census.get(ck) : undefined;
      if (!cen) {
        cen = { cells: new Map(), at: new Map() };
        for (const f of this.footIn(x0, z0, x1, z1)) {
          if (!overlaps(f, x0, z0, x1, z1, 100)) continue;
          const r = f.pts[0];
          let a = 0, cx = 0, cz = 0;
          for (let i = 0, j = r.length - 1; i < r.length; j = i++) (a += (r[j][0] - r[i][0]) * (r[j][1] + r[i][1])), (cx += r[i][0]), (cz += r[i][1]);
          cx /= r.length;
          cz /= r.length;
          const k = `${Math.floor(cx / C)},${Math.floor(cz / C)}`;
          // (a house's footprint counts for under half: a street of houses on their lots is lawns
          // and gardens — Queen Anne paved over read as a car park)
          if (!cen.cells.has(k)) cen.cells.set(k, []);
          cen.cells.get(k)!.push([cx, cz, Math.abs(a / 2) * f.item]);
          cen.at.set(f, [cx, cz, Math.abs(a / 2) * f.item]);
        }
        if (clip) {
          if (this.census.size >= 4) this.census.clear();
          this.census.set(ck, cen);
        }
      }
      const cells = cen.cells;
      for (const [f, [cx, cz, own]] of cen.at) if (overlaps(f, c0, d0, c1, d1, 16)) near.push([f, cx, cz, own]);
      // (one path a width band: a single stroke paints the union once, however many aprons overlap)
      const bands: Prepared<number>[][] = [[], [], []];
      for (const [f, cx, cz, own] of near) {
        let n = 0;
        for (let i = Math.floor((cx - R) / C); i <= Math.floor((cx + R) / C); i++)
          for (let j = Math.floor((cz - R) / C); j <= Math.floor((cz + R) / C); j++)
            for (const [bx, bz, ba] of cells.get(`${i},${j}`) ?? []) if ((bx - cx) ** 2 + (bz - cz) ** 2 < R * R) n += ba;
        // (a quarter of the ground round it built on — or one big building, a store or a block of
        // flats, on its own: its apron is paved whatever stands next to it)
        const d = Math.max(n / (Math.PI * R * R * 0.25), own / 900);
        if (d >= 1) bands[d < 1.3 ? 0 : d < 1.7 ? 1 : 2].push(f);
      }
      ctx.fillStyle = ctx.strokeStyle = '#b1ab9d';
      ctx.lineJoin = 'round';
      bands.forEach((fs, b) => {
        if (!fs.length) return;
        ctx.beginPath();
        for (const f of fs) pathOf(ctx, f.pts[0], true);
        ctx.lineWidth = 2 * (8 + b * 3);
        ctx.fill('nonzero');
        ctx.stroke();
      });
    }
    // Areas
    const areas = this.areasIn(x0, z0, x1, z1);
    for (const a of areas) {
      if ((a.item.lod && level > 0) || !overlaps(a, c0, d0, c1, d1)) continue;
      ctx.beginPath();
      for (const r of a.pts) pathOf(ctx, r, true);
      // a pier's deck, a playground's woodchips or rubber: the mapped surface's colour where it says
      ctx.fillStyle = ((a.item.c === 'pier' || a.item.k === 'playground') && surfacePaint(a.item.sf)) || AREA_FILL[a.item.c];
      ctx.globalAlpha = a.item.c === 'wood' ? 0.75 : 0.92;
      ctx.fill('evenodd');
      if (a.item.c === 'pool' || (a.item.c === 'pitch' && !a.item.k)) {
        ctx.globalAlpha = 0.9;
        ctx.strokeStyle = '#f2efe6';
        ctx.lineWidth = a.item.c === 'pool' ? 0.8 : 0.25;
        ctx.stroke();
      }
    }
    ctx.globalAlpha = 1;
    // Courts and fields (sports.ts): a pitch that says its sport gets its own surface, and in the
    // fine window its lines — fitted exactly where props.ts stands the hoops, nets and goals
    if (level >= 1)
      for (const a of areas) {
        const k = a.item.k;
        if (a.item.c !== 'pitch' || !k || k === 'playground' || k === 'american_football' || !overlaps(a, c0, d0, c1, d1)) continue;
        ctx.globalAlpha = 0.95;
        paintCourt(ctx, a.pts[0], k as Sport, a.item.sf, level === 2 ? Math.max(0.1, 0.9 / pxPerM) : 0);
      }
    ctx.globalAlpha = 1;
    // Parking lots: the stall lines (lots.ts — the same layout props.ts parks the cars in)
    if (level === 2) {
      ctx.strokeStyle = '#e9e6dc';
      ctx.lineWidth = 0.12;
      ctx.lineCap = 'butt';
      ctx.globalAlpha = 0.85;
      for (const a of areas) {
        if (a.item.c !== 'parking' || !overlaps(a, c0, d0, c1, d1, 5)) continue;
        const L = lotOf(a);
        if (!L) continue;
        ctx.beginPath();
        for (let i = 0; i + 3 < L.lines.length; i += 4) (ctx.moveTo(L.lines[i], L.lines[i + 1]), ctx.lineTo(L.lines[i + 2], L.lines[i + 3]));
        ctx.stroke();
      }
      ctx.globalAlpha = 1;
    }
    if (detail) {
      // Storefronts stand on pavement: a shop's frontage is sidewalk right up to the glass, never a
      // strip of lawn or desert between the kerb and the door (mapped roads are centre lines at a
      // lanes-derived width, so parking lanes and wide sidewalks would otherwise read as yard).
      // Streamed tiles only — the baked shore keeps its surveyed walks.
      ctx.strokeStyle = '#b3ad9f';
      ctx.lineWidth = 7; // 3.5 m: a sidewalk's width; deeper set-backs are the lots (mapped parking)
      ctx.lineJoin = 'round';
      for (const f of this.frontIn(x0, z0, x1, z1)) {
        if (!overlaps(f, c0, d0, c1, d1, 10)) continue;
        ctx.beginPath();
        pathOf(ctx, f.pts[0], true);
        ctx.stroke();
      }
    }
    // Contact shadows / foundations under buildings (grounds the houses in the wash).
    if (detail) {
      ctx.strokeStyle = 'rgba(70,64,56,0.32)';
      ctx.fillStyle = 'rgba(90,84,72,0.5)';
      ctx.lineWidth = level === 2 ? 1.1 : 1.6;
      ctx.lineJoin = 'round';
      for (const f of this.footIn(x0, z0, x1, z1)) {
        if (!overlaps(f, c0, d0, c1, d1, 5)) continue;
        ctx.beginPath();
        pathOf(ctx, f.pts[0], true);
        ctx.fill();
        ctx.stroke();
      }
    }
    const all = this.roadsIn(x0, z0, x1, z1).filter((r) => (level > 0 ? !r.item.lod : true) && (detail || !MINOR.has(r.item.c)) && overlaps(r, x0, z0, x1, z1));
    const list = clip ? all.filter((r) => overlaps(r, c0, d0, c1, d1)) : all;
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';
    // Front walks from each door to the street (flagstone-pale, under everything else).
    if (detail) {
      ctx.strokeStyle = '#bdb5a3';
      for (const w of this.walksIn(c0, d0, c1, d1)) {
        if (!overlaps(w, c0, d0, c1, d1, 5)) continue;
        ctx.beginPath();
        pathOf(ctx, w.pts[0]);
        ctx.lineWidth = w.item;
        ctx.stroke();
      }
    }
    const minW = 1.2 / pxPerM;
    // Sidewalks / verges
    if (detail)
      for (const { item: r, pts } of list) {
        const rank = ROAD_RANK[r.c] ?? 1;
        if (rank < 2 || r.sw) continue;
        ctx.beginPath();
        pathOf(ctx, pts[0]);
        ctx.strokeStyle = rank >= 5 ? '#bab4a6' : '#b3ad9f';
        ctx.lineWidth = r.w + (rank >= 5 ? 7 : 3);
        ctx.stroke();
      }
    // Curbs / gutters: a thin darker rim just outside the pavement.
    if (level === 2)
      for (const { item: r, pts } of list) {
        if ((ROAD_RANK[r.c] ?? 1) < 2) continue;
        ctx.beginPath();
        pathOf(ctx, pts[0]);
        ctx.strokeStyle = '#8f8a80';
        ctx.lineWidth = r.w + 0.5;
        ctx.stroke();
      }
    // Pavement, edge-darkened like a wash drying at its rim.
    const arid = activeStyle().climate === 'arid', region = activeStyle().region;
    for (const { item: r, pts } of list) {
      const rank = ROAD_RANK[r.c] ?? 1;
      const minor = MINOR.has(r.c);
      // (roadPalette.ts: bleached desert asphalt, painted bike lanes, pale paths — shared with the
      // far ribbons so the hand-off at the window's edge doesn't show)
      const base = roadPaint(r, region, arid);
      ctx.beginPath();
      pathOf(ctx, pts[0]);
      ctx.strokeStyle = base;
      ctx.lineWidth = Math.max(r.w, minW);
      ctx.stroke();
      const paved = streetSurface((r as { sf?: string }).sf);
      if (!minor && detail && !paved) {
        ctx.globalAlpha = 0.3;
        ctx.strokeStyle = arid ? '#8a857c' : rank >= 5 ? '#6a6c70' : '#76787b';
        ctx.lineWidth = r.w * 0.72;
        ctx.stroke();
        ctx.globalAlpha = 1;
      }
      // brick, sett and flags: the street laid in its units — bricks in running bond, granite setts,
      // big slabs — each a shade of its own between pale mortar joints (a texture of the surface at
      // the paint's resolution, not a line drawing)
      const sfv = (r as { sf?: string }).sf ?? '';
      if (paved && detail && level === 2 && /brick|sett|cobble|paving_stones|stone|clay/.test(sfv)) {
        const kind = /brick|clay/.test(sfv) ? 'brick' : /sett|cobble|stone/.test(sfv) ? 'sett' : 'slab';
        const pat = pavePattern(ctx, kind);
        if (pat) {
          ctx.save();
          ctx.globalAlpha = kind === 'slab' ? 0.4 : 0.55;
          ctx.strokeStyle = pat;
          ctx.lineWidth = Math.max(r.w, minW);
          ctx.lineCap = 'butt';
          ctx.beginPath();
          pathOf(ctx, pts[0]);
          ctx.stroke();
          ctx.restore();
        }
      }
    }
    if (!detail) return;
    // Markings on the main roads.
    ctx.lineCap = 'butt';
    for (const { item: r, pts } of list) {
      const rank = ROAD_RANK[r.c] ?? 1;
      if (rank < 3 || r.c.endsWith('_link')) continue;
      const p = pts[0];
      ctx.strokeStyle = '#e9c54a';
      ctx.lineWidth = level === 2 ? 0.14 : 0.28;
      ctx.globalAlpha = 0.92;
      for (const d of r.ow ? [] : level === 2 ? [-0.15, 0.15] : [0]) {
        ctx.beginPath();
        pathOf(ctx, offsetLine(p, d));
        ctx.stroke();
      }
      if (rank >= 4) {
        ctx.strokeStyle = '#f4f2ea';
        ctx.lineWidth = level === 2 ? 0.15 : 0.24;
        for (const d of [-(r.w / 2 - 0.7), r.w / 2 - 0.7]) {
          ctx.beginPath();
          pathOf(ctx, offsetLine(p, d));
          ctx.stroke();
        }
      }
      ctx.globalAlpha = 1;
    }
    // (a junction is judged by all its arms: a crossing's bars reach ~25 m from its node, so the
    // arms of one just past the slice count too)
    if (level === 2) this.crosswalks(ctx, clip ? all.filter((r) => overlaps(r, c0, d0, c1, d1, 50)) : all, this.xingIn(c0, d0, c1, d1));
    if (level === 2) this.wear(ctx, list.filter((r) => !this.bakedRoads.has(r)), arid); // streamed streets (the baked shore keeps its look)
    ctx.lineCap = 'round';
  }

  // Ladder crosswalks where a main road (tertiary and up) meets another carriageway: white bars
  // across each approach, just outside the junction. Junctions are nodes the roads share (OSM
  // joins streets at a common node; the 0.1 m ints make those exact).
  // Worn asphalt: hairline cracks wandering along and across the lanes, and darker sealed patches
  // — the texture of an American street, heavier where the sun bakes it. Seeded by position, so
  // every visit finds the same cracks.
  private wear(ctx: CanvasRenderingContext2D, list: Prepared<Road>[], arid: boolean) {
    const hash = (x: number, z: number, k: number) => {
      let h = (Math.floor(x * 2.3) * 73856093) ^ (Math.floor(z * 2.9) * 19349663) ^ (k * 83492791);
      h = Math.imul(h ^ (h >>> 13), 0x5bd1e995);
      return ((h ^ (h >>> 15)) >>> 0) / 4294967296;
    };
    const crackP = arid ? 0.4 : 0.2;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    for (const { item: r, pts } of list) {
      const rank = ROAD_RANK[r.c] ?? 1;
      if (rank < 1 || r.sw || MINOR.has(r.c) || r.w < 4) continue;
      const p = pts[0];
      for (let i = 0; i + 1 < p.length; i++) {
        const [ax, az] = p[i], [bx, bz] = p[i + 1], L = Math.hypot(bx - ax, bz - az);
        if (L < 1) continue;
        const tx = (bx - ax) / L, tz = (bz - az) / L, nx = -tz, nz = tx;
        for (let s = 2; s < L - 1; s += 5) {
          const cx = ax + tx * s, cz = az + tz * s, h = hash(cx, cz, 1);
          if (h < crackP) {
            // a crack: three to five kinked segments, starting somewhere across the lane
            let x = cx + nx * (hash(cx, cz, 2) - 0.5) * (r.w - 1.2), z = cz + nz * (hash(cx, cz, 2) - 0.5) * (r.w - 1.2);
            const across = hash(cx, cz, 3) < 0.35;
            ctx.beginPath();
            ctx.moveTo(x, z);
            const n = 3 + Math.floor(hash(cx, cz, 4) * 3);
            for (let k = 0; k < n; k++) {
              const a = (hash(cx + k, cz, 5) - 0.5) * 1.2, l = 0.35 + hash(cx, cz + k, 6) * 0.7;
              const dx = across ? nx : tx, dz = across ? nz : tz;
              x += (dx * Math.cos(a) - dz * Math.sin(a)) * l;
              z += (dz * Math.cos(a) + dx * Math.sin(a)) * l;
              ctx.lineTo(x, z);
            }
            ctx.strokeStyle = 'rgba(38,36,33,0.5)';
            ctx.lineWidth = 0.05;
            ctx.stroke();
          }
          if (h > 1 - crackP * 0.18) {
            // a sealed patch: a darker rectangle squared to the road
            const pl = 1.2 + hash(cx, cz, 7) * 1.6, pw = 0.8 + hash(cx, cz, 8) * 0.9, o = (hash(cx, cz, 9) - 0.5) * Math.max(0, r.w - pw - 1);
            const ox = cx + nx * o, oz = cz + nz * o;
            ctx.beginPath();
            ctx.moveTo(ox - tx * pl / 2 - nx * pw / 2, oz - tz * pl / 2 - nz * pw / 2);
            ctx.lineTo(ox + tx * pl / 2 - nx * pw / 2, oz + tz * pl / 2 - nz * pw / 2);
            ctx.lineTo(ox + tx * pl / 2 + nx * pw / 2, oz + tz * pl / 2 + nz * pw / 2);
            ctx.lineTo(ox - tx * pl / 2 + nx * pw / 2, oz - tz * pl / 2 + nz * pw / 2);
            ctx.closePath();
            ctx.fillStyle = 'rgba(30,29,28,0.16)';
            ctx.fill();
          }
        }
      }
    }
  }

  private crosswalks(ctx: CanvasRenderingContext2D, list: Prepared<Road>[], xing: number[]) {
    // the mapped ones first, exactly where the map puts them: ladder bars along the traffic, or the
    // two transverse lines of a `crossing:markings=lines` (an unmarked crossing paints nothing)
    const bar = (cx: number, cz: number, ux: number, uz: number, len: number, wid: number) => {
      const qx = -uz, qz = ux;
      ctx.beginPath();
      ctx.moveTo(cx - ux * len / 2 - qx * wid / 2, cz - uz * len / 2 - qz * wid / 2);
      ctx.lineTo(cx + ux * len / 2 - qx * wid / 2, cz + uz * len / 2 - qz * wid / 2);
      ctx.lineTo(cx + ux * len / 2 + qx * wid / 2, cz + uz * len / 2 + qz * wid / 2);
      ctx.lineTo(cx - ux * len / 2 + qx * wid / 2, cz - uz * len / 2 + qz * wid / 2);
      ctx.closePath();
      ctx.fill();
    };
    ctx.fillStyle = '#eeebe2';
    ctx.globalAlpha = 0.88;
    for (let i = 0; i + 5 < xing.length; i += 6) {
      const [x, z, ux, uz, w, style] = xing.slice(i, i + 6), qx = -uz, qz = ux;
      if (style === 1) for (let s = -w / 2 + 0.55; s <= w / 2 - 0.5; s += 1.1) bar(x + qx * s, z + qz * s, ux, uz, 3, 0.54);
      else if (style === 2) for (const d of [-1.5, 1.5]) bar(x + ux * d, z + uz * d, qx, qz, w - 0.4, 0.3);
    }
    ctx.globalAlpha = 1;
    // (a mapped crossing on this arm: on its street — parallel, near its centre line — and within a
    // crosswalk's reach along it; the perpendicular arms of the same junction keep their own)
    const mapped = (x: number, z: number, ux: number, uz: number, w: number) => {
      for (let i = 0; i + 5 < xing.length; i += 6) {
        const mx = xing[i] - x, mz = xing[i + 1] - z;
        if (Math.abs(mx * ux + mz * uz) < 7 && Math.abs(-mx * uz + mz * ux) < Math.max(3, w / 2 + 1) && Math.abs(xing[i + 2] * ux + xing[i + 3] * uz) > 0.7) return true;
      }
      return false;
    };
    const at = new Map<string, { r: Road; p: P[]; i: number }[]>();
    for (const { item: r, pts } of list) {
      const rank = ROAD_RANK[r.c] ?? 1;
      if (rank < 2 || r.sw || r.c.endsWith('_link')) continue;
      const p = pts[0];
      for (let i = 0; i < p.length; i++) {
        const k = `${Math.round(p[i][0] * 10)}_${Math.round(p[i][1] * 10)}`;
        const l = at.get(k);
        if (l) l.push({ r, p, i });
        else at.set(k, [{ r, p, i }]);
      }
    }
    ctx.fillStyle = '#eeebe2';
    ctx.globalAlpha = 0.88;
    for (const legs of at.values()) {
      if (legs.length < 2 || new Set(legs.map((l) => l.r)).size < 2) continue;
      // a junction has three arms or more (a way passing through counts two, one ending there one):
      // two arms is just a street whose way is split there (a tag change mid-block) — no crossing
      const arms = legs.reduce((n, l) => n + (l.i > 0 && l.i < l.p.length - 1 ? 2 : 1), 0);
      if (arms < 3) continue;
      if (!legs.some((l) => (ROAD_RANK[l.r.c] ?? 1) >= 3)) continue;
      const wMax = Math.max(...legs.map((l) => l.r.w));
      for (const { r, p, i } of legs) {
        for (const j of [i - 1, i + 1]) {
          if (j < 0 || j >= p.length) continue;
          const [nx0, nz0] = p[i], dx = p[j][0] - nx0, dz = p[j][1] - nz0, L = Math.hypot(dx, dz);
          const d0 = wMax / 2 + 1.2;
          if (L < d0 + 4) continue; // too short a stub to carry a crossing
          const ux = dx / L, uz = dz / L, qx = -uz, qz = ux;
          const cx = nx0 + ux * (d0 + 1.5), cz = nz0 + uz * (d0 + 1.5);
          if (mapped(cx, cz, ux, uz, r.w)) continue; // (the map says what's painted on this arm)
          for (let sft = -r.w / 2 + 0.55; sft <= r.w / 2 - 0.5; sft += 1.1) {
            const bx = cx + qx * sft, bz = cz + qz * sft;
            ctx.beginPath();
            ctx.moveTo(bx - ux * 1.5 - qx * 0.27, bz - uz * 1.5 - qz * 0.27);
            ctx.lineTo(bx + ux * 1.5 - qx * 0.27, bz + uz * 1.5 - qz * 0.27);
            ctx.lineTo(bx + ux * 1.5 + qx * 0.27, bz + uz * 1.5 + qz * 0.27);
            ctx.lineTo(bx - ux * 1.5 + qx * 0.27, bz - uz * 1.5 + qz * 0.27);
            ctx.closePath();
            ctx.fill();
          }
        }
      }
    }
    ctx.globalAlpha = 1;
  }
}

export interface GroundPaint {
  slice: THREE.CanvasTexture;
  backdrop: THREE.CanvasTexture;
  sliceCanvas: HTMLCanvasElement;
  detail: DetailGround;
  mid: DetailGround;
  addWalks: (walks: number[], id?: string) => void;
  setTile: (id: string, roads: Road[], rings: [number, number][][], box: [number, number, number, number], fronts?: boolean[], areas?: Area[], weights?: number[], xing?: number[]) => void;
  dropTile: (id: string) => void;
  /** Where the painted ground is open (unpainted land or a green wash) inside a square — the
   *  grass field grows only there, so it can never sit on a painted sidewalk, walk, lot or beach. */
  grassMask: (x0: number, z0: number, size: number) => { res: number; data: Uint8Array };
}

const makeTex = (c: HTMLCanvasElement) => {
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.flipY = false; // canvas row 0 = north edge = v 0, same as the data textures
  t.anisotropy = 8;
  t.generateMipmaps = true;
  t.minFilter = THREE.LinearMipmapLinearFilter;
  t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping;
  return t;
};

type Rect = [number, number, number, number]; // x0, z0, x1, z1: a window's pixels
// A window's pixels go in cells of CELL px: the steps it moves in, its slices and the bands along its
// edges all fall on them. CELL is also past the reach of the wash's blur (6 px reaches ~20), so a
// slice painted with a CELL of margin round it gets the same blur as the whole window.
const CELL = 32;

// A slice's canvas: an OffscreenCanvas where its 2D context blurs (`filter`), else an element.
function sliceCanvas(): AnyCanvas {
  if (typeof OffscreenCanvas !== 'undefined') {
    const c = new OffscreenCanvas(1, 1), g = c.getContext('2d');
    if (g && typeof (g as { filter?: unknown }).filter === 'string') return c;
  }
  return document.createElement('canvas');
}

// the cells a rect (pixels) touches, marked
function mark(m: Uint8Array, N: number, x0: number, z0: number, x1: number, z1: number) {
  const i0 = Math.max(0, Math.floor(x0 / CELL)), i1 = Math.min(N, Math.ceil(x1 / CELL));
  for (let j = Math.max(0, Math.floor(z0 / CELL)); j < Math.min(N, Math.ceil(z1 / CELL)); j++) if (i1 > i0) m.fill(1, j * N + i0, j * N + i1);
}
/** The marked cells of an N×N grid as rectangles (pixels) of at most `max` pixels each: runs along
 *  each row (N/4 cells at most), stacked while the rows under repeat them. The outer row and column
 *  of cells stand alone, so a slice either takes in the window's edge or doesn't. */
export function slices(m: Uint8Array, N: number, cell: number, max: number): Rect[] {
  const out: Rect[] = [], run = Math.max(1, N >> 2);
  let open: [number, number, number][] = []; // i0, i1, first row: rectangles growing down
  for (let j = 0; j <= N; j++) {
    const runs: [number, number][] = [];
    for (let i = 0; j < N && i < N; ) {
      if (!m[j * N + i]) { i++; continue; }
      let e = i + 1;
      while (e < N && e - i < run && m[j * N + e] && e !== 1 && e !== N - 1) e++;
      runs.push([i, e]);
      i = e;
    }
    const next: [number, number, number][] = [];
    for (const o of open) {
      const k = runs.findIndex(([a, b]) => a === o[0] && b === o[1]);
      if (k >= 0 && j !== 1 && j !== N - 1 && (o[1] - o[0]) * (j - o[2] + 1) * cell * cell <= max) {
        next.push(o);
        runs.splice(k, 1);
      } else out.push([o[0] * cell, o[2] * cell, o[1] * cell, j * cell]);
    }
    for (const [a, b] of runs) next.push([a, b, j]);
    open = next;
  }
  return out;
}

// A ground window that re-centres on the walker: `detail` (300 m, ~15 cm/px, curbs and
// double centre lines) and `mid` (1.6 km, ~0.8 m/px: sidewalks, walks, markings) — both
// paint the baked features AND the mounted streamed tiles, over the land-cover wash where
// the bake has one and a lawn wash past it.
// Moving it used to repaint the whole window in one frame: the wash through its blur, every street
// and lot, then the 2048² upload. That was half a second wherever the browser rasters a 2D canvas on
// the CPU, every 66 m of a flight (Robby: "every ~2 seconds it locks up"). Now the window moves in
// whole steps of its own pixels: what it still shows slides across in one copy, and only the strip
// it moved onto is painted (with the bands along its edges, where the wash fades out), a slice a
// frame. The texture shows the old window until the new one is whole.
export class DetailGround {
  readonly canvas = document.createElement('canvas');
  readonly texture: THREE.CanvasTexture;
  readonly box = new THREE.Vector4(0, 0, 1, 1);
  // the window the texture shows: its corner, in its own pixels from the region's origin (NaN
  // until the first paint)
  private wx = NaN;
  private wz = NaN;
  // the window being painted in: its corner, and the slices still to paint (the canvas already
  // holds its pixels everywhere else)
  private job: { wx: number; wz: number; todo: Rect[] } | null = null;
  private changed: Rect[] = []; // world boxes tiles changed in (touch), not yet in a job
  private slice: AnyCanvas | null = null;
  constructor(private painter: Painter, private covers: { img: HTMLCanvasElement; L: TerrainLayer }[], res: number, readonly size = 300, private level: 1 | 2 = 2, private blur = 6) {
    this.canvas.width = this.canvas.height = res;
    this.texture = makeTex(this.canvas);
  }
  /** A move or a change still painting in. */
  get busy() { return this.job !== null; }
  /** A tile changed: its box, out to what its paint reaches (a street's verges, a building's paved
   *  apron and its neighbours'), repaints over the next frames. */
  touch(b: [number, number, number, number]) {
    const R = 100;
    this.changed.push([b[0] - R, b[1] - R, b[2] + R, b[3] + R]);
  }
  /** Keeps the window round the walker, a slice a frame. True when it painted this frame (main.ts
   *  gives one window a frame). */
  update(x: number, z: number, force = false) {
    const s = this.size, res = this.canvas.width, step = res / 32;
    // the window centred on the walker, in steps of s/32 — whole pixels, so it slides unresampled
    const wx = (Math.round((x * res) / s / step) - 16) * step, wz = (Math.round((z * res) / s / step) - 16) * step;
    if (force || Number.isNaN(this.wx)) {
      // the first paint: all of it, now
      this.job = null;
      this.changed.length = 0;
      this.canvas.width = res; // (cleared, its state reset: as a slice's canvas starts)
      this.draw(this.canvas.getContext('2d')!, wx, wz, 0, 0, [0, 0, res, res]);
      this.show(wx, wz);
      return true;
    }
    const cx = (this.wx * s) / res + s / 2, cz = (this.wz * s) / res + s / 2; // (the shown window's middle)
    const moved = Math.hypot(x - cx, z - cz) >= s * 0.22;
    // A move goes before tiles' changes: a change waits while the window moves, and a move falling
    // due while a change paints in goes first, the rest of the change after it. (A tile landing under
    // the window repaints all of it — a move taking that along fell behind a fast flight.)
    if (this.job && this.job.wx === this.wx && this.job.wz === this.wz) {
      if (moved) {
        const k = res / s;
        for (const r of this.job.todo) this.changed.push([(this.wx + r[0]) / k, (this.wz + r[1]) / k, (this.wx + r[2]) / k, (this.wz + r[3]) / k]);
        this.job = null;
      } else if (this.changed.length) {
        const N = res / CELL, m = new Uint8Array(N * N);
        this.markChanged(m, N, this.wx, this.wz);
        this.job.todo.push(...slices(m, N, CELL, (res * res) / 32));
      }
    }
    if (!this.job) {
      if (!moved && !this.changed.length) return false;
      this.job = this.plan(moved ? wx : this.wx, moved ? wz : this.wz);
      if (!this.job.todo.length) {
        this.job = null; // (tiles changed out of its reach)
        return false;
      }
    }
    // A slice a frame (small ones together); four slices' worth while the walker nears the edge of
    // the window shown (a fast flight). What a slice costs: its canvas (with the blur's margin), once
    // for the strokes and once for each wash layer through the blur — one, or all three at the edge.
    const job = this.job, edge = (r: Rect) => r[0] < CELL || r[1] < CELL || r[2] > res - CELL || r[3] > res - CELL;
    const cost = (r: Rect) => (Math.min(res, r[2] + CELL) - Math.max(0, r[0] - CELL)) * (Math.min(res, r[3] + CELL) - Math.max(0, r[1] - CELL)) * (edge(r) ? 4 : 2);
    const budget = ((Math.max(Math.abs(x - cx), Math.abs(z - cz)) > s * 0.36 ? 4 : 1) * res * res) / 16;
    for (let spent = 0; job.todo.length; ) {
      const c = cost(job.todo[0]);
      if (spent && spent + c > budget) break;
      this.paintRect(job, job.todo.shift()!);
      spent += c;
    }
    if (!job.todo.length) {
      this.show(job.wx, job.wz);
      this.job = null;
    }
    return true;
  }
  // Moving to (wx, wz): what's still in the window slides across, and the rest is listed. The whole
  // window's wash fades out along its edges (the blur), so: the strip it moved onto, with the band
  // that was the edge there, and the band the move made the edge behind it. (Along an axis it didn't
  // move on, the edge's band slides along itself and stays right.) Standing still: where tiles changed.
  private plan(wx: number, wz: number) {
    const res = this.canvas.width, N = res / CELL, m = new Uint8Array(N * N);
    const dx = wx - this.wx, dz = wz - this.wz;
    if (Math.abs(dx) >= res || Math.abs(dz) >= res) mark(m, N, 0, 0, res, res);
    else if (dx || dz) {
      const ctx = this.canvas.getContext('2d')!;
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.filter = 'none';
      ctx.globalCompositeOperation = 'copy';
      ctx.drawImage(this.canvas, -dx, -dz);
      ctx.globalCompositeOperation = 'source-over';
      if (dx > 0) (mark(m, N, res - dx - CELL, 0, res, res), mark(m, N, 0, 0, CELL, res));
      else if (dx < 0) (mark(m, N, 0, 0, CELL - dx, res), mark(m, N, res - CELL, 0, res, res));
      if (dz > 0) (mark(m, N, 0, res - dz - CELL, res, res), mark(m, N, 0, 0, res, CELL));
      else if (dz < 0) (mark(m, N, 0, 0, res, CELL - dz), mark(m, N, 0, res - CELL, res, res));
    }
    else this.markChanged(m, N, wx, wz);
    return { wx, wz, todo: slices(m, N, CELL, (res * res) / 32) };
  }
  // the changed boxes' part of the window at (wx, wz), marked (and the boxes let go)
  private markChanged(m: Uint8Array, N: number, wx: number, wz: number) {
    const k = this.canvas.width / this.size;
    for (const b of this.changed.splice(0)) mark(m, N, b[0] * k - wx, b[1] * k - wz, b[2] * k - wx, b[3] * k - wz);
  }
  // One slice of the window being painted in, drawn on a canvas of its own with a CELL of margin (the
  // blur's reach; none past the window's edge, where the whole window's wash fades out too) and
  // copied in as a bitmap. Taking an OffscreenCanvas's bitmap rasters it there and then: on the main
  // thread where 2D canvases are rastered on the CPU (a slice's worth, this frame), queued for the GPU
  // otherwise. (A canvas element drawn into another stays a recording: the whole move was rastered
  // at once, at the upload.)
  private paintRect(job: { wx: number; wz: number }, r: Rect) {
    const res = this.canvas.width;
    const sx = Math.max(0, r[0] - CELL), sz = Math.max(0, r[1] - CELL);
    const sc = (this.slice ??= sliceCanvas());
    sc.width = Math.min(res, r[2] + CELL) - sx; // (its state reset too: each slice starts as the whole window does)
    sc.height = Math.min(res, r[3] + CELL) - sz;
    this.draw(sc.getContext('2d') as CanvasRenderingContext2D, job.wx, job.wz, sx, sz, r);
    const img = 'transferToImageBitmap' in sc ? sc.transferToImageBitmap() : sc;
    const ctx = this.canvas.getContext('2d')!, w = r[2] - r[0], h = r[3] - r[1];
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.filter = 'none';
    ctx.clearRect(r[0], r[1], w, h);
    ctx.drawImage(img, r[0] - sx, r[1] - sz, w, h, r[0], r[1], w, h);
    if ('close' in img) img.close();
  }
  // The paint of the window at (wx, wz) that reaches r, onto ctx, whose pixel (0, 0) is the window's
  // (ox, oz) — the whole window or a slice of it, the same wash and strokes.
  private draw(ctx: CanvasRenderingContext2D, wx: number, wz: number, ox: number, oz: number, r: Rect) {
    const s = this.size, res = this.canvas.width, k = res / s, x0 = (wx * s) / res, z0 = (wz * s) / res;
    // The wash: the town lawn (past the bake; streamed tiles paint their paving on top), the land
    // cover over it, softened. A land-cover layer lying opaque over all of r (a CELL in from its edges
    // and the window's: past the blur's reach) hides what's under it there, so that isn't drawn.
    let lawn = true;
    const layers: [HTMLCanvasElement, number, number, number, number][] = [];
    for (const { img, L } of this.covers) {
      const g = L.g, dx = (g.x0 - x0) * k, dz = (g.z0 - z0) * k, dw = g.w * g.cell * k, dh = g.h * g.cell * k;
      if (dx > res || dz > res || dx + dw < 0 || dz + dh < 0) continue;
      if (Math.max(dx, 0) + CELL <= r[0] && Math.max(dz, 0) + CELL <= r[1] && Math.min(dx + dw, res) - CELL >= r[2] && Math.min(dz + dh, res) - CELL >= r[3]) (layers.length = 0), (lawn = false);
      layers.push([img, dx, dz, dw, dh]);
    }
    ctx.setTransform(1, 0, 0, 1, -ox, -oz);
    ctx.imageSmoothingEnabled = true;
    if (lawn) {
      // (a flat colour comes through the blur unchanged, but where it fades out at the window's edge)
      ctx.filter = r[0] < CELL || r[1] < CELL || r[2] > res - CELL || r[3] > res - CELL ? `blur(${this.blur}px)` : 'none';
      ctx.fillStyle = COVER[50];
      ctx.fillRect(0, 0, res, res);
    }
    ctx.filter = `blur(${this.blur}px)`;
    for (const [img, dx, dz, dw, dh] of layers) ctx.drawImage(img, dx, dz, dw, dh);
    ctx.filter = 'none';
    ctx.setTransform(k, 0, 0, k, -wx - ox, -wz - oz);
    this.painter.paint(ctx, x0, z0, x0 + s, z0 + s, k, this.level, [x0 + r[0] / k, z0 + r[1] / k, x0 + r[2] / k, z0 + r[3] / k]);
  }
  private show(wx: number, wz: number) {
    const s = this.size, res = this.canvas.width;
    this.wx = wx;
    this.wz = wz;
    this.texture.needsUpdate = true;
    this.box.set((wx * s) / res, (wz * s) / res, 1 / s, 1 / s);
  }
}

export function paintGround(world: World, maxTex: number, walks: number[] = []): GroundPaint {
  const { json, terrain } = world;
  const S = json.slice, B = json.backdrop;
  const painter = new Painter(json, walks);

  const size = Math.min(4096, maxTex);
  const sc = document.createElement('canvas');
  sc.width = sc.height = size;
  const sx = size / (S.x1 - S.x0), sz = size / (S.z1 - S.z0);
  const ctx = sc.getContext('2d')!;
  const sliceCover = coverImage(terrain.slice);
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.filter = 'blur(3px)';
  ctx.drawImage(sliceCover, 0, 0, size, size);
  ctx.filter = 'none';
  ctx.setTransform(sx, 0, 0, sz, -S.x0 * sx, -S.z0 * sz);
  painter.paint(ctx, S.x0, S.z0, S.x1, S.z1, sx, 1);

  const backCover0 = coverImage(terrain.backdrop);
  const bw = Math.min(2048, maxTex), bh = Math.min(4096, maxTex);
  const bc = document.createElement('canvas');
  bc.width = bw;
  bc.height = bh;
  const bx = bw / (B.x1 - B.x0), bz = bh / (B.z1 - B.z0);
  const bctx = bc.getContext('2d')!;
  bctx.imageSmoothingEnabled = true;
  bctx.filter = 'blur(1.5px)';
  bctx.drawImage(backCover0, 0, 0, bw, bh);
  bctx.filter = 'none';
  bctx.setTransform(bx, 0, 0, bz, -B.x0 * bx, -B.z0 * bz);
  painter.paint(bctx, B.x0, B.z0, B.x1, B.z1, bx, 0);

  const backCover = backCover0;
  const covers = [{ img: backCover, L: terrain.backdrop }, { img: sliceCover, L: terrain.slice }];
  const detail = new DetailGround(painter, covers, Math.min(2048, maxTex), 300, 2, 6);
  const mid = new DetailGround(painter, covers, Math.min(2048, maxTex), 1600, 1, 2);
  const mc = document.createElement('canvas');
  mc.width = mc.height = 80; // 4 px/m over a 20 m grass cell
  const mctx = mc.getContext('2d', { willReadFrequently: true })!;
  const grassMask = (x0: number, z0: number, size: number) => {
    const res = mc.width, k = res / size;
    mctx.setTransform(1, 0, 0, 1, 0, 0);
    mctx.clearRect(0, 0, res, res);
    mctx.setTransform(k, 0, 0, k, -x0 * k, -z0 * k);
    painter.paint(mctx, x0, z0, x0 + size, z0 + size, k, 2);
    const d = mctx.getImageData(0, 0, res, res).data;
    const out = new Uint8Array(res * res);
    for (let i = 0; i < out.length; i++) {
      const a = d[i * 4 + 3];
      if (a < 50) { out[i] = 1; continue; } // unpainted: the land-cover wash (lawns in town)
      const r = d[i * 4], g = d[i * 4 + 1], b = d[i * 4 + 2];
      out[i] = g > r + 4 && g > b + 10 ? 1 : 0; // a green wash (grass/park/golf/scrub/wood)
    }
    return { res, data: out };
  };
  return {
    slice: makeTex(sc), backdrop: makeTex(bc), sliceCanvas: sc, detail, mid, grassMask,
    addWalks: (w: number[], id?: string) => painter.addWalks(w, id),
    setTile: (id, roads, rings, box, fronts, areas, weights, xing) => { painter.setTile(id, roads, rings, box, fronts, areas, weights, xing); detail.touch(box); mid.touch(box); },
    dropTile: (id) => painter.dropTile(id),
  };
}
