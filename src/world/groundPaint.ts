// Paints the ground "underpainting" onto canvases from baked vectors: land cover wash, sand, areas,
// roads with sidewalks, curbs and markings, and soft contact shadows around buildings.
// Three canvases: whole backdrop (coarse), whole slice (medium), and a near-field detail window that
// repaints around the walker so paint at your feet is ~15 cm/px.
import * as THREE from 'three';
import type { World, TerrainLayer, Road, Area, WorldJson } from './data';
import { activeStyle } from './styles';
import { lotLayout, type LotLayout } from './lots';

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
const ROAD_RANK: Record<string, number> = {
  path: 0, footway: 0, cycleway: 0, steps: 0, bridleway: 0, track: 0, service: 1, pedestrian: 1, living_street: 2,
  unclassified: 2, residential: 2, construction: 2, tertiary_link: 3, tertiary: 3, secondary_link: 3, secondary: 4,
  primary_link: 4, primary: 5, trunk: 5, motorway: 6,
};
const MINOR = new Set(['path', 'footway', 'cycleway', 'steps', 'bridleway', 'track']);

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

class Painter {
  areas: Prepared<Area>[];
  roads: Prepared<Road>[];
  foot: Prepared<number>[];
  walks: Prepared<number>[];
  // Streamed tiles (real-lite / synth — everything past the bake) paint too: their roads and
  // footprints join while mounted, so sidewalks, curbs, markings, walks and contact shadows
  // continue wherever the world does.
  private tiles = new Map<string, { roads: Prepared<Road>[]; foot: Prepared<number>[]; front: Prepared<number>[]; areas: Prepared<Area>[]; box: [number, number, number, number] }>();
  // `fronts` flags the storefronts (shops, apartments over shops): their ground is paved.
  setTile(id: string, roads: Road[], rings: [number, number][][], box: [number, number, number, number], fronts: boolean[] = [], areas: Area[] = []) {
    const foot = rings.map((r, i) => prep(i, [r.flatMap(([x, z]) => [x * 10, z * 10])]));
    this.tiles.set(id, {
      roads: roads.filter((r) => !r.br).map((r) => prep(r, [r.p])),
      foot,
      front: foot.filter((_, i) => fronts[i]),
      areas: areas.filter((a) => AREA_FILL[a.c]).map((a) => prep(a, [...a.o, ...a.i])),
      box,
    });
  }
  private areasIn(x0: number, z0: number, x1: number, z1: number): Prepared<Area>[] {
    if (!this.tiles.size) return this.areas;
    const extra: Prepared<Area>[] = [];
    for (const t of this.tiles.values()) if (t.box[2] > x0 - 50 && t.box[0] < x1 + 50 && t.box[3] > z0 - 50 && t.box[1] < z1 + 50) extra.push(...t.areas);
    if (!extra.length) return this.areas;
    return [...this.areas, ...extra].sort((a, b) => AREA_ORDER.indexOf(a.item.c) - AREA_ORDER.indexOf(b.item.c));
  }
  dropTile(id: string) { this.tiles.delete(id); }
  private roadsIn(x0: number, z0: number, x1: number, z1: number): Prepared<Road>[] {
    if (!this.tiles.size) return this.roads;
    const extra: Prepared<Road>[] = [];
    for (const t of this.tiles.values()) if (t.box[2] > x0 - 50 && t.box[0] < x1 + 50 && t.box[3] > z0 - 50 && t.box[1] < z1 + 50) extra.push(...t.roads);
    if (!extra.length) return this.roads;
    return [...this.roads, ...extra].sort((a, b) => (ROAD_RANK[a.item.c] ?? 1) - (ROAD_RANK[b.item.c] ?? 1));
  }
  private frontIn(x0: number, z0: number, x1: number, z1: number): Prepared<number>[] {
    const out: Prepared<number>[] = [];
    for (const t of this.tiles.values()) if (t.box[2] > x0 - 50 && t.box[0] < x1 + 50 && t.box[3] > z0 - 50 && t.box[1] < z1 + 50) out.push(...t.front);
    return out;
  }
  private footIn(x0: number, z0: number, x1: number, z1: number): Prepared<number>[] {
    if (!this.tiles.size) return this.foot;
    const out = [...this.foot];
    for (const t of this.tiles.values()) if (t.box[2] > x0 - 50 && t.box[0] < x1 + 50 && t.box[3] > z0 - 50 && t.box[1] < z1 + 50) out.push(...t.foot);
    return out;
  }
  private bakedRoads = new Set<Prepared<Road>>();
  constructor(json: WorldJson, walks: number[] = []) {
    this.areas = json.areas.filter((a) => AREA_FILL[a.c]).sort((a, b) => AREA_ORDER.indexOf(a.c) - AREA_ORDER.indexOf(b.c)).map((a) => prep(a, [...a.o, ...a.i]));
    this.roads = json.roads.filter((r) => !r.br).sort((a, b) => (ROAD_RANK[a.c] ?? 1) - (ROAD_RANK[b.c] ?? 1)).map((r) => prep(r, [r.p]));
    this.bakedRoads = new Set(this.roads);
    this.foot = json.buildings.filter((b) => !b.lod).map((b, i) => prep(i, [b.r]));
    this.walks = [];
    this.addWalks(walks);
  }
  // Front-walk paint arrives per tile as the stream loads them.
  addWalks(walks: number[]) {
    for (let i = 0; i + 4 < walks.length; i += 5) this.walks.push(prep(walks[i + 4], [[walks[i], walks[i + 1], walks[i + 2], walks[i + 3]].map((v) => v * 10)]));
  }

  paint(ctx: CanvasRenderingContext2D, x0: number, z0: number, x1: number, z1: number, pxPerM: number, level: 0 | 1 | 2) {
    const detail = level >= 1;
    // Dense blocks are paved: where footprints cover over 45 % of a 40 m cell (a city block, not a
    // suburb) — or a third of the 120 m around it, so the strips between a city's buildings and its
    // kerbs pave too — the ground is concrete and flagstone, not lawn; the grass field
    // (grassMask) then stays off it. Painted under the areas: a park in the city stays a park.
    if (detail) {
      const C = 40, cov = new Map<string, number>();
      for (const f of this.footIn(x0, z0, x1, z1)) {
        if (!overlaps(f, x0, z0, x1, z1, 100)) continue;
        const r = f.pts[0];
        let a = 0, cx = 0, cz = 0;
        for (let i = 0, j = r.length - 1; i < r.length; j = i++) (a += (r[j][0] - r[i][0]) * (r[j][1] + r[i][1])), (cx += r[i][0]), (cz += r[i][1]);
        const k = `${Math.floor(cx / r.length / C)},${Math.floor(cz / r.length / C)}`;
        cov.set(k, (cov.get(k) ?? 0) + Math.abs(a / 2));
      }
      ctx.fillStyle = '#b1ab9d';
      for (let i = Math.floor(x0 / C) - 1; i <= Math.floor(x1 / C) + 1; i++)
        for (let j = Math.floor(z0 / C) - 1; j <= Math.floor(z1 / C) + 1; j++) {
          const own = cov.get(`${i},${j}`) ?? 0;
          let n = 0;
          for (let di = -1; di <= 1; di++) for (let dj = -1; dj <= 1; dj++) n += cov.get(`${i + di},${j + dj}`) ?? 0;
          if (own < C * C * 0.45 && n < 9 * C * C * 0.33) continue;
          ctx.fillRect(i * C - 6, j * C - 6, C + 12, C + 12);
        }
    }
    // Areas
    const areas = this.areasIn(x0, z0, x1, z1);
    for (const a of areas) {
      if ((a.item.lod && level > 0) || !overlaps(a, x0, z0, x1, z1)) continue;
      ctx.beginPath();
      for (const r of a.pts) pathOf(ctx, r, true);
      ctx.fillStyle = AREA_FILL[a.item.c];
      ctx.globalAlpha = a.item.c === 'wood' ? 0.75 : 0.92;
      ctx.fill('evenodd');
      if (a.item.c === 'pool' || a.item.c === 'pitch') {
        ctx.globalAlpha = 0.9;
        ctx.strokeStyle = '#f2efe6';
        ctx.lineWidth = a.item.c === 'pool' ? 0.8 : 0.25;
        ctx.stroke();
      }
    }
    ctx.globalAlpha = 1;
    // Parking lots: the stall lines (lots.ts — the same layout props.ts parks the cars in)
    if (level === 2) {
      ctx.strokeStyle = '#e9e6dc';
      ctx.lineWidth = 0.12;
      ctx.lineCap = 'butt';
      ctx.globalAlpha = 0.85;
      for (const a of areas) {
        if (a.item.c !== 'parking' || !overlaps(a, x0, z0, x1, z1, 5)) continue;
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
        if (!overlaps(f, x0, z0, x1, z1, 10)) continue;
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
        if (!overlaps(f, x0, z0, x1, z1, 5)) continue;
        ctx.beginPath();
        pathOf(ctx, f.pts[0], true);
        ctx.fill();
        ctx.stroke();
      }
    }
    const list = this.roadsIn(x0, z0, x1, z1).filter((r) => (level > 0 ? !r.item.lod : true) && (detail || !MINOR.has(r.item.c)) && overlaps(r, x0, z0, x1, z1));
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';
    // Front walks from each door to the street (flagstone-pale, under everything else).
    if (detail) {
      ctx.strokeStyle = '#bdb5a3';
      for (const w of this.walks) {
        if (!overlaps(w, x0, z0, x1, z1, 5)) continue;
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
      // desert sun bleaches asphalt to a warm pale grey
      // bike lanes are asphalt, painted by habit (green in North America, red-brown in Europe);
      // a pale path colour read as a sidewalk down the middle of the avenue
      const base = r.c === 'cycleway' ? (region === 'na' ? '#687a62' : region === 'eu' ? '#8a5e52' : '#6a6c6e') : r.sw ? '#b8b2a4' : minor ? '#bdb5a3' : arid ? (rank >= 5 ? '#6f6b64' : rank >= 2 ? '#78736b' : '#817b72') : rank >= 5 ? '#55575b' : rank >= 2 ? '#606265' : '#6f6d68';
      ctx.beginPath();
      pathOf(ctx, pts[0]);
      ctx.strokeStyle = base;
      ctx.lineWidth = Math.max(r.w, minW);
      ctx.stroke();
      if (!minor && detail) {
        ctx.globalAlpha = 0.3;
        ctx.strokeStyle = arid ? '#8a857c' : rank >= 5 ? '#6a6c70' : '#76787b';
        ctx.lineWidth = r.w * 0.72;
        ctx.stroke();
        ctx.globalAlpha = 1;
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
    if (level === 2) this.crosswalks(ctx, list);
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

  private crosswalks(ctx: CanvasRenderingContext2D, list: Prepared<Road>[]) {
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
  addWalks: (walks: number[]) => void;
  setTile: (id: string, roads: Road[], rings: [number, number][][], box: [number, number, number, number], fronts?: boolean[], areas?: Area[]) => void;
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

// A ground window that re-centres on the walker: `detail` (300 m, ~15 cm/px, curbs and
// double centre lines) and `mid` (1.6 km, ~0.8 m/px: sidewalks, walks, markings) — both
// paint the baked features AND the mounted streamed tiles, over the land-cover wash where
// the bake has one and a lawn wash past it.
export class DetailGround {
  readonly canvas = document.createElement('canvas');
  readonly texture: THREE.CanvasTexture;
  readonly box = new THREE.Vector4(0, 0, 1, 1);
  private cx = Infinity;
  private cz = Infinity;
  private dirty = false;
  constructor(private painter: Painter, private covers: { img: HTMLCanvasElement; L: TerrainLayer }[], res: number, readonly size = 300, private level: 1 | 2 = 2, private blur = 6) {
    this.canvas.width = this.canvas.height = res;
    this.texture = makeTex(this.canvas);
  }
  /** A tile inside the window changed — repaint on the next update. */
  touch(b: [number, number, number, number]) {
    const h = this.size / 2;
    if (b[2] > this.cx - h && b[0] < this.cx + h && b[3] > this.cz - h && b[1] < this.cz + h) this.dirty = true;
  }
  update(x: number, z: number, force = false) {
    if (!force && !this.dirty && Math.hypot(x - this.cx, z - this.cz) < this.size * 0.22) return false;
    this.dirty = false;
    const s = this.size, res = this.canvas.width;
    const snap = s > 1000 ? 50 : 10;
    this.cx = Math.round(x / snap) * snap;
    this.cz = Math.round(z / snap) * snap;
    const x0 = this.cx - s / 2, z0 = this.cz - s / 2;
    const ctx = this.canvas.getContext('2d')!;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.filter = `blur(${this.blur}px)`;
    ctx.fillStyle = COVER[50]; // past the bake: town lawn (streamed tiles paint their paving on top)
    ctx.fillRect(0, 0, res, res);
    ctx.imageSmoothingEnabled = true;
    for (const { img, L } of this.covers) {
      const g = L.g;
      // destination rect of the layer's grid inside this window
      const k = res / s;
      const dx = (g.x0 - x0) * k, dz = (g.z0 - z0) * k, dw = g.w * g.cell * k, dh = g.h * g.cell * k;
      if (dx > res || dz > res || dx + dw < 0 || dz + dh < 0) continue;
      ctx.drawImage(img, dx, dz, dw, dh);
    }
    ctx.filter = 'none';
    const k = res / s;
    ctx.setTransform(k, 0, 0, k, -x0 * k, -z0 * k);
    this.painter.paint(ctx, x0, z0, x0 + s, z0 + s, k, this.level);
    this.texture.needsUpdate = true;
    this.box.set(x0, z0, 1 / s, 1 / s);
    return true;
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
    addWalks: (w: number[]) => painter.addWalks(w),
    setTile: (id, roads, rings, box, fronts, areas) => { painter.setTile(id, roads, rings, box, fronts, areas); detail.touch(box); mid.touch(box); },
    dropTile: (id) => painter.dropTile(id),
  };
}
