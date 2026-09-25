// Paints the ground "underpainting" onto canvases from baked vectors: land cover wash, sand, areas,
// roads with sidewalks, curbs and markings, and soft contact shadows around buildings.
// Three canvases: whole backdrop (coarse), whole slice (medium), and a near-field detail window that
// repaints around the walker so paint at your feet is ~15 cm/px.
import * as THREE from 'three';
import type { World, TerrainLayer, Road, Area, WorldJson } from './data';

// ESA WorldCover class -> ground wash (sRGB). Water cells = sea/river bed.
const COVER: Record<number, string> = {
  10: '#76834f', 20: '#8b9a5c', 30: '#9fb06c', 40: '#b3b070', 50: '#aeae8e', 60: '#e4d4ab', 70: '#f0f0f0',
  80: '#8c8768', 90: '#8e9562', 95: '#708055', 100: '#a8a882', 0: '#aeb08e',
};
const AREA_FILL: Record<string, string> = {
  beach: '#e9d9b1', wood: '#617043', scrub: '#8a955c', wetland: '#8c9761', grass: '#9fb56d', pitch: '#8db35f',
  golf: '#9fc373', parking: '#a3a09a', plaza: '#d3cbbb', pool: '#63c2cf', marina: '#aaa698', commercial: '#bcb7a8',
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
  constructor(json: WorldJson, walks: number[] = []) {
    this.areas = json.areas.filter((a) => AREA_FILL[a.c]).sort((a, b) => AREA_ORDER.indexOf(a.c) - AREA_ORDER.indexOf(b.c)).map((a) => prep(a, [...a.o, ...a.i]));
    this.roads = json.roads.filter((r) => !r.br).sort((a, b) => (ROAD_RANK[a.c] ?? 1) - (ROAD_RANK[b.c] ?? 1)).map((r) => prep(r, [r.p]));
    this.foot = json.buildings.filter((b) => !b.lod).map((b, i) => prep(i, [b.r]));
    this.walks = [];
    for (let i = 0; i + 4 < walks.length; i += 5) this.walks.push(prep(walks[i + 4], [[walks[i], walks[i + 1], walks[i + 2], walks[i + 3]].map((v) => v * 10)]));
  }

  paint(ctx: CanvasRenderingContext2D, x0: number, z0: number, x1: number, z1: number, pxPerM: number, level: 0 | 1 | 2) {
    const detail = level >= 1;
    // Areas
    for (const a of this.areas) {
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
    // Contact shadows / foundations under buildings (grounds the houses in the wash).
    if (detail) {
      ctx.strokeStyle = 'rgba(70,64,56,0.32)';
      ctx.fillStyle = 'rgba(90,84,72,0.5)';
      ctx.lineWidth = level === 2 ? 1.1 : 1.6;
      ctx.lineJoin = 'round';
      for (const f of this.foot) {
        if (!overlaps(f, x0, z0, x1, z1, 5)) continue;
        ctx.beginPath();
        pathOf(ctx, f.pts[0], true);
        ctx.fill();
        ctx.stroke();
      }
    }
    const list = this.roads.filter((r) => (level > 0 ? !r.item.lod : true) && (detail || !MINOR.has(r.item.c)) && overlaps(r, x0, z0, x1, z1));
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';
    // Front walks from each door to the street (flagstone-pale, under everything else).
    if (detail) {
      ctx.strokeStyle = '#d9d2c2';
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
        ctx.strokeStyle = rank >= 5 ? '#d8d2c5' : '#cdc7b6';
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
    for (const { item: r, pts } of list) {
      const rank = ROAD_RANK[r.c] ?? 1;
      const minor = MINOR.has(r.c);
      const base = r.sw ? '#d2ccbf' : minor ? '#d6cdb9' : rank >= 5 ? '#6c6e73' : rank >= 2 ? '#7b7c7f' : '#8e8c86';
      ctx.beginPath();
      pathOf(ctx, pts[0]);
      ctx.strokeStyle = base;
      ctx.lineWidth = Math.max(r.w, minW);
      ctx.stroke();
      if (!minor && detail) {
        ctx.globalAlpha = 0.3;
        ctx.strokeStyle = rank >= 5 ? '#85878b' : '#939496';
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
    ctx.lineCap = 'round';
  }
}

export interface GroundPaint {
  slice: THREE.CanvasTexture;
  backdrop: THREE.CanvasTexture;
  sliceCanvas: HTMLCanvasElement;
  detail: DetailGround;
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

// Near-field ground window that re-centres on the walker.
export class DetailGround {
  readonly size = 300;
  readonly canvas = document.createElement('canvas');
  readonly texture: THREE.CanvasTexture;
  readonly box = new THREE.Vector4(0, 0, 1, 1);
  private cx = Infinity;
  private cz = Infinity;
  constructor(private painter: Painter, private cover: HTMLCanvasElement, private L: TerrainLayer, res: number) {
    this.canvas.width = this.canvas.height = res;
    this.texture = makeTex(this.canvas);
  }
  update(x: number, z: number, force = false) {
    if (!force && Math.hypot(x - this.cx, z - this.cz) < this.size * 0.22) return false;
    const s = this.size, res = this.canvas.width;
    this.cx = Math.round(x / 10) * 10;
    this.cz = Math.round(z / 10) * 10;
    const x0 = this.cx - s / 2, z0 = this.cz - s / 2;
    const ctx = this.canvas.getContext('2d')!;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    const g = this.L.g;
    const sx = (x0 - g.x0) / g.cell, sz = (z0 - g.z0) / g.cell, sw = s / g.cell;
    ctx.filter = 'blur(6px)';
    ctx.fillStyle = '#aeb08e';
    ctx.fillRect(0, 0, res, res);
    ctx.imageSmoothingEnabled = true;
    ctx.drawImage(this.cover, sx, sz, sw, sw, 0, 0, res, res);
    ctx.filter = 'none';
    const k = res / s;
    ctx.setTransform(k, 0, 0, k, -x0 * k, -z0 * k);
    this.painter.paint(ctx, x0, z0, x0 + s, z0 + s, k, 2);
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

  const bw = Math.min(2048, maxTex), bh = Math.min(4096, maxTex);
  const bc = document.createElement('canvas');
  bc.width = bw;
  bc.height = bh;
  const bx = bw / (B.x1 - B.x0), bz = bh / (B.z1 - B.z0);
  const bctx = bc.getContext('2d')!;
  bctx.imageSmoothingEnabled = true;
  bctx.filter = 'blur(1.5px)';
  bctx.drawImage(coverImage(terrain.backdrop), 0, 0, bw, bh);
  bctx.filter = 'none';
  bctx.setTransform(bx, 0, 0, bz, -B.x0 * bx, -B.z0 * bz);
  painter.paint(bctx, B.x0, B.z0, B.x1, B.z1, bx, 0);

  const detail = new DetailGround(painter, sliceCover, terrain.slice, Math.min(2048, maxTex));
  return { slice: makeTex(sc), backdrop: makeTex(bc), sliceCanvas: sc, detail };
}
