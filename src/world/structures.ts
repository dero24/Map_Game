// Built structures from OSM lines: road bridges (bridges.ts: decks on piers, a movable span's leaves,
// tender houses and fenders), piers and docks, seawalls and rock groynes. Registers walkable decks
// with the walk world.
import * as THREE from 'three';
import type { Line, Road, World } from './data';
import type { WalkWorld } from '../player/collision';
import { propMaterial, colored } from '../render/propMaterial';
import { makeRng } from '../core/rng';
import { rockLib, type RockType } from '../assets/kit';
import { buildBridges } from './bridges';
import { pierGround } from './docks';

type P = [number, number];
const unpackPts = (f: number[]): P[] => {
  const o: P[] = [];
  for (let i = 0; i + 1 < f.length; i += 2) o.push([f[i] / 10, f[i + 1] / 10]);
  return o;
};

class Mesher {
  pos: number[] = [];
  nrm: number[] = [];
  col: number[] = [];
  private c = new THREE.Color();
  color(hex: number) { this.c.set(hex); return this; }
  tri(a: THREE.Vector3, b: THREE.Vector3, c: THREE.Vector3, facing?: THREE.Vector3) {
    const n = new THREE.Vector3().subVectors(b, a).cross(new THREE.Vector3().subVectors(c, a)).normalize();
    if (facing && n.dot(facing) < 0) { [b, c] = [c, b]; n.negate(); }
    for (const p of [a, b, c]) { this.pos.push(p.x, p.y, p.z); this.nrm.push(n.x, n.y, n.z); this.col.push(this.c.r, this.c.g, this.c.b); }
  }
  quad(a: THREE.Vector3, b: THREE.Vector3, c: THREE.Vector3, d: THREE.Vector3, facing?: THREE.Vector3) { this.tri(a, b, c, facing); this.tri(a, c, d, facing); }
  // Extrude a ribbon between two polylines (left/right) from y arrays: top surface + outer sides.
  box(cx: number, cz: number, ang: number, l: number, w: number, y0: number, y1: number) {
    const c = Math.cos(ang), s = Math.sin(ang);
    const pt = (u: number, v: number, y: number) => new THREE.Vector3(cx + u * c - v * s, y, cz + u * s + v * c);
    const corners: P[] = [[-l / 2, -w / 2], [l / 2, -w / 2], [l / 2, w / 2], [-l / 2, w / 2]];
    for (let i = 0; i < 4; i++) {
      const [u0, v0] = corners[i], [u1, v1] = corners[(i + 1) % 4];
      const mid = pt((u0 + u1) / 2, (v0 + v1) / 2, 0).sub(new THREE.Vector3(cx, 0, cz));
      this.quad(pt(u0, v0, y0), pt(u1, v1, y0), pt(u1, v1, y1), pt(u0, v0, y1), mid);
    }
    const up = new THREE.Vector3(0, 1, 0);
    this.quad(pt(-l / 2, -w / 2, y1), pt(l / 2, -w / 2, y1), pt(l / 2, w / 2, y1), pt(-l / 2, w / 2, y1), up);
  }
  geometry() {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(this.nrm, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(this.col, 3));
    g.computeBoundingSphere();
    return g;
  }
}

// Resample a polyline at a fixed spacing; returns points, tangents and cumulative length.
function resample(p: P[], step: number) {
  const cum = [0];
  for (let i = 1; i < p.length; i++) cum.push(cum[i - 1] + Math.hypot(p[i][0] - p[i - 1][0], p[i][1] - p[i - 1][1]));
  const L = cum[cum.length - 1];
  const n = Math.max(1, Math.round(L / step));
  const out: { x: number; z: number; tx: number; tz: number; s: number }[] = [];
  let k = 0;
  for (let i = 0; i <= n; i++) {
    const s = (i / n) * L;
    while (k < p.length - 2 && cum[k + 1] < s) k++;
    const seg = cum[k + 1] - cum[k] || 1;
    const t = (s - cum[k]) / seg;
    const dx = p[k + 1][0] - p[k][0], dz = p[k + 1][1] - p[k][1];
    const l = Math.hypot(dx, dz) || 1;
    out.push({ x: p[k][0] + dx * t, z: p[k][1] + dz * t, tx: dx / l, tz: dz / l, s });
  }
  return { pts: out, L };
}

/** `ctx`: the tile's roads and lines with its margin's (own: 0) — a bridge whose spans other tiles
 *  own is profiled whole from them, so the pieces meet (bridges.ts). Without it, `world`'s own. */
export function buildStructures(world: World, walk: WalkWorld, ctx?: { roads: Road[]; lines: Line[] }) {
  const { terrain, json } = world;
  const group = new THREE.Group();
  group.name = 'structures';
  const m = new Mesher();
  const up = new THREE.Vector3(0, 1, 0);
  const V = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);
  const rng = makeRng(20260923);
  // Rocks: a few canonical kit variants per type, one InstancedMesh each (yaw + a little tilt,
  // so the flattened undersides still sit on what's beneath them).
  const ROCK_VARIANTS = 4;
  const stones = new Map<string, THREE.Matrix4[]>();
  const tilt = new THREE.Euler();
  const stone = (type: RockType, x: number, y: number, z: number, s: number, yaw: number, lean: number) => {
    const key = `${type}:${Math.floor(rng.float() * ROCK_VARIANTS)}`;
    if (!stones.has(key)) stones.set(key, []);
    const q = new THREE.Quaternion().setFromEuler(tilt.set(lean, yaw, lean * 0.6, 'YXZ'));
    stones.get(key)!.push(new THREE.Matrix4().compose(V(x, y, z), q, V(s, s * (0.8 + rng.float() * 0.3), s)));
  };

  // ---------- road bridges ----------
  // (every one the tile can see, its margin's too, drawn where it owns the ways)
  const bridges = buildBridges(m, walk, ctx?.roads ?? json.roads, ctx?.lines ?? json.lines, terrain);
  const towers = bridges.towers;

  // ---------- piers & docks ----------
  const DECK = 1.35;
  const posts: THREE.Matrix4[] = [];
  // (a pier the map didn't draw — a marina's finger pier, a house's dock: docks.ts — is built the
  // same; its boats are moored at their berths, not along it: `gen`)
  const pierSegs: { a: P; b: P; w: number; gen?: 'slip' | 'dock' }[] = [];
  for (const l of json.lines) {
    if (l.c !== 'pier') continue;
    const p = unpackPts(l.p);
    // (on fine ground only: the region's lattice, a tile's pack or a streamed cell's DEM)
    if (!p.some(([x, z]) => pierGround(terrain, x, z))) continue;
    const w = l.w ?? 2.2;
    const { pts } = resample(p, 1.5);
    const hy = (x: number, z: number) => Math.max(DECK, terrain.heightAt(x, z) + 0.35);
    for (let i = 0; i + 1 < pts.length; i++) {
      const a = pts[i], b = pts[i + 1];
      const nx = a.tz, nz = -a.tx;
      const ya = hy(a.x, a.z), yb = hy(b.x, b.z);
      const A = (o: number, y: number) => V(a.x + nx * o, y, a.z + nz * o);
      const B = (o: number, y: number) => V(b.x + nx * o, y, b.z + nz * o);
      m.color(i % 2 ? 0xa18a6b : 0x9a8264).quad(A(-w / 2, ya), B(-w / 2, yb), B(w / 2, yb), A(w / 2, ya), up);
      m.color(0x6f5f4c);
      m.quad(A(w / 2, ya - 0.3), B(w / 2, yb - 0.3), B(w / 2, yb), A(w / 2, ya), V(nx, 0, nz));
      m.quad(A(-w / 2, ya - 0.3), B(-w / 2, yb - 0.3), B(-w / 2, yb), A(-w / 2, ya), V(-nx, 0, -nz));
    }
    for (let s = 0; s < pts.length; s += 2) {
      const a = pts[s];
      for (const sv of [-1, 1]) {
        const x = a.x + a.tz * sv * (w / 2), z = a.z - a.tx * sv * (w / 2);
        const top = hy(a.x, a.z) + (s % 4 === 0 ? 0.9 : 0.05);
        posts.push(new THREE.Matrix4().compose(V(x, (top - 2.5) / 2, z), new THREE.Quaternion(), V(1, top + 2.5, 1)));
      }
    }
    for (let i = 0; i + 1 < p.length; i++) pierSegs.push({ a: p[i], b: p[i + 1], w, ...(l.gen ? { gen: l.gen } : {}) });
    const cum = [0];
    for (let i = 1; i < p.length; i++) cum.push(cum[i - 1] + Math.hypot(p[i][0] - p[i - 1][0], p[i][1] - p[i - 1][1]));
    walk.addDeck({ pts: p, cum, halfWidth: w / 2, heightAt: () => DECK, profile: { k: 'const', y: DECK } });
  }
  posts.push(...bridges.piles);
  if (posts.length) {
    const pg = colored(new THREE.CylinderGeometry(0.13, 0.15, 1, 6), 0x5c4e3f);
    const im = new THREE.InstancedMesh(pg, propMaterial(), posts.length);
    posts.forEach((mt, i) => im.setMatrixAt(i, mt));
    im.layers.enable(1);
    group.add(im);
  }
  if (bridges.posts.length) {
    const im = new THREE.InstancedMesh(colored(new THREE.BoxGeometry(1, 1, 1), 0x4f6c66), propMaterial(), bridges.posts.length);
    bridges.posts.forEach((mt, i) => im.setMatrixAt(i, mt));
    im.name = 'bridge:railing-posts';
    im.layers.enable(1);
    im.computeBoundingSphere();
    group.add(im);
  }

  // ---------- seawall ----------
  for (const l of json.lines) {
    if (l.c !== 'seawall') continue;
    const { pts } = resample(unpackPts(l.p), 2);
    const prof = pts.map((p) => {
      const nx = p.tz, nz = -p.tx;
      // which side faces the Atlantic?
      const oc = terrain.oceanDistAt(p.x + nx * 6, p.z + nz * 6) < terrain.oceanDistAt(p.x - nx * 6, p.z - nz * 6) ? 1 : -1;
      let top = -Infinity, bot = Infinity;
      for (const o of [-5, -2.5, 0, 2.5, 5]) {
        const h = terrain.heightAt(p.x + nx * o, p.z + nz * o);
        top = Math.max(top, h);
        bot = Math.min(bot, h);
      }
      return { p, nx: nx * oc, nz: nz * oc, top: top + 0.7, bot: bot - 0.6 };
    });
    for (let i = 0; i + 1 < prof.length; i++) {
      const a = prof[i], b = prof[i + 1];
      const A = (o: number, y: number) => V(a.p.x + a.nx * o, y, a.p.z + a.nz * o);
      const B = (o: number, y: number) => V(b.p.x + b.nx * o, y, b.p.z + b.nz * o);
      const shade = 0x857d72 + ((i * 2654435761) % 3) * 0x030303;
      m.color(shade);
      m.quad(A(0.7, a.top), B(0.7, b.top), B(3.2, b.bot), A(3.2, a.bot), V(a.nx, 0.6, a.nz)); // armour slope to the sea
      m.color(0x9a938a).quad(A(-0.9, a.top), B(-0.9, b.top), B(0.7, b.top), A(0.7, a.top), up);
      m.color(0x7c756b).quad(A(-0.9, a.bot + 0.4), B(-0.9, b.bot + 0.4), B(-0.9, b.top), A(-0.9, a.top), V(-a.nx, 0, -a.nz));
      // armour stone heaped on the seaward slope (the quad above reads as the gaps between them)
      for (let k = 0; k < 2; k++) {
        const t = rng.float(), o = 1.0 + rng.float() * 2.1, f = (o - 0.7) / 2.5;
        const x = a.p.x + (b.p.x - a.p.x) * t + a.nx * o, z = a.p.z + (b.p.z - a.p.z) * t + a.nz * o;
        const y = a.top + (a.bot - a.top) * f + 0.15;
        const sc = 0.45 + rng.float() * 0.5;
        stone(rng.float() < 0.8 ? 'riprap' : 'boulder', x, y, z, sc, rng.float() * 6.3, (rng.float() - 0.5) * 0.5);
      }
    }
  }

  // ---------- rock groynes / jetties (asset-kit riprap and boulders) ----------
  for (const l of json.lines) {
    if (l.c !== 'groyne') continue;
    const { pts } = resample(unpackPts(l.p), 1.3);
    for (const p of pts) {
      for (let k = 0; k < 2; k++) {
        const off = (rng.float() - 0.5) * 3.2;
        const x = p.x + p.tz * off, z = p.z - p.tx * off;
        const sc = 0.75 + rng.float() * 0.95;
        const y = Math.max(terrain.heightAt(x, z), -1.2) + 0.1;
        stone(rng.float() < 0.7 ? 'riprap' : 'boulder', x, y, z, sc, rng.float() * 6.3, (rng.float() - 0.5) * 0.7);
      }
    }
  }
  for (const [key, list] of stones) {
    const [type, v] = key.split(':');
    const im = new THREE.InstancedMesh(rockLib(type as RockType, +v).clone(), propMaterial(), list.length);
    im.name = 'rocks:' + key;
    const c = new THREE.Color();
    list.forEach((mt, i) => { im.setMatrixAt(i, mt); im.setColorAt(i, c.setScalar(0.82 + rng.float() * 0.3)); });
    im.layers.enable(1);
    im.computeBoundingSphere();
    group.add(im);
  }

  const mesh = new THREE.Mesh(m.geometry(), propMaterial());
  mesh.name = 'structures';
  mesh.layers.enable(1);
  group.add(mesh);
  return { group, pierSegs, towers };
}
