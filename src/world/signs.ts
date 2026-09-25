// Lettering from the map: street-name blades on poles where differently named streets meet, shop names
// over storefronts, house numbers beside front doors. All text is drawn once into a canvas atlas.
import * as THREE from 'three';
import type { World } from './data';
import type { SignSpec } from './buildings';
import type { WalkWorld } from '../player/collision';
import { paintMaterial } from '../render/shared';
import { makeCanvas, type AnyCanvas } from './canvas';

const RANK: Record<string, number> = { primary: 5, trunk: 5, secondary: 4, tertiary: 3, residential: 2, unclassified: 2, living_street: 2 };
const SUFFIX: Record<string, string> = { Avenue: 'Ave', Street: 'St', Road: 'Rd', Boulevard: 'Blvd', Drive: 'Dr', Place: 'Pl', Lane: 'Ln', Court: 'Ct', Terrace: 'Ter', Parkway: 'Pkwy', Highway: 'Hwy', Circle: 'Cir', Way: 'Way' };
export const signName = (n: string) => n.replace(/\b(North|South|East|West)\b/g, (m) => m[0]).replace(/\b(\w+)$/, (w) => SUFFIX[w] ?? w);

type Font = 'street' | 'shop' | 'number';
const FONTS: Record<Font, string> = {
  street: '600 44px "Helvetica Neue", Arial, sans-serif',
  shop: 'italic 600 44px Georgia, "Times New Roman", serif',
  number: '700 42px Georgia, serif',
};

class Atlas {
  readonly canvas: AnyCanvas;
  private ctx: OffscreenCanvasRenderingContext2D | CanvasRenderingContext2D;
  private x = 8;
  private y = 0;
  private map = new Map<string, { u0: number; v0: number; u1: number; v1: number; aspect: number }>();
  constructor(readonly W = 2048, readonly H = 2048, readonly row = 64) {
    this.canvas = makeCanvas(W, H);
    this.ctx = this.canvas.getContext('2d')! as OffscreenCanvasRenderingContext2D;
    this.ctx.textBaseline = 'middle';
  }
  get(text: string, font: Font) {
    const k = font + '|' + text;
    const hit = this.map.get(k);
    if (hit) return hit;
    const c = this.ctx;
    c.font = FONTS[font];
    const w = Math.min(this.W - 16, Math.ceil(c.measureText(text).width) + 24);
    if (this.x + w > this.W) (this.x = 8), (this.y += this.row);
    if (this.y + this.row > this.H) return null;
    c.fillStyle = '#fff';
    c.fillText(text, this.x + 12, this.y + this.row / 2 + 2, w - 24);
    const e = { u0: this.x / this.W, v0: this.y / this.H, u1: (this.x + w) / this.W, v1: (this.y + this.row) / this.H, aspect: w / this.row };
    this.x += w + 8;
    this.map.set(k, e);
    return e;
  }
}

class SignMesher {
  pos: number[] = []; nrm: number[] = []; uv: number[] = []; col: number[] = []; txt: number[] = [];
  private c = new THREE.Color();
  private t = new THREE.Color();
  colors(board: number, text: number) { this.c.set(board); this.t.set(text); }
  // quad with corners a,b (bottom) and height h, facing n; uv rect (u0,v0)-(u1,v1) or none
  quad(ax: number, ay: number, az: number, bx: number, by: number, bz: number, h: number, n: THREE.Vector3, uv?: { u0: number; v0: number; u1: number; v1: number }) {
    const P = [[ax, ay, az], [bx, by, bz], [bx, by + h, bz], [ax, ay + h, az]];
    const T = uv ? [[uv.u0, uv.v1], [uv.u1, uv.v1], [uv.u1, uv.v0], [uv.u0, uv.v0]] : [[-1, -1], [-1, -1], [-1, -1], [-1, -1]];
    const cr = new THREE.Vector3(bx - ax, by - ay, bz - az).cross(new THREE.Vector3(0, h, 0));
    const order = cr.dot(n) >= 0 ? [0, 1, 2, 0, 2, 3] : [0, 2, 1, 0, 3, 2];
    for (const i of order) {
      this.pos.push(...P[i]); this.nrm.push(n.x, n.y, n.z); this.uv.push(...T[i]);
      this.col.push(this.c.r, this.c.g, this.c.b); this.txt.push(this.t.r, this.t.g, this.t.b);
    }
  }
  box(cx: number, cz: number, y0: number, y1: number, hx: number, hz: number, ang = 0) {
    const c = Math.cos(ang), s = Math.sin(ang);
    const P = (u: number, v: number): [number, number] => [cx + u * c - v * s, cz + u * s + v * c];
    const corners = [P(-hx, -hz), P(hx, -hz), P(hx, hz), P(-hx, hz)];
    for (let i = 0; i < 4; i++) {
      const a = corners[i], b = corners[(i + 1) % 4];
      const n = new THREE.Vector3(b[1] - a[1], 0, -(b[0] - a[0])).normalize();
      const mid = [(a[0] + b[0]) / 2 - cx, (a[1] + b[1]) / 2 - cz];
      if (n.x * mid[0] + n.z * mid[1] < 0) n.negate();
      this.quad(a[0], y0, a[1], b[0], y0, b[1], y1 - y0, n);
    }
  }
  geometry() {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(this.nrm, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(this.uv, 2));
    g.setAttribute('color', new THREE.Float32BufferAttribute(this.col, 3));
    g.setAttribute('aText', new THREE.Float32BufferAttribute(this.txt, 3));
    g.computeBoundingSphere();
    return g;
  }
}

export function buildSigns(world: World, specs: SignSpec[], walk: WalkWorld) {
  const { json, terrain } = world;
  const S = json.slice;
  const atlas = new Atlas();
  const m = new SignMesher();

  // Text on a two-faced blade/board: each face reads left-to-right from its own side.
  const lettered = (cx: number, cy: number, cz: number, tx: number, tz: number, w: number, h: number, e: { u0: number; v0: number; u1: number; v1: number }, twoFaced: boolean, off = 0.012) => {
    for (const sd of twoFaced ? [1, -1] : [1]) {
      const n = new THREE.Vector3(tz * sd, 0, -tx * sd); // face normal
      const rx = n.z, rz = -n.x; // reading direction for a viewer facing this face
      const ox = cx + n.x * off, oz = cz + n.z * off;
      m.quad(ox - rx * w / 2, cy - h / 2, oz - rz * w / 2, ox + rx * w / 2, cy - h / 2, oz + rz * w / 2, h, n, e);
    }
  };

  // ---------- street-name signs at intersections ----------
  const nodes = new Map<string, { x: number; z: number; ways: { name: string; dx: number; dz: number; w: number }[] }>();
  for (const r of json.roads) {
    if (r.lod || r.br || !r.n || !(r.c in RANK)) continue;
    for (let i = 0; i + 1 < r.p.length; i += 2) {
      const x = r.p[i] / 10, z = r.p[i + 1] / 10;
      if (x < S.x0 + 40 || x > S.x1 - 40 || z < S.z0 + 40 || z > S.z1 - 40) continue;
      const j = i + 2 < r.p.length ? i + 2 : i - 2;
      if (j < 0) continue;
      let dx = r.p[j] / 10 - x, dz = r.p[j + 1] / 10 - z;
      const l = Math.hypot(dx, dz) || 1;
      dx /= l; dz /= l;
      const k = `${Math.round(x * 2)},${Math.round(z * 2)}`;
      let nd = nodes.get(k);
      if (!nd) nodes.set(k, (nd = { x, z, ways: [] }));
      nd.ways.push({ name: r.n, dx, dz, w: r.w });
    }
  }
  const placed: [number, number][] = [];
  const poles: { x: number; z: number; cx: number; cz: number }[] = [];
  const poleCol = 0x6f7478, green = 0x1e6b43;
  for (const nd of nodes.values()) {
    const names = [...new Set(nd.ways.map((w) => w.name))];
    if (names.length < 2) continue;
    if (placed.some(([x, z]) => Math.hypot(x - nd.x, z - nd.z) < 25)) continue;
    const A = nd.ways.find((w) => w.name === names[0])!, B = nd.ways.find((w) => w.name === names[1])!;
    const off = Math.max(A.w, B.w) / 2 + 1.7;
    let pos: [number, number] | null = null;
    for (const [sa, sb] of [[1, 1], [1, -1], [-1, 1], [-1, -1]]) {
      const dx = A.dx * sa + B.dx * sb, dz = A.dz * sa + B.dz * sb, l = Math.hypot(dx, dz);
      if (l < 0.3) continue;
      const x = nd.x + (dx / l) * off * 1.1, z = nd.z + (dz / l) * off * 1.1;
      if (walk.blocked(x, z, 0.6) || terrain.sdfAt(x, z) < 1) continue;
      pos = [x, z];
      break;
    }
    if (!pos) continue;
    placed.push([nd.x, nd.z]);
    poles.push({ x: pos[0], z: pos[1], cx: nd.x, cz: nd.z });
    const g = terrain.heightAt(pos[0], pos[1]);
    m.colors(poleCol, poleCol);
    m.box(pos[0], pos[1], g, g + 3.05, 0.035, 0.035);
    [A, B].forEach((way, i) => {
      const e = atlas.get(signName(way.name), 'street');
      if (!e) return;
      const h = 0.2, w = Math.min(1.6, Math.max(0.75, h * e.aspect * 0.95));
      const y = g + 2.6 + i * 0.24;
      m.colors(green, 0xf6f6f0);
      // the blade runs along its street, centred over the pole
      lettered(pos![0], y, pos![1], way.dx, way.dz, w, h, e, true, 0.012);
      m.colors(green, green);
      m.box(pos![0], pos![1], y - h / 2, y + h / 2, w / 2, 0.01, Math.atan2(way.dz, way.dx));
    });
    walk.addLoop([[pos[0] - 0.08, pos[1] - 0.08], [pos[0] + 0.08, pos[1] - 0.08], [pos[0] + 0.08, pos[1] + 0.08], [pos[0] - 0.08, pos[1] + 0.08]]);
  }

  // ---------- shop names + house numbers ----------
  for (const s of specs) {
    const light = [0xf1ead8, 0xf6f1de].includes(s.color);
    if (s.style === 'shop') {
      const e = atlas.get(s.text, 'shop');
      if (!e) continue;
      const h = s.h, w = Math.min(s.w, Math.max(1.2, h * e.aspect * 0.8));
      m.colors(s.color, s.color);
      m.box(s.x + s.nx * 0.03, s.z + s.nz * 0.03, s.y - h / 2 - 0.04, s.y + h / 2 + 0.04, w / 2 + 0.05, 0.035, Math.atan2(s.tz, s.tx));
      m.colors(s.color, light ? 0x2e2a2a : 0xf4ecd4);
      lettered(s.x + s.nx * 0.03, s.y, s.z + s.nz * 0.03, s.tx, s.tz, w, h * 0.92, e, false, 0.04);
    } else {
      const e = atlas.get(s.text, 'number');
      if (!e) continue;
      const h = s.h, w = Math.max(s.w, h * e.aspect * 0.85);
      m.colors(0xf1ede2, 0x2e2a2a);
      lettered(s.x, s.y, s.z, s.tx, s.tz, w, h, e, false, 0.01);
    }
  }

  const mat = signMaterial(signTexture(atlas.canvas));
  const mesh = new THREE.Mesh(m.geometry(), mat);
  mesh.layers.enable(1);
  mesh.name = 'signs';
  return { mesh, poles, atlas: atlas.canvas };
}

// The atlas texture + painted material for the sign mesh — shared between the in-page build and
// the tile worker's packed result (which ships the atlas as an ImageBitmap).
export function signTexture(image: AnyCanvas | ImageBitmap) {
  const tex = new THREE.CanvasTexture(image as unknown as HTMLCanvasElement);
  tex.colorSpace = THREE.NoColorSpace;
  tex.flipY = false; // atlas rows are addressed top-down, like the canvas
  tex.generateMipmaps = true;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.anisotropy = 4;
  return tex;
}

export function signMaterial(tex: THREE.Texture) {
  return paintMaterial({
    uniforms: { uAtlas: { value: tex } },
    vertex: /* glsl */ `
      attribute vec3 color;
      attribute vec3 aText;
      varying vec3 vColor;
      varying vec3 vText;
      varying vec2 vUv;
      void main() {
        vec4 wp = worldMat() * vec4(position, 1.0);
        vWorldPos = wp.xyz + uWorldOffset;
        vNormalW = normalize(mat3(worldMat()) * normal);
        vColor = color; vText = aText; vUv = uv;
        gl_Position = projectionMatrix * viewMatrix * wp;
      }`,
    fragment: /* glsl */ `
      uniform sampler2D uAtlas;
      varying vec3 vColor;
      varying vec3 vText;
      varying vec2 vUv;
      void main() {
        vec3 N = normalize(vNormalW);
        float a = vUv.x < 0.0 ? 0.0 : texture2D(uAtlas, vUv).a;
        vec3 alb = mix(vColor, vText, a);
        alb = pigment(alb, vWorldPos);
        float sh = shadowAt(vWorldPos, N);
        vec3 col = paintLight(alb, N, vWorldPos, sh, 1.0);
        col += alb * uNight * 0.18; // a little spill from the street and the porch lights
        gl_FragColor = vec4(applyFog(col, vWorldPos), 1.0);
      }`,
  });
}
