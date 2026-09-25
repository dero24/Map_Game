// Built structures from OSM lines: road bridges (incl. the Rumson–Sea Bright bascule), piers and docks,
// the Sea Bright–Monmouth Beach seawall and rock groynes. Registers walkable decks with the walk world.
import * as THREE from 'three';
import type { World } from './data';
import type { WalkWorld } from '../player/collision';
import { propMaterial, colored } from '../render/propMaterial';
import { makeRng } from '../core/rng';

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

function chainBridges(world: World) {
  const segs = world.json.roads.filter((r) => r.br && !r.lod && !['footway', 'path', 'cycleway', 'steps'].includes(r.c)).map((r) => ({ r, p: unpackPts(r.p) }));
  const key = (p: P) => `${p[0].toFixed(1)},${p[1].toFixed(1)}`;
  const chains: { pts: P[]; w: number; movable: boolean; name?: string }[] = [];
  const used = new Set<number>();
  for (let i = 0; i < segs.length; i++) {
    if (used.has(i)) continue;
    used.add(i);
    let pts = segs[i].p.slice();
    let w = segs[i].r.w, movable = segs[i].r.br === 'movable';
    const name = segs[i].r.n;
    let grew = true;
    while (grew) {
      grew = false;
      for (let j = 0; j < segs.length; j++) {
        if (used.has(j)) continue;
        const q = segs[j].p;
        if (key(q[0]) === key(pts[pts.length - 1])) pts = pts.concat(q.slice(1));
        else if (key(q[q.length - 1]) === key(pts[0])) pts = q.concat(pts.slice(1));
        else if (key(q[0]) === key(pts[0])) pts = q.slice().reverse().concat(pts.slice(1));
        else if (key(q[q.length - 1]) === key(pts[pts.length - 1])) pts = pts.concat(q.slice().reverse().slice(1));
        else continue;
        used.add(j);
        w = Math.max(w, segs[j].r.w);
        movable ||= segs[j].r.br === 'movable';
        grew = true;
      }
    }
    chains.push({ pts, w, movable, name });
  }
  return chains;
}

export function buildStructures(world: World, walk: WalkWorld) {
  const { terrain, json } = world;
  const group = new THREE.Group();
  group.name = 'structures';
  const m = new Mesher();
  const up = new THREE.Vector3(0, 1, 0);
  const V = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);
  const rng = makeRng(20260923);

  // ---------- road bridges ----------
  const towers: THREE.Vector3[] = [];
  for (const ch of chainBridges(world)) {
    const { pts, L } = resample(ch.pts, 2);
    if (L < 8) continue;
    const hA = Math.max(terrain.heightAt(pts[0].x, pts[0].z), 1.2);
    const hB = Math.max(terrain.heightAt(pts[pts.length - 1].x, pts[pts.length - 1].z), 1.2);
    const peak = ch.movable ? 6.4 : Math.min(3.2 + L * 0.004, 7);
    const heightAt = (s: number) => {
      const t = Math.min(1, Math.max(0, s / L));
      const base = hA + (hB - hA) * t;
      return base + Math.max(0, peak - base) * Math.pow(Math.sin(Math.PI * t), 0.45);
    };
    const hw = ch.w / 2 + 2.0;
    const lr = pts.map((p) => {
      const nx = p.tz, nz = -p.tx; // left normal
      return { p, y: heightAt(p.s), nx, nz };
    });
    for (let i = 0; i + 1 < lr.length; i++) {
      const a = lr[i], b = lr[i + 1];
      const A = (o: number, dy = 0) => V(a.p.x + a.nx * o, a.y + dy, a.p.z + a.nz * o);
      const B = (o: number, dy = 0) => V(b.p.x + b.nx * o, b.y + dy, b.p.z + b.nz * o);
      // roadway + sidewalks
      m.color(0x74767a).quad(A(-ch.w / 2), B(-ch.w / 2), B(ch.w / 2), A(ch.w / 2), up);
      m.color(0xcfc9bc);
      m.quad(A(ch.w / 2, 0.15), B(ch.w / 2, 0.15), B(hw, 0.15), A(hw, 0.15), up);
      m.quad(A(-hw, 0.15), B(-hw, 0.15), B(-ch.w / 2, 0.15), A(-ch.w / 2, 0.15), up);
      m.color(0xe2c14e).quad(A(-0.12, 0.01), B(-0.12, 0.01), B(0.12, 0.01), A(0.12, 0.01), up);
      // fascia + underside
      const side = V(a.nx, 0, a.nz);
      m.color(0xb9b4aa);
      m.quad(A(hw + 0.3, -1.1), B(hw + 0.3, -1.1), B(hw + 0.3, 1.2), A(hw + 0.3, 1.2), side);
      m.quad(A(-hw - 0.3, -1.1), B(-hw - 0.3, -1.1), B(-hw - 0.3, 1.2), A(-hw - 0.3, 1.2), side.clone().negate());
      m.color(0x6d6a66).quad(A(-hw - 0.3, -1.1), B(-hw - 0.3, -1.1), B(hw + 0.3, -1.1), A(hw + 0.3, -1.1), V(0, -1, 0));
      // parapets (inner face + cap)
      m.color(0xd6d1c6);
      m.quad(A(hw, 0.15), B(hw, 0.15), B(hw, 1.2), A(hw, 1.2), side.clone().negate());
      m.quad(A(-hw, 0.15), B(-hw, 0.15), B(-hw, 1.2), A(-hw, 1.2), side);
      m.quad(A(hw, 1.2), B(hw, 1.2), B(hw + 0.3, 1.2), A(hw + 0.3, 1.2), up);
      m.quad(A(-hw - 0.3, 1.2), B(-hw - 0.3, 1.2), B(-hw, 1.2), A(-hw, 1.2), up);
    }
    // piers under the deck, over water
    for (let s = 12; s < L - 6; s += 22) {
      const p = lr[Math.round((s / L) * (lr.length - 1))];
      if (terrain.sdfAt(p.p.x, p.p.z) > 1) continue;
      const ang = Math.atan2(p.p.tz, p.p.tx);
      m.color(0x9b968c).box(p.p.x, p.p.z, ang, 1.6, hw * 2 - 1, -3, p.y - 1.1);
    }
    if (ch.movable) {
      // bascule span: tender houses at the four corners of the moving leaves
      const mid = lr[Math.floor(lr.length / 2)];
      const ang = Math.atan2(mid.p.tz, mid.p.tx);
      for (const du of [-9, 9])
        for (const sv of [-1, 1]) {
          const x = mid.p.x + mid.p.tx * du + mid.nx * sv * (hw + 2.2);
          const z = mid.p.z + mid.p.tz * du + mid.nz * sv * (hw + 2.2);
          m.color(0xe9e4d8).box(x, z, ang, 3.4, 3.0, mid.y - 1.2, mid.y + 3.2);
          m.color(0x5d6b58).box(x, z, ang, 3.8, 3.4, mid.y + 3.2, mid.y + 3.5);
          m.color(0x9b968c).box(x, z, ang, 3.0, 2.6, -3, mid.y - 1.2);
          towers.push(V(x, mid.y + 3.6, z));
        }
      // the leaf joint painted across the deck
      const a = lr[Math.floor(lr.length / 2)];
      m.color(0x3d3f44).quad(
        V(a.p.x + a.nx * -hw - a.p.tx * 0.2, a.y + 0.02, a.p.z + a.nz * -hw - a.p.tz * 0.2),
        V(a.p.x + a.nx * hw - a.p.tx * 0.2, a.y + 0.02, a.p.z + a.nz * hw - a.p.tz * 0.2),
        V(a.p.x + a.nx * hw + a.p.tx * 0.2, a.y + 0.02, a.p.z + a.nz * hw + a.p.tz * 0.2),
        V(a.p.x + a.nx * -hw + a.p.tx * 0.2, a.y + 0.02, a.p.z + a.nz * -hw + a.p.tz * 0.2), up);
    }
    walk.addDeck({ pts: pts.map((p) => [p.x, p.z]), cum: pts.map((p) => p.s), halfWidth: hw - 0.35, heightAt: (s) => heightAt(s) + 0.1, profile: { k: 'arch', hA: hA + 0.1, hB: hB + 0.1, peak: peak + 0.1, total: L } });
  }

  // ---------- piers & docks ----------
  const DECK = 1.35;
  const posts: THREE.Matrix4[] = [];
  const pierSegs: { a: P; b: P; w: number }[] = [];
  for (const l of json.lines) {
    if (l.c !== 'pier') continue;
    const p = unpackPts(l.p);
    const near = p.some(([x, z]) => terrain.slice.contains(x, z, -150));
    if (!near) continue;
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
    for (let i = 0; i + 1 < p.length; i++) pierSegs.push({ a: p[i], b: p[i + 1], w });
    const cum = [0];
    for (let i = 1; i < p.length; i++) cum.push(cum[i - 1] + Math.hypot(p[i][0] - p[i - 1][0], p[i][1] - p[i - 1][1]));
    walk.addDeck({ pts: p, cum, halfWidth: w / 2, heightAt: () => DECK, profile: { k: 'const', y: DECK } });
  }
  if (posts.length) {
    const pg = colored(new THREE.CylinderGeometry(0.13, 0.15, 1, 6), 0x5c4e3f);
    const im = new THREE.InstancedMesh(pg, propMaterial(), posts.length);
    posts.forEach((mt, i) => im.setMatrixAt(i, mt));
    im.layers.enable(1);
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
    }
  }

  // ---------- rock groynes / jetties ----------
  const rocks: THREE.Matrix4[] = [];
  for (const l of json.lines) {
    if (l.c !== 'groyne') continue;
    const { pts } = resample(unpackPts(l.p), 1.3);
    for (const p of pts) {
      for (let k = 0; k < 2; k++) {
        const off = (rng.float() - 0.5) * 3.2;
        const x = p.x + p.tz * off, z = p.z - p.tx * off;
        const s = 0.9 + rng.float() * 1.1;
        const y = Math.max(terrain.heightAt(x, z), -1.2) + 0.25;
        const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(rng.float() * 3, rng.float() * 3, rng.float() * 3));
        rocks.push(new THREE.Matrix4().compose(V(x, y, z), q, V(s, s * 0.7, s)));
      }
    }
  }
  if (rocks.length) {
    const rg = colored(new THREE.DodecahedronGeometry(0.8, 0), 0x7e776d);
    const im = new THREE.InstancedMesh(rg, propMaterial(), rocks.length);
    rocks.forEach((mt, i) => im.setMatrixAt(i, mt));
    const c = new THREE.Color();
    for (let i = 0; i < rocks.length; i++) im.setColorAt(i, c.setScalar(0.8 + rng.float() * 0.35));
    im.layers.enable(1);
    group.add(im);
  }

  const mesh = new THREE.Mesh(m.geometry(), propMaterial());
  mesh.layers.enable(1);
  group.add(mesh);
  return { group, pierSegs, towers };
}
