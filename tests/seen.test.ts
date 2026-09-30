import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { packDepth, unpackDepth, unprojectDepth, skyDepth } from '../src/render/seen';
import { camera, planeFrame, sampleRay } from './helpers/frame';
import { mendDepth } from '../src/render/seen';

describe('what a frame sees (render/seen.ts)', () => {
  it('packs view depth into RGBA8 and back to ~1e-6', () => {
    const zs = [0.3, 1, 37.2, 480, 5200, 12400];
    const px = new Uint8Array(zs.length * 4 + 4);
    zs.forEach((z, k) => px.set(packDepth(z, 0.25, 25000), k * 4)); // (the last texel: nothing drawn)
    const back = unpackDepth(px, 0.25, 25000);
    zs.forEach((z, k) => expect(Math.abs(back[k] - z) / z).toBeLessThan(2e-6));
    expect(back[zs.length]).toBe(0);
    expect(skyDepth(0.25, 25000)).toBeCloseTo(12500, 0); // where the composite stops sketching
  });

  it('unprojects a synthetic depth grid of flat ground back onto it', () => {
    const cam = camera([120, 35, -40], -25, 30); // 35 m up, looking north-west and down
    const w = 64, h = 36;
    const g = unprojectDepth(planeFrame(cam, w, h), w, h, cam.projectionMatrixInverse.elements, cam.matrixWorld.elements, { x: 0, y: 0, z: 0 });
    const hit = new THREE.Vector3(), ground = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
    let n = 0, sky = 0;
    for (let j = 0; j < h; j++)
      for (let i = 0; i < w; i++) {
        const k = j * w + i;
        if (!sampleRay(cam, i, j, w, h).intersectPlane(ground, hit)) { expect(g.depth[k]).toBe(0); sky++; continue; }
        n++;
        const tol = 1e-3 + 1e-5 * g.depth[k];
        expect(Math.abs(g.pos[k * 3] - hit.x)).toBeLessThan(tol);
        expect(Math.abs(g.pos[k * 3 + 1])).toBeLessThan(tol);
        expect(Math.abs(g.pos[k * 3 + 2] - hit.z)).toBeLessThan(tol);
      }
    expect(n).toBeGreaterThan(1000);
    expect(sky).toBeGreaterThan(100); // (the sky above the horizon stays empty)
    // a sample's footprint across the view: 2·tan(fov/2)/h per metre of depth
    expect(g.foot).toBeCloseTo((2 * Math.tan((31 * Math.PI) / 180)) / h, 4);
  });

  it('adds the floating origin back', () => {
    const off = { x: 3072, y: 0, z: -1536 };
    const world = camera([3100, 12, -1500], -10, -60), local = camera([3100 - off.x, 12, -1500 - off.z], -10, -60);
    const w = 32, h = 18, d = planeFrame(world, w, h);
    const a = unprojectDepth(d, w, h, world.projectionMatrixInverse.elements, world.matrixWorld.elements, { x: 0, y: 0, z: 0 });
    const b = unprojectDepth(d, w, h, local.projectionMatrixInverse.elements, local.matrixWorld.elements, off);
    for (let k = 0; k < a.pos.length; k++) expect(Math.abs(a.pos[k] - b.pos[k])).toBeLessThan(0.01);
  });

  // A balloon's basket, 300 m up, looking out and down: two ropes run up the frame a few metres away.
  const basket = () => camera([0, 300, 0], -18, 0, 62, 9 / 16);
  const ropes = [-0.5, 0.6].map((x) => new THREE.Box3(new THREE.Vector3(x - 0.03, 280, -3.2), new THREE.Vector3(x + 0.03, 320, -3.1)));

  it('sees through a rope in front of the ground: its column bridged to the ground behind it', () => {
    const cam = basket(), w = 72, h = 128;
    const clean = planeFrame(cam, w, h), roped = planeFrame(cam, w, h, ropes);
    let hidden = 0;
    for (let k = 0; k < w * h; k++) if (roped[k] > 0 && roped[k] < 10) hidden++;
    expect(hidden).toBeGreaterThan(h); // (the ropes cover whole columns of the frame)
    mendDepth(roped, w, h, { thin: 4 });
    for (let k = 0; k < w * h; k++) {
      if (!(clean[k] > 0)) continue;
      expect(Math.abs(roped[k] - clean[k]) / clean[k]).toBeLessThan(0.01);
    }
  });

  it('never bridges into the sky, nor through what is wider than thin — unless it is your ride', () => {
    const cam = basket(), w = 72, h = 128;
    const roped = planeFrame(cam, w, h, ropes);
    const before = roped.slice();
    mendDepth(roped, w, h, { thin: 4 });
    const open = planeFrame(cam, w, h);
    for (let k = 0; k < w * h; k++) if (!(open[k] > 0)) expect(roped[k]).toBe(before[k]); // (a rope against the sky stays the rope)
    // a house 40 m wide, 60 m off, seen from the street: it hides what's behind it
    const street = camera([0, 1.6, 0], 0), W = 128, H = 72, house = new THREE.Box3(new THREE.Vector3(-20, 0, -90), new THREE.Vector3(20, 30, -60));
    const d = planeFrame(street, W, H, [house]), kept = d.slice();
    mendDepth(d, W, H, { thin: Math.round(W * 0.06) });
    expect(Array.from(d)).toEqual(Array.from(kept));
    // …but the same shape a few metres off, up in the air, is your own ride: seen through
    const up = camera([0, 300, 0], -18), envelope = new THREE.Box3(new THREE.Vector3(-8, 290, -30), new THREE.Vector3(8, 330, -14));
    const e = planeFrame(up, W, H, [envelope]), clear = planeFrame(up, W, H);
    mendDepth(e, W, H, { thin: 4, near: 60 });
    let bridged = 0, blocked = 0;
    for (let k = 0; k < W * H; k++) if (clear[k] > 0) { if (Math.abs(e[k] - clear[k]) / clear[k] < 0.02) bridged++; else blocked++; }
    expect(blocked).toBe(0);
    expect(bridged).toBeGreaterThan(1000);
  });
});

