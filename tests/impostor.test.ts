import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { hemiOctEncode, hemiOctDecode, frameDir, frameBasis, pickFrames, frameUV, yawToWorld, yawToLocal, atlasLayout, atlasBytes, handoverAt, maxLodOf, GUTTER, type V3 } from '../src/render/impostor';

// The impostor's view maths (render/impostor.ts): the hemi-octahedral grid of pictures, which three
// a view reads, and where a point lands on each. The card shader runs the same maths in GLSL.
const norm = (v: V3): V3 => { const L = Math.hypot(...v); return [v[0] / L, v[1] / L, v[2] / L]; };
const dot = (a: V3, b: V3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a: V3, b: V3): V3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const N = 8;

describe('impostor view cells', () => {
  it('the hemi-octahedral square: up in the middle, the horizon round the rim, ±x ±z in the corners', () => {
    expect(hemiOctEncode(0, 1, 0)).toEqual([0, 0]);
    for (const [x, z, u, v] of [[1, 0, 1, 1], [0, 1, 1, -1], [-1, 0, -1, -1], [0, -1, -1, 1]]) {
      const [a, b] = hemiOctEncode(x, 0, z);
      expect(a).toBeCloseTo(u, 9);
      expect(b).toBeCloseTo(v, 9);
    }
    // any level direction lands on the rim; below the horizon counts as on it
    for (let k = 0; k < 24; k++) {
      const a = (k / 24) * Math.PI * 2, [u, v] = hemiOctEncode(Math.cos(a), 0, Math.sin(a));
      expect(Math.max(Math.abs(u), Math.abs(v))).toBeCloseTo(1, 9);
      expect(hemiOctEncode(Math.cos(a), -0.4, Math.sin(a))).toEqual(hemiOctEncode(Math.cos(a), 0, Math.sin(a)));
    }
  });
  it('round-trips every upper-hemisphere direction', () => {
    for (let k = 0; k < 400; k++) {
      const a = k * 2.399963, e = Math.acos(1 - ((k + 0.5) / 400)); // (a Fibonacci cap: even over the hemisphere)
      const d: V3 = [Math.sin(e) * Math.cos(a), Math.cos(e), Math.sin(e) * Math.sin(a)];
      const back = hemiOctDecode(...hemiOctEncode(...d));
      for (let i = 0; i < 3; i++) expect(back[i]).toBeCloseTo(d[i], 9);
    }
  });
  it('the grid\'s pictures: unit directions over the upper hemisphere, the rim level', () => {
    for (let i = 0; i < N; i++)
      for (let j = 0; j < N; j++) {
        const d = frameDir(i, j, N);
        expect(Math.hypot(...d)).toBeCloseTo(1, 9);
        expect(d[1]).toBeGreaterThanOrEqual(0);
        if (i === 0 || j === 0 || i === N - 1 || j === N - 1) expect(d[1]).toBeCloseTo(0, 9);
      }
    // 8 azimuths or more on the horizon, and four rings of elevation above it
    const rim = new Set<number>(), elev = new Set<number>();
    for (let i = 0; i < N; i++) for (let j = 0; j < N; j++) {
      const d = frameDir(i, j, N);
      if (d[1] < 1e-9) rim.add(Math.round(Math.atan2(d[2], d[0]) * 1000));
      elev.add(Math.round(Math.asin(d[1]) * 100));
    }
    expect(rim.size).toBeGreaterThanOrEqual(8 * 3);
    expect(elev.size).toBeGreaterThanOrEqual(4);
  });
  it('each picture\'s camera: right level and square to its look, up square to both (right-handed)', () => {
    for (let i = 0; i < N; i++)
      for (let j = 0; j < N; j++) {
        const d = frameDir(i, j, N), { r, u } = frameBasis(d);
        expect(Math.hypot(...r)).toBeCloseTo(1, 9);
        expect(Math.hypot(...u)).toBeCloseTo(1, 9);
        expect(r[1]).toBe(0);
        expect(dot(r, d)).toBeCloseTo(0, 9);
        expect(dot(u, d)).toBeCloseTo(0, 9);
        const c = cross(r, u);
        for (let k = 0; k < 3; k++) expect(c[k]).toBeCloseTo(d[k], 9);
      }
    // straight down: right east, up north
    expect(frameBasis([0, 1, 0])).toEqual({ r: [1, 0, 0], u: [0, 0, -1] });
  });
  it('a view reads three pictures, weights summing to 1, continuous as the view moves', () => {
    let prev: Map<string, number> | null = null;
    for (let k = 0; k <= 2000; k++) {
      // a path over the hemisphere: round twice while rising from the horizon to near the top
      const a = (k / 2000) * Math.PI * 4, e = 0.02 + (k / 2000) * 1.45;
      const v: V3 = [Math.cos(e) * Math.cos(a), Math.sin(e), Math.cos(e) * Math.sin(a)];
      const f = pickFrames(...v, N);
      expect(f.w.reduce((s, w) => s + w, 0)).toBeCloseTo(1, 9);
      for (const w of f.w) expect(w).toBeGreaterThanOrEqual(-1e-12);
      for (let q = 0; q < 3; q++) {
        expect(f.i[q]).toBeGreaterThanOrEqual(0);
        expect(f.i[q]).toBeLessThan(N);
        expect(f.j[q]).toBeGreaterThanOrEqual(0);
        expect(f.j[q]).toBeLessThan(N);
      }
      // the three pictures are near the view: within a grid step or so
      for (let q = 0; q < 3; q++) if (f.w[q] > 0.2) expect(dot(frameDir(f.i[q], f.j[q], N), norm(v))).toBeGreaterThan(Math.cos(0.75));
      const m = new Map<string, number>();
      f.i.forEach((i, q) => m.set(`${i},${f.j[q]}`, (m.get(`${i},${f.j[q]}`) ?? 0) + f.w[q]));
      if (prev) {
        // a small step of the view moves the blend a little (no picture pops in or out at full weight)
        let change = 0;
        for (const key of new Set([...m.keys(), ...prev.keys()])) change += Math.abs((m.get(key) ?? 0) - (prev.get(key) ?? 0));
        expect(change).toBeLessThan(0.25);
      }
      prev = m;
    }
  });
  it('seen square on, a picture is the piece\'s own projection; a point on its plane lands on itself from anywhere', () => {
    const R = 1.3;
    for (let i = 0; i < N; i++)
      for (let j = 0; j < N; j++) {
        const d = frameDir(i, j, N), { r, u } = frameBasis(d), w: V3 = [-d[0], -d[1], -d[2]];
        for (const p of [[0.3, 0.2, -0.4], [-0.5, 0.9, 0.1], [0, 0, 0]] as V3[]) {
          const [a, b] = frameUV(p, w, d, R);
          expect(a).toBeCloseTo(dot(p, r) / R, 9);
          expect(b).toBeCloseTo(dot(p, u) / R, 9);
        }
        const onPlane: V3 = [r[0] * 0.4 + u[0] * -0.7, r[1] * 0.4 + u[1] * -0.7, r[2] * 0.4 + u[2] * -0.7];
        const w2 = norm([-d[0] + 0.3, -d[1] - 0.2, -d[2] + 0.1]);
        if (dot(w2, d) < -0.2) {
          const [a, b] = frameUV(onPlane, w2, d, R);
          expect(a).toBeCloseTo(0.4 / R, 9);
          expect(b).toBeCloseTo(-0.7 / R, 9);
        }
      }
  });
  it('a point inside the sphere lands inside the three pictures a nearby view reads', () => {
    for (let k = 0; k < 300; k++) {
      const a = k * 0.737, e = 0.05 + (k % 37) / 37 * 1.4;
      const V: V3 = [Math.cos(e) * Math.cos(a), Math.sin(e), Math.cos(e) * Math.sin(a)];
      const f = pickFrames(...V, N);
      const p: V3 = norm([Math.sin(k), Math.cos(k * 1.3), Math.sin(k * 0.7)]).map((x) => x * 0.6) as V3;
      for (let q = 0; q < 3; q++) {
        const [s, t] = frameUV(p, [-V[0], -V[1], -V[2]], frameDir(f.i[q], f.j[q], N), 1);
        expect(Math.abs(s)).toBeLessThan(1.05);
        expect(Math.abs(t)).toBeLessThan(1.05);
      }
    }
  });
  it('turning a piece: local ↔ world as THREE turns it about y', () => {
    const m = new THREE.Matrix4(), v = new THREE.Vector3();
    for (const yaw of [0, 0.7, -2.1, 3.0]) {
      m.makeRotationY(yaw);
      v.set(1.2, 0, -0.4).applyMatrix4(m);
      const [x, z] = yawToWorld(1.2, -0.4, yaw);
      expect(x).toBeCloseTo(v.x, 9);
      expect(z).toBeCloseTo(v.z, 9);
      const [lx, lz] = yawToLocal(x, z, yaw);
      expect(lx).toBeCloseTo(1.2, 9);
      expect(lz).toBeCloseTo(-0.4, 9);
    }
  });
});

describe('impostor atlas layout', () => {
  it('packs every piece\'s block without overlap, inside the atlas, each picture on its own power-of-two grid', () => {
    const Fs = [64, 32, 0, 32, 64, 16, 32, 32, 64, 16, 32];
    const L = atlasLayout(Fs, 8, 2048);
    expect(L.W).toBeLessThanOrEqual(2048);
    const live = L.blocks.map((b, k) => ({ ...b, k })).filter((b) => b.F > 0);
    expect(live.length).toBe(Fs.filter((F) => F > 0).length);
    expect(L.blocks[2].F).toBe(0); // (a missing piece keeps no block)
    for (const a of live) {
      const s = 8 * a.F;
      expect(a.x + s).toBeLessThanOrEqual(L.W);
      expect(a.y + s).toBeLessThanOrEqual(L.H);
      expect(a.x % a.F).toBe(0); // (each picture's mip chain stays its own down to one texel)
      expect(a.y % a.F).toBe(0);
      for (const b of live) {
        if (b.k <= a.k) continue;
        const t = 8 * b.F, apart = a.x + s <= b.x || b.x + t <= a.x || a.y + s <= b.y || b.y + t <= a.y;
        expect(apart).toBe(true);
      }
    }
    // no worse than half empty
    const used = live.reduce((s, b) => s + (8 * b.F) ** 2, 0);
    expect(used / (L.W * L.H)).toBeGreaterThan(0.5);
    expect(atlasBytes(L)).toBe(Math.round(L.W * L.H * 8 * (4 / 3)));
  });
  it('nothing to draw: an empty 1-texel atlas, not a crash', () => {
    const L = atlasLayout([0, 0], 8, 2048);
    expect([L.W, L.H]).toEqual([1, 1]);
  });
  it('hands over where a texel meets a pixel, within the tier\'s range; reads mips down to a 4-texel picture', () => {
    expect(handoverAt(1, 64, 900, 25, 60)).toBeCloseTo((2 * 900) / (64 * (1 - 2 * GUTTER)), 6);
    expect(handoverAt(0.2, 32, 900, 25, 60)).toBe(25);
    expect(handoverAt(3, 32, 900, 25, 60)).toBe(60);
    expect(handoverAt(0.8, 32, 900, 25, 60)).toBeGreaterThan(handoverAt(0.6, 32, 900, 25, 60));
    expect(handoverAt(1, 64, 900, 0, 1e9)).toBeLessThan(handoverAt(1, 32, 900, 0, 1e9));
    expect(maxLodOf(64)).toBe(4);
    expect(maxLodOf(16)).toBe(2);
  });
});
