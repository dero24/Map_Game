// The van's nav screen (on the dash: camper.ts `frame.screen`; van.ts lays it on the glass): a little
// live map, heading-up, the van low in the middle — the streets round it inked on paper, the water
// washed blue, what you've seen of the town washed in colour (the explore record, as the atlas's map),
// the route the van is driving, and along the bottom how far it has to go (by hand: how fast you're
// going; parked: where to?), the street you're on along the top. A canvas (the screen's texture),
// drawn a dozen times a second while you're at the wheel and now and then otherwise. M at the wheel
// leans you in to it, and the atlas opens on it to pick where to drive (van.ts `toggleScreen`).
import * as THREE from 'three';
import type { Road } from '../world/data';
import { paintMaterial } from '../render/shared';
import { drivable } from './drive';

/** What the screen draws from: the map's roads and buildings, the water, what you've painted. */
export interface DashSource {
  roads(): readonly Road[];
  footprints(): readonly { ring: [number, number][] }[];
  water(x: number, z: number): boolean;
  /** how painted (x, z) is, 0…255 (the explore record) */
  painted(x: number, z: number): number;
  /** the town you're in ('' if unknown) */
  place(): string;
}
/** Where the van is and what it's doing (van.ts `nav`). */
export interface DashNav {
  x: number; z: number; yaw: number; speed: number;
  /** a drive under way (or about to be): its path, how far along it (m), how far to go, the seconds left */
  route: { path: readonly { x: number; z: number }[]; at: number; left: number; eta: number } | null;
  /** driven by hand (the speed shown) */
  hand: boolean;
}

export const DASH_W = 512, DASH_H = 306;
const PAPER = '#efe6cf', INK = 'rgba(58,51,70,';
/** The washes (the water, the painted): a grid of CELL m cells, GRID across, round where it was gathered. */
const CELL = 8, GRID = 72, REACH = 340;

export class DashMap {
  readonly texture: THREE.Texture;
  private cv: HTMLCanvasElement | null = null;
  private g: CanvasRenderingContext2D | null = null;
  private wash: HTMLCanvasElement | null = null;
  private t = 1e9;
  private at = { x: Infinity, z: Infinity, age: 0 }; // (where the near things were gathered)
  private roads: Road[] = [];
  private fps: { ring: [number, number][] }[] = [];
  private boxes = new WeakMap<Road, [number, number, number, number]>();
  private street = '';
  private scale = 1.6; // px a metre

  constructor(private src: DashSource) {
    if (typeof document !== 'undefined') {
      this.cv = document.createElement('canvas');
      this.cv.width = DASH_W;
      this.cv.height = DASH_H;
      this.g = this.cv.getContext('2d');
      this.wash = document.createElement('canvas');
      this.wash.width = this.wash.height = GRID;
    }
    const tex = this.cv ? new THREE.CanvasTexture(this.cv) : new THREE.Texture();
    tex.colorSpace = THREE.NoColorSpace;
    tex.generateMipmaps = false;
    tex.minFilter = THREE.LinearFilter;
    this.texture = tex;
  }

  /** Draw it again if it's been 1/`rate` s (rate 0: leave it). */
  update(dt: number, nav: DashNav, rate: number) {
    this.t += dt;
    this.at.age += dt;
    if (!this.g || rate <= 0 || this.t < 1 / rate) return;
    this.t = 0;
    if (Math.hypot(nav.x - this.at.x, nav.z - this.at.z) > 90 || this.at.age > 2.5) this.gather(nav.x, nav.z);
    this.draw(nav);
    this.texture.needsUpdate = true;
  }

  /** The roads and buildings near (x, z), the street it's on, and the washes round it. */
  private gather(x: number, z: number) {
    Object.assign(this.at, { x, z, age: 0 });
    this.roads = [];
    let best = 22, name = '';
    for (const r of this.src.roads()) {
      if (r.lod || r.p.length < 4 || !drivable(r.c)) continue;
      let b = this.boxes.get(r);
      if (!b) {
        b = [Infinity, Infinity, -Infinity, -Infinity];
        for (let i = 0; i + 1 < r.p.length; i += 2) { const px = r.p[i] / 10, pz = r.p[i + 1] / 10; b[0] = Math.min(b[0], px); b[1] = Math.min(b[1], pz); b[2] = Math.max(b[2], px); b[3] = Math.max(b[3], pz); }
        this.boxes.set(r, b);
      }
      if (b[2] < x - REACH || b[0] > x + REACH || b[3] < z - REACH || b[1] > z + REACH) continue;
      this.roads.push(r);
      if (!r.n || b[2] < x - best || b[0] > x + best || b[3] < z - best || b[1] > z + best) continue;
      for (let i = 0; i + 3 < r.p.length; i += 2) {
        const ax = r.p[i] / 10, az = r.p[i + 1] / 10, dx = r.p[i + 2] / 10 - ax, dz = r.p[i + 3] / 10 - az, l2 = dx * dx + dz * dz || 1;
        const t = Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / l2)), d = Math.hypot(ax + dx * t - x, az + dz * t - z);
        if (d < best) { best = d; name = r.n; }
      }
    }
    this.street = name;
    this.fps = [];
    for (const f of this.src.footprints()) {
      const p = f.ring[0];
      if (p && Math.abs(p[0] - x) < REACH && Math.abs(p[1] - z) < REACH) this.fps.push(f);
    }
    // the washes: the water blue, what you've painted a pale green-ochre (the atlas's land wash)
    const wg = this.wash?.getContext('2d');
    if (!wg) return;
    const img = wg.createImageData(GRID, GRID), d = img.data;
    for (let j = 0; j < GRID; j++)
      for (let i = 0; i < GRID; i++) {
        const wx = x + (i + 0.5 - GRID / 2) * CELL, wz = z + (j + 0.5 - GRID / 2) * CELL, o = (j * GRID + i) * 4;
        if (this.src.water(wx, wz)) { d[o] = 132; d[o + 1] = 170; d[o + 2] = 196; d[o + 3] = 235; continue; }
        const v = this.src.painted(wx, wz);
        if (v > 0) { d[o] = 206; d[o + 1] = 214; d[o + 2] = 178; d[o + 3] = Math.round(v * 0.75); }
      }
    wg.putImageData(img, 0, 0);
  }

  private draw(nav: DashNav) {
    const g = this.g!, W = DASH_W, H = DASH_H;
    // closer in at a crawl, further out at speed
    const want = 1.9 - Math.min(1, nav.speed / 22) * 0.95;
    this.scale += (want - this.scale) * 0.15;
    const s = this.scale, ox = W / 2, oy = H * 0.7;
    g.save();
    g.fillStyle = PAPER;
    g.fillRect(0, 0, W, H);
    // the world, turned so the way ahead is up, the van at (ox, oy)
    g.translate(ox, oy);
    g.rotate(nav.yaw);
    g.scale(s, s);
    g.translate(-nav.x, -nav.z);
    if (this.wash) {
      g.imageSmoothingEnabled = true;
      g.drawImage(this.wash, this.at.x - (GRID * CELL) / 2, this.at.z - (GRID * CELL) / 2, GRID * CELL, GRID * CELL);
    }
    g.lineJoin = g.lineCap = 'round';
    g.fillStyle = 'rgba(207,156,131,0.5)';
    g.strokeStyle = `${INK}0.4)`;
    g.lineWidth = 1 / s;
    for (const f of this.fps) {
      g.beginPath();
      f.ring.forEach(([px, pz], i) => (i ? g.lineTo(px, pz) : g.moveTo(px, pz)));
      g.closePath();
      g.fill();
      g.stroke();
    }
    const trace = (r: Road) => {
      g.beginPath();
      for (let i = 0; i + 1 < r.p.length; i += 2) (i ? g.lineTo(r.p[i] / 10, r.p[i + 1] / 10) : g.moveTo(r.p[i] / 10, r.p[i + 1] / 10));
    };
    g.strokeStyle = `${INK}0.7)`;
    for (const r of this.roads) { g.lineWidth = Math.max(3 / s, r.w * 0.9 + 2.4 / s); trace(r); g.stroke(); }
    for (const r of this.roads) { g.strokeStyle = r.w >= 7 ? '#f2d891' : '#fbf6e8'; g.lineWidth = Math.max(1.4 / s, r.w * 0.9); trace(r); g.stroke(); }
    // the route: from the van on, to where it's going (a flag there)
    let flag: [number, number] | null = null;
    const R = nav.route;
    if (R && R.path.length > 1) {
      const i0 = Math.max(0, Math.min(R.path.length - 1, Math.floor(R.at))), i1 = Math.min(R.path.length, i0 + 1600);
      g.beginPath();
      g.moveTo(nav.x, nav.z);
      for (let i = i0 + 1; i < i1; i++) g.lineTo(R.path[i].x, R.path[i].z);
      g.strokeStyle = 'rgba(251,246,232,0.95)';
      g.lineWidth = 9 / s;
      g.stroke();
      g.strokeStyle = '#c4553f';
      g.lineWidth = 5 / s;
      g.stroke();
      const e = R.path[R.path.length - 1];
      flag = [e.x, e.z];
    }
    g.restore();
    // (screen space from here: the flag stands up whichever way the map has turned)
    if (flag) {
      const [fx, fz] = flag, dx = (fx - nav.x) * s, dz = (fz - nav.z) * s, c = Math.cos(nav.yaw), n = Math.sin(nav.yaw);
      const px = ox + dx * c - dz * n, py = oy + dx * n + dz * c;
      if (px > -10 && px < W + 10 && py > -10 && py < H + 10) {
        g.strokeStyle = '#3a3346';
        g.lineWidth = 2.5;
        g.beginPath(); g.moveTo(px, py); g.lineTo(px, py - 30); g.stroke();
        g.fillStyle = '#c4553f';
        g.beginPath(); g.moveTo(px, py - 30); g.lineTo(px + 20, py - 24); g.lineTo(px, py - 18); g.closePath(); g.fill();
      }
    }
    // the van: an arrow, the way ahead up
    g.save();
    g.translate(ox, oy);
    g.fillStyle = '#3a3346';
    g.strokeStyle = PAPER;
    g.lineWidth = 3;
    g.beginPath(); g.moveTo(0, -17); g.lineTo(12, 12); g.lineTo(0, 5); g.lineTo(-12, 12); g.closePath();
    g.stroke();
    g.fill();
    g.restore();
    // north, on a little dial in the corner
    g.save();
    g.translate(W - 30, 30);
    g.fillStyle = 'rgba(239,230,207,0.85)';
    g.beginPath(); g.arc(0, 0, 19, 0, Math.PI * 2); g.fill();
    g.rotate(nav.yaw);
    g.fillStyle = '#c4553f';
    g.beginPath(); g.moveTo(0, -15); g.lineTo(5, 0); g.lineTo(-5, 0); g.closePath(); g.fill();
    g.fillStyle = `${INK}0.75)`;
    g.font = 'italic 13px Georgia, serif';
    g.textAlign = 'center';
    g.fillText('N', 0, 13);
    g.restore();
    // the street along the top; how far, how fast or where to along the bottom
    const band = (y: number, h: number) => { g.fillStyle = 'rgba(46,42,58,0.82)'; g.fillRect(0, y, W, h); };
    band(0, 34);
    g.fillStyle = '#efe6cf';
    g.font = 'italic 21px Georgia, serif';
    g.textAlign = 'left';
    g.fillText(fit(g, this.street || this.src.place() || 'the open road', W - 80), 14, 24);
    band(H - 40, 40);
    g.textAlign = 'center';
    g.fillStyle = '#efe6cf';
    g.font = '23px Georgia, serif';
    g.fillText(R ? `${miles(R.left)} · ${Math.max(1, Math.round(R.eta / 60))} min` : nav.hand ? `${Math.round(nav.speed * 2.237)} mph` : 'where to?', W / 2, H - 13);
  }
}

/** A distance as a driver reads it here: feet close in, then miles. */
export function miles(m: number) {
  return m < 300 ? `${Math.max(50, Math.round((m * 3.281) / 50) * 50)} ft` : `${(m / 1609.34).toFixed(1)} mi`;
}
function fit(g: CanvasRenderingContext2D, s: string, w: number) {
  if (g.measureText(s).width <= w) return s;
  while (s.length > 3 && g.measureText(`${s}…`).width > w) s = s.slice(0, -1);
  return `${s}…`;
}

/** The screen's glass: the map, lit from behind — about the paper's brightness under the sky by day,
 *  a glow at night; always painted (alpha 0.75, as the van's own: render/post.ts). */
export function screenMaterial(tex: THREE.Texture) {
  return paintMaterial({
    uniforms: { tMap: { value: tex } },
    vertex: /* glsl */ `
      varying vec2 vUv;
      void main() {
        vec4 wp = worldMat() * vec4(position, 1.0);
        vWorldPos = wp.xyz + uWorldOffset;
        vNormalW = normalize(mat3(worldMat()) * normal);
        vUv = uv;
        gl_Position = projectionMatrix * viewMatrix * wp;
      }`,
    fragment: /* glsl */ `
      uniform sampler2D tMap;
      varying vec2 vUv;
      void main() {
        vec3 c = texture2D(tMap, vUv).rgb;
        c = c * c; // (the canvas is sRGB)
        gl_FragColor = vec4(applyFog(c * mix(1.1, 0.7, uNight), vWorldPos), 0.75);
      }`,
  });
}
