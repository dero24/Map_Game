import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { Explore, revealRadius, bloomRate, joined, clipSegment, type SeenPaint } from '../src/world/explore';
import { fromLatLon, toLatLon } from '../src/world/data';
import { parseLatLon, searchLocal } from '../src/ui/geo';
import { unprojectDepth, skyDepth, type SeenGrid } from '../src/render/seen';
import { camera, planeFrame } from './helpers/frame';

describe('paint as you explore', () => {
  it('reveal grows with height, bloom is fastest underfoot', () => {
    expect(revealRadius(1.6)).toBeCloseTo(45, 0);
    expect(revealRadius(300)).toBeGreaterThan(200);
    expect(revealRadius(5000)).toBeLessThanOrEqual(450);
    expect(bloomRate(0, 45)).toBeGreaterThan(bloomRate(40, 45));
    expect(bloomRate(50, 45)).toBe(0);
  });

  it('paints around the walker and nowhere else', () => {
    const e = new Explore({ lat: 40.36, lon: -73.97 });
    for (let i = 0; i < 30; i++) e.update(0, 0, 1.6, 0.1);
    expect(e.valueAt(0, 0)).toBe(255);
    expect(e.valueAt(30, 0)).toBeGreaterThan(150);
    expect(e.valueAt(200, 0)).toBe(0);
    expect(e.stats().painted).toBeGreaterThan(50);
    expect(e.stats().km2).toBeGreaterThan(0.003);
  });

  it('the record is global: a re-anchored frame sees the same painted ground', () => {
    const o1 = { lat: 40.36, lon: -73.97 };
    const e = new Explore(o1);
    for (let i = 0; i < 30; i++) e.update(500, -300, 1.6, 0.1);
    const [lat, lon] = toLatLon(o1, 500, -300);
    const o2 = { lat: 40.41, lon: -74.05 }; // teleport far enough to re-anchor
    e.setOrigin(o2);
    const [x2, z2] = fromLatLon(o2, lat, lon);
    expect(e.valueAt(x2, z2)).toBe(255);
    expect(e.valueAt(x2 + 300, z2)).toBe(0);
  });
});

describe('a photo paints what it frames (paintSeen, the far window)', () => {
  const O = { lat: 40.36, lon: -73.97 };
  // ~6 s of frames at (x, z): every bloom is in by then (the farthest start 2.2 s late and take 2.4 s)
  const settle = (e: Explore, x = 0, z = 0, h = 1.6) => { for (let i = 0; i < 120; i++) e.update(x, z, h, 1 / 20); };
  const photo = (e: Explore, g: SeenGrid, eye = { x: 0, z: 0 }) => { const r = e.paintSeen(g, eye); settle(e, eye.x, eye.z); return r; };
  // a hand-made grid: samples at world (x, z) on the ground, view depth = how far north they are
  const grid = (w: number, h: number, at: (i: number, j: number) => [number, number] | null, foot: number): SeenGrid => {
    const pos = new Float32Array(w * h * 3), depth = new Float32Array(w * h);
    for (let j = 0; j < h; j++)
      for (let i = 0; i < w; i++) {
        const p = at(i, j);
        if (!p) continue;
        pos.set([p[0], 0, p[1]], (j * w + i) * 3);
        depth[j * w + i] = -p[1];
      }
    return { w, h, pos, depth, foot, cut: Infinity };
  };

  it('paints far samples, and between them by their footprint', () => {
    const e = new Explore(O);
    e.enabled = false; // (no walk here: only the photo)
    const g = grid(9, 1, (i) => [(i - 4) * 50, -5000], 0.01); // a row 5 km out, 50 m apart, each 50 m across
    const r = e.paintSeen(g, { x: 0, z: 0 });
    expect(r.cells).toBeGreaterThan(0);
    expect(r.reach).toBeGreaterThan(4999);
    expect(e.valueAt(0, -5000)).toBe(0); // it blooms in: nothing yet
    settle(e);
    for (let x = -200; x <= 200; x += 25) {
      expect(e.valueAt(x, -5000)).toBe(255); // on the samples and between them
      expect(e.valueAt(x, -5030)).toBe(255);
    }
    expect(e.valueAt(600, -5000)).toBe(0); // past the row's end
    expect(e.valueAt(0, -5400)).toBe(0); // beyond it
    expect(e.valueAt(0, -2500)).toBe(0); // short of it
    expect(e.stats().painted).toBe(0); // a photo isn't a walk
  });

  it('fills the ground between samples that run away at a grazing angle, not across a silhouette', () => {
    expect(joined(1 / 1000, 1 / 1250, 1 / 833, 1 / 1667)).toBe(true); // even steps in 1/depth: a plane
    expect(joined(1 / 100, 1 / 6000, 1 / 100, 1 / 6000)).toBe(false); // a wall against the far hills
    expect(clipSegment(0, 0, 0, -20000, 0, 0, 15000)).toEqual([0, 0.75]);
    // one column up the frame: the ground at 1, 1.25, 1.67, 2.5 and 5 km — a plane's even steps
    const ramp = new Explore(O);
    ramp.enabled = false;
    photo(ramp, grid(1, 5, (_, j) => [0, -1 / (0.001 - j * 0.0002)], 0.002));
    for (const z of [-1100, -2000, -3000, -3700, -4600]) expect(ramp.valueAt(0, z)).toBe(255);
    // a wall 100 m off (three rows), then hills 6 km out: nothing between is seen
    const wall = new Explore(O);
    wall.enabled = false;
    photo(wall, grid(1, 5, (_, j) => [0, j < 3 ? -100 : -6000], 0.002));
    expect(wall.valueAt(0, -100)).toBe(255);
    expect(wall.valueAt(0, -6000)).toBe(255);
    for (const z of [-400, -2000, -4000]) expect(wall.valueAt(0, z)).toBe(0);
  });

  it('paints what the frame sees, near and far — not what a building hides, nor behind you', () => {
    const e = new Explore(O);
    e.enabled = false;
    e.far = true;
    const cam = camera([0, 1.6, 0], 0); // eye height, looking north
    const w = 128, h = 72, building = new THREE.Box3(new THREE.Vector3(-20, 0, -90), new THREE.Vector3(20, 30, -60));
    const cut = skyDepth(cam.near, cam.far);
    const g = unprojectDepth(planeFrame(cam, w, h, [building], cut), w, h, cam.projectionMatrixInverse.elements, cam.matrixWorld.elements, { x: 0, y: 0, z: 0 }, cut);
    const r = photo(e, g);
    expect(r.reach).toBeGreaterThan(10000);
    expect(e.valueAt(0, -40)).toBe(255); // the street
    expect(e.valueAt(0, -60)).toBe(255); // the building's face
    expect(e.valueAt(300, -600)).toBe(255); // past its side
    expect(e.valueAt(3000, -6000)).toBe(255); // on to the far distance (the ground runs to the horizon)
    expect(e.valueAt(0, -150)).toBe(0); // behind the building
    expect(e.valueAt(0, -2000)).toBe(0);
    expect(e.valueAt(0, 100)).toBe(0); // behind you
    expect(e.valueAt(3000, 500)).toBe(0); // out of frame
    // and the post pass sees it: the fine window near, the far window past it
    expect(e.texelAt(0, -40)).toBe(255);
    expect(e.texelAt(3000, -6000)).toBe(-1); // (past the fine window)
    expect(e.texelAt(3000, -6000, true)).toBe(255);
    expect(e.texelAt(0, -2000, true)).toBe(0);
  });

  it('the far window shows the fine cells you walked, past the fine window', () => {
    const e = new Explore(O);
    e.far = true;
    for (let i = 0; i < 30; i++) e.update(0, 0, 300, 0.1); // a low pass overhead: paints ~250 m round
    expect(e.texelAt(0, 0)).toBe(255);
    for (let i = 0; i < 30; i++) e.update(3000, 0, 1.6, 0.1); // 3 km east
    expect(e.texelAt(0, 0)).toBe(-1); // out of the fine window now…
    expect(e.texelAt(0, 0, true)).toBe(255); // …but the far one has it
    expect(e.texelAt(120, -60, true)).toBe(255);
    expect(e.texelAt(0, 1500, true)).toBe(0);
    expect(e.texelAt(3000, 0, true)).toBeGreaterThan(100); // (and where you stand)
  });

  it('is deterministic, laid in at once or a slice a frame', async () => {
    const cam = camera([0, 300, 0], -10); // a hilltop
    const w = 64, h = 36, cut = skyDepth(cam.near, cam.far);
    const g = unprojectDepth(planeFrame(cam, w, h, [], cut), w, h, cam.projectionMatrixInverse.elements, cam.matrixWorld.elements, { x: 0, y: 0, z: 0 }, cut);
    const a = new Explore(O), b = new Explore(O), c = new Explore(O);
    for (const e of [a, b, c]) e.enabled = false;
    const ra = a.paintSeen(g, { x: 0, z: 0 }), rb = b.paintSeen(g, { x: 0, z: 0 });
    let rc: SeenPaint | null = null;
    void c.paintSeenSliced(g, { x: 0, z: 0 }).then((r) => (rc = r));
    for (let i = 0; i < 400 && !rc; i++) { c.update(0, 0, 300, 1 / 60); await Promise.resolve(); }
    expect(rb).toEqual(ra);
    expect(rc).toEqual(ra);
    expect(ra.reach).toBeGreaterThan(12000); // the valley, out to the sky cut
    for (const e of [a, b, c]) settle(e, 0, 0, 300);
    let same = 0, painted = 0;
    for (let z = -13000; z <= 500; z += 97)
      for (let x = -9000; x <= 9000; x += 331) {
        const v = a.valueAt(x, z);
        if (v === b.valueAt(x, z) && v === c.valueAt(x, z)) same++;
        if (v) painted++;
      }
    expect(same).toBe(Math.floor(13500 / 97 + 1) * Math.floor(18000 / 331 + 1));
    expect(painted).toBeGreaterThan(1000);
  });

  it('walker paint is unchanged, byte for byte', () => {
    // pinned 2026-09-30 when the walk's bloom slowed into a wash (20 Hz strokes, ~1.5 s underfoot):
    // the texture window after a (very fast) stroll, a run that re-centres it and a low flight —
    // too quick for any cell to reach "painted", which a real walk does (the tests above)
    const e = new Explore(O);
    let x = 0, z = 0, bloomed = 0;
    e.onBloom = (n) => (bloomed += n);
    for (let i = 0; i < 40; i++) e.update((x += 1.2), (z += 0.5), 1.6, 1 / 30);
    for (let i = 0; i < 60; i++) e.update((x += 30), (z -= 12), 1.6, 0.05);
    for (let i = 0; i < 30; i++) e.update((x -= 20), (z += 20), 150, 0.1);
    const d = e.texture.image.data as Uint8Array;
    let hash = 0x811c9dc5;
    for (let i = 0; i < d.length; i++) hash = Math.imul(hash ^ d[i], 0x01000193) >>> 0;
    expect(hash).toBe(2619836985);
    expect(e.stats().painted).toBe(0);
    expect(bloomed).toBe(0);
    expect([e.valueAt(x, z), e.valueAt(48, 20), e.valueAt(900, -360)]).toEqual([70, 137, 6]);
  });
});

describe('place search', () => {
  it('parses coordinates', () => {
    expect(parseLatLon('40.3620, -73.9755')?.lat).toBeCloseTo(40.362, 3);
    expect(parseLatLon('40.3620 -73.9755')?.lon).toBeCloseTo(-73.9755, 3);
    expect(parseLatLon('ocean ave')).toBeNull();
    expect(parseLatLon('95, 10')).toBeNull();
  });
  it('finds loaded streets and buildings, prefix matches first', () => {
    const items = [
      { name: 'Ocean Avenue', detail: 'street', lat: 1, lon: 1, kind: 'street' },
      { name: 'North Ocean Avenue', detail: 'street', lat: 2, lon: 2, kind: 'street' },
      { name: 'Ocean Avenue', detail: 'dup', lat: 3, lon: 3, kind: 'street' },
      { name: 'Peninsula Avenue', detail: 'street', lat: 4, lon: 4, kind: 'street' },
    ];
    const r = searchLocal('ocean ave', items);
    expect(r.map((p) => p.name)).toEqual(['Ocean Avenue', 'North Ocean Avenue']);
    expect(searchLocal('x', items)).toHaveLength(0);
  });
});
