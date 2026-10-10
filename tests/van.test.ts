// The van (src/van/, ?poc=1): bigger on the inside, through a doorway with no seam — its plan, the
// change between in and out, walking in it, where it parks, its body (assets/camper.ts).
import { describe, it, expect } from 'vitest';
import type * as THREE from 'three';
import { vanLayout, nextMode, roomSegments, hullSegments, toWorld, toLocal, boxSegs, peekSide, windowClip, type Mode, type VanPose } from '../src/van/layout';
import { moveAmong, VanSpace } from '../src/van/space';
import { findVanSpot, inRing, type SpotEnv } from '../src/van/spot';
import { wallPieces, shellGeometry, tunnelFaces, contentsGeometry, windowFaces } from '../src/van/room';
import { camperRecipe, camperGeometry, camperValid, camperVerts, camperFrame, CAMPER_BUDGET, CAMPER_PAINTS } from '../src/assets/camper';
import { shouldLook, SIGHT } from '../src/world/sight';
import { pocOn } from '../src/poc';

const L = vanLayout();

describe('the plan: bigger on the inside', () => {
  it('the room is wider, longer and taller than the van, its back wall at the van\'s back', () => {
    const R = L.room, c = L.recipe, F = L.frame;
    expect(R.x1 - R.x0).toBeGreaterThan(c.W * 2);
    expect(R.z1 - R.z0).toBeGreaterThan(F.zr - F.zB + 1.5); // longer than the van's whole cargo box
    expect(R.y1 - R.y0).toBeGreaterThan(c.H - c.floor + 0.1); // its ceiling over the van's roof
    expect(L.tunnel.z1).toBeCloseTo(F.zr, 6); // the passage ends in the door's plane…
    expect(R.z1).toBeCloseTo(L.tunnel.z0, 6); // …and the room begins where it starts
    expect(L.door.y0).toBeCloseTo(c.floor, 6); // the doorway's sill is the floor
  });
  it('the doorway clears a walker\'s head, the passage outlasts the near plane', () => {
    const eye = 1.65, near = 0.25;
    expect(L.door.y1 - L.door.y0 - eye).toBeGreaterThan(0.25);
    expect(L.door.x1 - L.door.x0).toBeGreaterThan(2 * 0.32 + 0.5); // a walker's body and room to spare
    // out is drawn up to `enter` in: the passage's far end must lie past the near plane from there
    expect(L.tunnel.z1 - L.tunnel.z0 - L.enter).toBeGreaterThan(near);
    expect(L.enter).toBeGreaterThan(L.leave);
  });
  it('the windows sit in the side walls, in the room\'s height, clear of each other', () => {
    for (const w of L.windows) {
      expect(['left', 'right', 'front']).toContain(w.wall);
      expect(w.y0).toBeGreaterThan(0.5);
      expect(w.y1).toBeLessThan(L.room.y1 - L.room.y0);
      const along = w.wall === 'front' ? [L.room.x0, L.room.x1] : [L.room.z0, L.room.z1];
      expect(w.c - w.w / 2).toBeGreaterThan(along[0] + 0.2);
      expect(w.c + w.w / 2).toBeLessThan(along[1] - 0.2);
    }
    for (const a of L.windows) for (const b of L.windows) if (a !== b && a.wall === b.wall) expect(Math.abs(a.c - b.c)).toBeGreaterThan((a.w + b.w) / 2);
  });
  it('the furniture stands inside the room, clear of the doorway\'s way in', () => {
    for (const f of L.furniture) {
      if (f.kind === 'doormat') continue;
      for (const [ax, az] of boxSegs(f.x, f.z, f.yaw, f.hx, f.hz)) {
        expect(ax).toBeGreaterThanOrEqual(L.room.x0 - 0.02);
        expect(ax).toBeLessThanOrEqual(L.room.x1 + 0.02);
        expect(az).toBeGreaterThanOrEqual(L.room.z0 - 0.02);
        expect(az).toBeLessThanOrEqual(L.room.z1 + 0.02);
      }
      if (f.solid) {
        // nothing solid within a metre in front of the passage
        const inWay = f.x + Math.max(f.hx, f.hz) > L.door.x0 && f.x - Math.max(f.hx, f.hz) < L.door.x1 && f.z + Math.max(f.hx, f.hz) > L.room.z1 - 1.0;
        expect(inWay, f.kind).toBe(false);
      }
    }
  });
  it('you wake inside, clear of everything, facing into the room', () => {
    const w = L.wake;
    expect(w.x).toBeGreaterThan(L.room.x0 + 0.3);
    expect(w.x).toBeLessThan(L.room.x1 - 0.3);
    expect(w.z).toBeGreaterThan(L.room.z0 + 0.3);
    expect(w.z).toBeLessThan(L.room.z1 - 0.3);
    const [x, z] = moveAmong(roomSegments(L), w.x, w.z, 0, 0, 0.32);
    expect(Math.hypot(x - w.x, z - w.z)).toBeLessThan(1e-6); // (not standing in the bed)
  });
});

describe('in or out: the change is by where you stand, with a band', () => {
  const d = L.door;
  const at = (depth: number, x = 0) => [x, d.z - depth] as const;
  it('out until past `enter`, in until back under `leave`', () => {
    let m: Mode = 'out';
    const seen: Mode[] = [];
    for (const depth of [-2, -0.5, 0, 0.1, 0.2, 0.25, 0.29, 0.31, 0.5, 2, 4]) { m = nextMode(m, ...at(depth), L); seen.push(m); }
    expect(seen).toEqual(['out', 'out', 'out', 'out', 'out', 'out', 'out', 'in', 'in', 'in', 'in']);
    for (const depth of [2, 0.5, 0.29, 0.25, 0.23, 0.21, 0, -1]) { m = nextMode(m, ...at(depth), L); seen.push(m); }
    expect(seen.slice(11)).toEqual(['in', 'in', 'in', 'in', 'in', 'out', 'out', 'out']);
  });
  it('standing in the band never flickers', () => {
    for (const start of ['in', 'out'] as Mode[]) {
      let m = start;
      for (let k = 0; k < 50; k++) m = nextMode(m, ...at(0.22 + 0.08 * ((k * 0.618) % 1)), L);
      expect(m).toBe(start);
    }
  });
  it('beside the van, or behind it off the doorway, you\'re out — even "deep" in its footprint', () => {
    expect(nextMode('out', L.door.x1 + 0.4, d.z - 1, L)).toBe('out');
    expect(nextMode('out', L.room.x0 + 0.2, d.z - 3, L)).toBe('out');
    // in the room, off the doorway, you stay in
    expect(nextMode('in', L.room.x0 + 0.5, L.room.z0 + 0.5, L)).toBe('in');
    expect(nextMode('in', L.door.x1 + 0.4, d.z - 0.1, L)).toBe('in');
  });
});

describe('frames: van-local ↔ world', () => {
  it('round trips at any yaw, and turns as three.js turns an object', () => {
    for (const yaw of [0, 0.7, Math.PI / 2, -2.4, Math.PI]) {
      const p: VanPose = { x: 120.5, y: 2, z: -33.25, yaw };
      for (const [lx, lz] of [[0, 0], [1.2, -3.4], [-2.4, 2.8]]) {
        const [wx, wz] = toWorld(p, lx, lz), [bx, bz] = toLocal(p, wx, wz);
        expect(bx).toBeCloseTo(lx, 9);
        expect(bz).toBeCloseTo(lz, 9);
      }
    }
    // yaw π/2: the van's back (+z) toward +x
    const [wx, wz] = toWorld({ x: 0, y: 0, z: 0, yaw: Math.PI / 2 }, 0, 1);
    expect(wx).toBeCloseTo(1, 9);
    expect(wz).toBeCloseTo(0, 9);
  });
});

describe('walking in the room', () => {
  const segs = roomSegments(L);
  it('the walls hold you in: a long walk at each wall ends a body\'s width inside it', () => {
    const c = { x: 0, z: (L.room.z0 + L.room.z1) / 2 };
    for (const [dx, dz] of [[10, 0], [-10, 0], [0, -10]]) {
      const [x, z] = moveAmong(segs, c.x, c.z + (dx ? -1.1 : 0), dx, dz, 0.32);
      expect(x).toBeGreaterThan(L.room.x0 + 0.3);
      expect(x).toBeLessThan(L.room.x1 - 0.3);
      expect(z).toBeGreaterThan(L.room.z0 + 0.3);
    }
  });
  it('the doorway lets you out — straight through, in steps of a frame', () => {
    let x = 0.05, z = L.room.z1 - 1.5;
    for (let k = 0; k < 200 && z < L.door.z + 0.3; k++) [x, z] = moveAmong(segs, x, z, 0, 0.04, 0.32);
    expect(z).toBeGreaterThan(L.door.z);
    expect(Math.abs(x)).toBeLessThan((L.door.x1 - L.door.x0) / 2);
  });
  it('the back wall beside the doorway is a wall', () => {
    const [, z] = moveAmong(segs, L.door.x1 + 0.9, L.room.z1 - 1, 0, 5, 0.32);
    expect(z).toBeLessThan(L.room.z1 - 0.3);
  });
  it('a slow frame can\'t carry you through a wall', () => {
    const [x] = moveAmong(segs, L.room.x1 - 0.5, -1, 3, 0, 0.32); // 3 m in one step at the right wall
    expect(x).toBeLessThan(L.room.x1);
  });
  it('the space works in the world\'s frame, through the van\'s pose', () => {
    const pose: VanPose = { x: 200, y: 2.2, z: -170, yaw: 1.58 };
    const S = new VanSpace(segs, L.floor, pose);
    expect(S.surfaceAt()).toBeCloseTo(2.2 + L.floor, 9);
    const [sx, sz] = toWorld(pose, 0, 0);
    const [wx, wz] = S.move(sx, sz, 20, 0, 0.32); // a world step east: inside the room it stops at a wall
    const [lx, lz] = toLocal(pose, wx, wz);
    expect(lx).toBeGreaterThan(L.room.x0 - 1e-6);
    expect(lx).toBeLessThan(L.room.x1 + 1e-6);
    expect(lz).toBeGreaterThan(L.room.z0 - 1e-6);
  });
});

describe('the van in the world', () => {
  it('its outline is closed but for the doorway', () => {
    const segs = hullSegments(L);
    // walk round the outline: every wall's ends meet another wall's, but for the doorway's edges
    const key = (x: number, z: number) => `${x.toFixed(3)},${z.toFixed(3)}`;
    const ends = new Map<string, number>();
    for (const [ax, az, bx, bz] of segs) for (const k of [key(ax, az), key(bx, bz)]) ends.set(k, (ends.get(k) ?? 0) + 1);
    const loose = [...ends.values()].filter((n) => n === 1).length;
    expect(loose).toBe(2); // (the doorway's two sides run on in, their inner ends loose)
    // from straight behind, walking in at the doorway gets you past the door's plane
    let x = 0, z = L.door.z + 2;
    for (let k = 0; k < 100; k++) [x, z] = moveAmong(segs, x, z, 0, -0.05, 0.32);
    expect(z).toBeLessThan(L.door.z - 0.5);
    // …and beside the doorway (between its edge and the van's side) it's a wall
    let x2 = (L.door.x1 + L.recipe.W / 2) / 2 + 0.05, z2 = L.door.z + 2;
    for (let k = 0; k < 100; k++) [x2, z2] = moveAmong(segs, x2, z2, 0, -0.05, 0.32);
    expect(z2).toBeGreaterThan(L.door.z);
  });
});

describe('where it parks', () => {
  // a car park 60 × 40 m with the sea to the east (x), a road down its middle, a building to the north
  const lot: number[] = [0, 0, 600, 0, 600, 400, 0, 400].map((v) => v * 1); // decimetres: 60 × 40 m
  const env: SpotEnv = {
    areas: [{ c: 'parking', o: [lot] }, { c: 'grass', o: [[0, 0, 10, 0, 10, 10]] }],
    oceanDist: (x) => Math.max(0, 200 - x),
    height: () => 1.5,
    building: (x, z) => z < -2 && x > 10 && x < 50,
    blocked: () => false,
    road: (_x, z) => Math.abs(z - 20) < 3,
  };
  it('finds a stall with its back to the sea, the room clear of buildings, off the aisle', () => {
    const p = findVanSpot({ x: 30, z: 20 }, env, L)!;
    expect(p).not.toBeNull();
    const [bx] = toWorld(p, 0, 5), [fx] = toWorld(p, 0, -5);
    expect(bx).toBeGreaterThan(fx + 9); // its back (+z) east, toward the sea
    expect(p.y).toBe(1.5);
    for (let u = L.room.x0; u <= L.room.x1; u += 0.5) for (let v = L.room.z0; v <= L.door.z; v += 0.5) {
      const [x, z] = toWorld(p, u, v);
      expect(env.building(x, z)).toBe(false);
    }
    const [cx, cz] = toWorld(p, 0, 0);
    expect(inRing(cx, cz, [[0, 0], [60, 0], [60, 40], [0, 40]])).toBe(true);
    expect(Math.abs(cz - 20)).toBeGreaterThan(1.5); // (not in the aisle)
  });
  it('a car behind the back door rules a stall out; cars where the van stands move on', () => {
    const cars = (x: number, z: number) => Math.hypot(x - 50, z - 10) < 2.4;
    const p = findVanSpot({ x: 30, z: 20 }, { ...env, car: cars, blocked: (x, z) => cars(x, z) }, L)!;
    for (let v = 0.5; v <= 3; v += 0.5) { const [x, z] = toWorld(p, 0, L.frame.zr + v); expect(cars(x, z)).toBe(false); }
  });
  it('the same answer every time, and none with no car park near', () => {
    expect(findVanSpot({ x: 30, z: 20 }, env, L)).toEqual(findVanSpot({ x: 30, z: 20 }, env, L));
    expect(findVanSpot({ x: 3000, z: 20 }, env, L)).toBeNull();
  });
});

describe('the room\'s shell', () => {
  it('a wall less its windows: pieces that cover it once, never a window', () => {
    const holes = [{ u0: 1, u1: 2, v0: 1, v1: 1.8 }, { u0: 3.2, u1: 4.4, v0: 0.9, v1: 1.9 }];
    const P = wallPieces(6, 2.8, holes);
    let area = 0;
    for (const r of P) { expect(r.u1).toBeGreaterThan(r.u0); expect(r.v1).toBeGreaterThan(r.v0); area += (r.u1 - r.u0) * (r.v1 - r.v0); }
    expect(area).toBeCloseTo(6 * 2.8 - 0.8 - 1.2, 9);
    for (let u = 0.05; u < 6; u += 0.1) for (let v = 0.05; v < 2.8; v += 0.1) {
      const inHole = holes.some((h) => u > h.u0 && u < h.u1 && v > h.v0 && v < h.v1);
      const n = P.filter((r) => u > r.u0 && u < r.u1 && v > r.v0 && v < r.v1).length;
      expect(n).toBe(inHole ? 0 : 1);
    }
  });
  it('faces in, and is convex from inside: no face of it hides another', () => {
    const g = shellGeometry(L), p = g.getAttribute('position'), n = g.getAttribute('normal');
    const c = { x: 0, y: (L.room.y0 + L.room.y1) / 2, z: (L.room.z0 + L.room.z1) / 2 };
    for (let i = 0; i < p.count; i += 3) {
      // the room's middle is in front of every face
      const d = (c.x - p.getX(i)) * n.getX(i) + (c.y - p.getY(i)) * n.getY(i) + (c.z - p.getZ(i)) * n.getZ(i);
      expect(d).toBeGreaterThan(0);
      // and every face lies on the room's box (a convex room: its faces only on its bounding planes)
      const onBox = [p.getX(i) - L.room.x0, L.room.x1 - p.getX(i), p.getY(i) - L.room.y0, L.room.y1 - p.getY(i), p.getZ(i) - L.room.z0, L.room.z1 - p.getZ(i)].some((v) => Math.abs(v) < 1e-6);
      expect(onBox).toBe(true);
    }
  });
  it('the passage\'s faces span the doorway, from the room to the door', () => {
    const F = tunnelFaces(L);
    expect(F).toHaveLength(4);
    for (const f of F) for (const [x, y, z] of f.p) {
      expect(x).toBeGreaterThanOrEqual(L.door.x0 - 1e-9);
      expect(x).toBeLessThanOrEqual(L.door.x1 + 1e-9);
      expect(y).toBeGreaterThanOrEqual(L.door.y0 - 1e-9);
      expect(y).toBeLessThanOrEqual(L.door.y1 + 1e-9);
      expect(z).toBeGreaterThanOrEqual(L.tunnel.z0 - 1e-9);
      expect(z).toBeLessThanOrEqual(L.tunnel.z1 + 1e-9);
    }
  });
  it('the furniture is finite and within a room\'s budget', () => {
    const g = contentsGeometry(L), a = g.getAttribute('position').array as Float32Array;
    for (let i = 0; i < a.length; i++) expect(Number.isFinite(a[i])).toBe(true);
    expect(g.getAttribute('position').count).toBeLessThan(120000);
  });
});

describe('the camper van (the foundry\'s family)', () => {
  it('every seed is valid, grounded and within budget; deterministic', () => {
    for (let seed = 1; seed <= 8; seed++) {
      const c = camperRecipe(seed);
      expect(camperValid(c), `seed ${seed}`).toBe(true);
      expect(camperVerts(c)).toBeLessThanOrEqual(CAMPER_BUDGET);
      expect(camperRecipe(seed)).toEqual(c);
      expect(CAMPER_PAINTS).toContain(c.paint as (typeof CAMPER_PAINTS)[number]);
    }
    expect(camperRecipe(1).paint).toBe(CAMPER_PAINTS[0]); // (yours: the sea-foam one)
  });
  it('its back is open at the doorway, its sides seen only from outside', () => {
    const c = camperRecipe(1), F = camperFrame(c), g = camperGeometry(c);
    // nothing of the body inside the doorway's passage (between its posts, over the floor, under the head)
    const p = g.body.getAttribute('position');
    const d = { x0: -c.doorW / 2 + 0.005, x1: c.doorW / 2 - 0.005, y0: c.floor + 0.005, y1: F.doorTop - 0.005, z0: F.zr - 0.6, z1: F.zr };
    for (let i = 0; i < p.count; i++) {
      const inside = p.getX(i) > d.x0 && p.getX(i) < d.x1 && p.getY(i) > d.y0 && p.getY(i) < d.y1 && p.getZ(i) > d.z0 && p.getZ(i) < d.z1;
      expect(inside).toBe(false);
    }
    // the sides keep no face toward the inside
    for (const [side, geo] of [[-1, g.left], [1, g.right]] as const) {
      const n = geo.getAttribute('normal');
      for (let i = 0; i < n.count; i++) expect(n.getX(i) * side).toBeGreaterThan(-0.5);
    }
  });
});

/** Of a grid over a rectangle seen straight on (along the axis neither `ax` nor `bx` names), the
 *  share no triangle of `g` covers. */
function clearShare(g: THREE.BufferGeometry, ax: 0 | 1 | 2, bx: 0 | 1 | 2, r: { a0: number; a1: number; b0: number; b1: number }, n = 40, m = 12) {
  const G = g.index ? g.toNonIndexed() : g, p = G.getAttribute('position');
  const tris: number[][] = [];
  for (let t = 0; t + 2 < p.count; t += 3) {
    const q = [0, 1, 2].map((k) => [p.getComponent(t + k, ax), p.getComponent(t + k, bx)]);
    const A = (q[1][0] - q[0][0]) * (q[2][1] - q[0][1]) - (q[2][0] - q[0][0]) * (q[1][1] - q[0][1]);
    if (Math.abs(A) > 1e-9) tris.push([...q.flat(), A]); // (a face seen edge-on covers nothing)
  }
  let clear = 0;
  for (let i = 0; i < n; i++) for (let j = 0; j < m; j++) {
    const a = r.a0 + ((i + 0.5) / n) * (r.a1 - r.a0), b = r.b0 + ((j + 0.5) / m) * (r.b1 - r.b0);
    const hit = tris.some(([x0, y0, x1, y1, x2, y2, A]) => {
      const w0 = ((x1 - a) * (y2 - b) - (x2 - a) * (y1 - b)) / A, w1 = ((x2 - a) * (y0 - b) - (x0 - a) * (y2 - b)) / A;
      return w0 > 1e-6 && w1 > 1e-6 && 1 - w0 - w1 > 1e-6;
    });
    if (!hit) clear++;
  }
  return clear / (n * m);
}

describe('looking in at its windows (from outside, the room through them)', () => {
  const F = L.frame, xi = L.recipe.W / 2 - F.panel;
  const keep = (side: -1 | 0 | 1, x: number) => { const [a, , , d] = windowClip(L, side); return a * x + d >= 0; };
  it('its windows are open right through, the curtains tied back at their ends; the panes keep its shadow whole', () => {
    const g = camperGeometry(L.recipe);
    const side = { a0: F.win.z0, a1: F.win.z1, b0: F.win.y0, b1: F.win.y1 }, lw = F.leafWin, leaf = { a0: lw.u0, a1: lw.u1, b0: lw.y0, b1: lw.y1 };
    expect(clearShare(g.left, 2, 1, side)).toBeGreaterThan(0.75);
    expect(clearShare(g.right, 2, 1, side)).toBeGreaterThan(0.75); // (the sliding door's post across it too)
    expect(clearShare(g.body, 2, 1, side)).toBe(1); // (nothing of the body in the way)
    expect(clearShare(g.leaf, 0, 1, leaf)).toBeGreaterThan(0.6);
    // the panes fill the openings exactly (never drawn: they cast the shadow glass would)
    expect(clearShare(g.panes, 2, 1, side)).toBe(0);
    expect(clearShare(g.leafPane, 0, 1, leaf)).toBe(0);
    for (const [geo, w] of [[g.panes, F.win.z1 - F.win.z0], [g.leafPane, lw.u1 - lw.u0]] as const) {
      geo.computeBoundingBox();
      const b = geo.boundingBox!;
      expect(Math.max(b.max.x - b.min.x, b.max.z - b.min.z)).toBeGreaterThanOrEqual(w - 1e-6);
    }
  });
  it('shut, the windows in the back doors look into the doorway passage', () => {
    const lw = F.leafWin, hw = L.recipe.W / 2, d = L.door;
    // (the right leaf, hinged at the right corner, shut: its u runs from the hinge toward −x)
    const x0 = hw + lw.u0, x1 = hw + lw.u1;
    expect((Math.min(x1, d.x1) - Math.max(x0, d.x0)) / (x1 - x0)).toBeGreaterThan(0.9);
    expect(lw.y0).toBeGreaterThan(d.y0);
    expect(lw.y1).toBeLessThan(d.y1);
  });
  it('the portal\'s face across each side window stands at the panel\'s inside, spans the opening and faces out', () => {
    const W = windowFaces(L);
    expect(W.map((f) => f.side)).toEqual([-1, 1]);
    for (const f of W) {
      for (const [x] of f.p) expect(x).toBeCloseTo(f.side * xi, 9);
      const zs = f.p.map((q) => q[2]), ys = f.p.map((q) => q[1]);
      expect([Math.min(...zs), Math.max(...zs), Math.min(...ys), Math.max(...ys)]).toEqual([F.win.z0, F.win.z1, F.win.y0, F.win.y1]);
      expect(f.n).toEqual([f.side, 0, 0]);
    }
  });
  it('you look in at a side\'s windows only from outside that side', () => {
    expect(peekSide(L, -3)).toBe(-1);
    expect(peekSide(L, 3)).toBe(1);
    expect(peekSide(L, 0)).toBe(0); // (behind the van or in its doorway: the doorway's)
    expect(peekSide(L, -xi + 0.01)).toBe(0);
    expect(peekSide(L, xi - 0.01)).toBe(0);
  });
  it('through a side window, only what\'s beyond it: the room\'s far side, never its near side; the passage always', () => {
    const R = L.room, kitchen = L.furniture.find((f) => f.kind === 'kitchen')!;
    expect(keep(1, R.x0)).toBe(true);
    expect(keep(1, R.x1)).toBe(false);
    expect(keep(1, kitchen.x - kitchen.hz)).toBe(false); // (the kitchen along the near wall: between you and the window)
    expect(keep(-1, R.x1)).toBe(true);
    expect(keep(-1, R.x0)).toBe(false);
    // the far wall you see is well beyond the van's far side: bigger on the inside, through the windows too
    expect(R.x0).toBeLessThan(-L.recipe.W / 2 - 1);
    for (const side of [-1, 0, 1] as const) for (const x of [L.door.x0, 0, L.door.x1]) expect(keep(side, x)).toBe(true);
    for (const x of [R.x0, R.x1]) expect(keep(0, x)).toBe(true);
  });
  it('from beside the van, a look through the doorway never crosses that side\'s plane (one draw serves both)', () => {
    const d = L.door;
    for (const ex of [-1.2, -2, -4]) for (const ez of [d.z + 0.5, d.z + 3, d.z + 9]) for (let i = 0; i <= 10; i++) {
      const px = d.x0 + ((d.x1 - d.x0) * i) / 10;
      for (let k = 1; ; k += 0.05) { // (from the door's plane on in, to the room's front)
        const x = ex + (px - ex) * k, z = ez + (d.z - ez) * k;
        if (z < L.room.z0) break;
        expect(keep(-1, x)).toBe(true);
        expect(keep(1, -x)).toBe(true); // (and from the right, mirrored)
      }
    }
  });
});

describe('the van is where you start (src/poc.ts)', () => {
  it('on by default; ?poc=0 the old start; the review tools (capture) keep the old start unless they ask', () => {
    expect(pocOn('')).toBe(true);
    expect(pocOn('?region=shore&at=40.36,-73.97')).toBe(true);
    expect(pocOn('?poc=1')).toBe(true);
    expect(pocOn('?poc=0')).toBe(false);
    expect(pocOn('?capture=1&region=shore')).toBe(false);
    expect(pocOn('?capture=1&poc=1')).toBe(true);
  });
});

describe('colour by sight: when to look again', () => {
  const v = (yaw: number, pitch = 0, x = 0, z = 0) => ({ yaw, pitch, x, z });
  it('the first look at once; then not sooner than the gap', () => {
    expect(shouldLook(null, v(0), 0)).toBe(true);
    expect(shouldLook(v(0), v(1), SIGHT.gap * 0.5)).toBe(false);
  });
  it('again once you\'ve turned or walked, or after a while standing still', () => {
    expect(shouldLook(v(0), v(SIGHT.turn * 0.5), SIGHT.gap + 0.01)).toBe(false);
    expect(shouldLook(v(0), v(SIGHT.turn * 1.5), SIGHT.gap + 0.01)).toBe(true);
    expect(shouldLook(v(3.1), v(-3.1), SIGHT.gap + 0.01)).toBe(false); // (across ±π is a small turn)
    expect(shouldLook(v(0), v(0, 0, SIGHT.move + 0.1, 0), SIGHT.gap + 0.01)).toBe(true);
    expect(shouldLook(v(0), v(0), SIGHT.idle + 0.01)).toBe(true);
  });
});

// ---- the cab and the drive (poc-van-drive)
import { buildGraph, route, lanePath, poseAt, Drive, drivable, stepWheel, wheelLock, HANDLING, type Wheel } from '../src/van/drive';
import type { Road } from '../src/world/data';

describe('the cab', () => {
  it('the driver\'s eye is in the cab, on the left, under the roof and over the dash; the door outside it', () => {
    const c = L.cab, F = L.frame;
    expect(c.eye.x).toBeLessThan(0); // (the driver's side)
    expect(c.eye.z).toBeGreaterThan(F.zHood);
    expect(c.eye.z).toBeLessThan(F.zB);
    expect(c.eye.y).toBeGreaterThan(F.hoodY + 0.3); // looking out over the hood…
    expect(c.eye.y).toBeLessThan(F.screenTopY - 0.2); // …under the windshield's head
    expect(c.door.x).toBeLessThan(-L.recipe.W / 2); // you stand outside the van to get in
    expect(Math.abs(c.door.z - c.eye.z)).toBeLessThan(1);
  });
  it('the room\'s way to the cab is in its front wall, clear to walk up to, and you come out into the room', () => {
    const w = L.cab.way;
    expect(w.z).toBeCloseTo(L.room.z0, 6);
    expect(w.x1 - w.x0).toBeGreaterThan(0.8);
    const [x, z] = moveAmong(roomSegments(L), (w.x0 + w.x1) / 2, L.room.z0 + 2, 0, -3, 0.32);
    expect(z).toBeLessThan(L.room.z0 + 0.5); // (you reach the curtain: that's the way through)
    expect(x).toBeGreaterThan(w.x0);
    const [ix, iz] = moveAmong(roomSegments(L), L.cab.into.x, L.cab.into.z, 0, 0, 0.32);
    expect(Math.hypot(ix - L.cab.into.x, iz - L.cab.into.z)).toBeLessThan(1e-6);
  });
  it('at the wheel you stay at the wheel (the seat is left by getting up, not by where you are)', () => {
    expect(nextMode('cab', 0, L.door.z + 5, L)).toBe('cab');
  });
  it('shut, the back doors are a wall', () => {
    const S = new VanSpace(roomSegments(L), L.floor, { x: 0, y: 0, z: 0, yaw: 0 });
    S.shut = [L.door.x0, L.door.z, L.door.x1, L.door.z];
    S.closed = true;
    let x = 0, z = L.room.z1 - 1;
    for (let k = 0; k < 100; k++) [x, z] = S.move(x, z, 0, 0.05, 0.32);
    expect(z).toBeLessThan(L.door.z - 0.3);
    S.closed = false;
    for (let k = 0; k < 100; k++) [x, z] = S.move(x, z, 0, 0.05, 0.32);
    expect(z).toBeGreaterThan(L.door.z);
  });
});

describe('the drive', () => {
  // a grid town: east–west residential streets every 100 m, one north–south main road (secondary, wide)
  // (the ways share their points where they cross, as the map's do)
  const roads: Road[] = [];
  const line = (pts: number[][]) => pts.flat().map((v) => v * 10);
  const steps = [-300, -200, -100, 0, 100, 200, 300];
  for (const z of steps) roads.push({ p: line(steps.map((x) => [x, z])), c: 'residential', w: 7 });
  roads.push({ p: line(steps.map((z) => [0, z])), c: 'secondary', w: 10 });
  roads.push({ p: line([[100, -300], [100, 300]]), c: 'footway', w: 2 });
  const g = buildGraph(roads);
  it('the network joins its roads where they meet, and leaves out what isn\'t for driving', () => {
    expect(drivable('footway')).toBe(false);
    expect(drivable('service')).toBe(true);
    // the main road crosses each street at a shared point
    const at00 = [...g.x].findIndex((x, i) => Math.abs(x) < 0.1 && Math.abs(g.z[i]) < 0.1);
    expect(at00).toBeGreaterThanOrEqual(0);
    expect(g.adj[at00].length).toBe(4);
    // the footway isn't in it: no edge runs north–south at x = 100
    for (let a = 0; a < g.adj.length; a++) for (const e of g.adj[a]) expect(Math.abs(g.x[a] - 100) < 0.1 && Math.abs(g.x[e.to] - 100) < 0.1 && Math.abs(g.z[a] - g.z[e.to]) > 1).toBe(false);
  });
  it('a route keeps to the roads and prefers the main road', () => {
    const r = route(g, { x: -250, z: -200 }, { x: 250, z: 200 })!;
    expect(r).not.toBeNull();
    expect(r[0].x).toBeCloseTo(-250, 3);
    expect(r[r.length - 1].x).toBeCloseTo(250, 3);
    // it runs north on the main road (x = 0) rather than zig-zagging the streets
    const onMain = r.filter((p) => Math.abs(p.x) < 0.5).length;
    expect(onMain).toBeGreaterThanOrEqual(2);
    expect(route(g, { x: -250, z: -200 }, { x: 5000, z: 5000 })).not.toBeNull(); // (the nearest point it can reach)
  });
  it('the path keeps right of the middle, rounds its corners, pulls over at the end, a point a metre', () => {
    const r = route(g, { x: -250, z: 0 }, { x: 0, z: 250 })!;
    const P = lanePath(r);
    for (let i = 1; i < P.length; i++) expect(P[i].s - P[i - 1].s).toBeLessThanOrEqual(1.0001);
    // heading east on the street at z = 0 (−z north, so right of east is +z): south of the middle
    const east = P.filter((p) => p.x < -60 && p.x > -200);
    expect(east.every((p) => p.z > 0.5 && p.z < 3.5)).toBe(true);
    // then south on the main road at x = 0 (+z is south; right of south is −x, west)
    const south = P.filter((p) => p.z < 200 && p.z > 40);
    expect(south.every((p) => p.x < -0.5 && p.x > -3.5)).toBe(true);
    // no sharp kink: the heading turns smoothly through the corner
    let worst = 0;
    for (let i = 2; i + 2 < P.length; i++) {
      const h1 = Math.atan2(P[i].x - P[i - 2].x, P[i].z - P[i - 2].z), h2 = Math.atan2(P[i + 2].x - P[i].x, P[i + 2].z - P[i].z);
      worst = Math.max(worst, Math.abs(Math.atan2(Math.sin(h2 - h1), Math.cos(h2 - h1))) / 2);
    }
    expect(worst).toBeLessThan(0.35); // (rad a metre)
    // the end: at the kerb side of the main road (10 m wide: 1.25 m in from its west edge)
    const end = P[P.length - 1];
    expect(end.x).toBeLessThan(-3.2);
    expect(end.x).toBeGreaterThan(-4.2);
  });
  it('they drive on the left where they do', () => {
    const r = route(g, { x: -250, z: 0 }, { x: -50, z: 0 })!;
    const P = lanePath(r, { driveLeft: true });
    expect(P.filter((p) => p.x > -200 && p.x < -100).every((p) => p.z < -0.5)).toBe(true);
  });
  it('speeds: no faster than the road, slower into the bend, from rest to rest', () => {
    const r = route(g, { x: -250, z: 0 }, { x: 0, z: 250 })!;
    const P = lanePath(r);
    expect(P[0].v).toBe(0);
    expect(P[P.length - 1].v).toBe(0);
    expect(Math.max(...P.map((p) => p.v))).toBeLessThanOrEqual(13.4 + 1e-9);
    const corner = P.reduce((b, p) => (Math.hypot(p.x - 1, p.z - 1) < Math.hypot(b.x - 1, b.z - 1) ? p : b));
    expect(corner.v).toBeLessThan(8);
    for (let i = 1; i < P.length; i++) {
      const ds = P[i].s - P[i - 1].s;
      expect(P[i].v ** 2 - P[i - 1].v ** 2).toBeLessThanOrEqual(2 * 1.4 * ds + 1e-6);
      expect(P[i - 1].v ** 2 - P[i].v ** 2).toBeLessThanOrEqual(2 * 2.2 * ds + 1e-6);
    }
  });
  it('out of its stall: from where the van stands along its nose, a van\'s turn onto its lane', () => {
    const start = { x: -250, z: 30, yaw: 0 }; // facing north (−z), 30 m south of the street
    const r = route(g, { x: -250, z: 25 }, { x: -100, z: 0 })!;
    const P = lanePath(r, { start });
    expect(Math.hypot(P[0].x - start.x, P[0].z - start.z)).toBeLessThan(1e-6);
    expect(P[3].z).toBeLessThan(start.z - 2); // it sets off the way it faces
  });
  it('driving it: the van rolls on to the end and stops; poseAt faces the way ahead', () => {
    const r = route(g, { x: -250, z: 0 }, { x: 0, z: 250 })!;
    const D = new Drive(lanePath(r));
    let s = 0, t = 0;
    while (!D.done && t < 300) { const p = D.step(1 / 30); expect(D.s).toBeGreaterThanOrEqual(s); s = D.s; t += 1 / 30; expect(Number.isFinite(p.x + p.z + p.yaw)).toBe(true); }
    expect(D.done).toBe(true);
    expect(D.v).toBe(0);
    expect(t).toBeLessThan(120);
    // heading east: the nose (−z in the van) points +x: yaw −π/2
    const p = poseAt(lanePath(route(g, { x: -250, z: 0 }, { x: -50, z: 0 })!), 50);
    expect(Math.cos(p.yaw)).toBeCloseTo(0, 1);
    expect(Math.sin(p.yaw)).toBeCloseTo(-1, 1);
  });
});

describe('driving it yourself (stepWheel: W/S and A/D at the wheel, or the stick on a phone)', () => {
  const run = (s: Wheel, thr: number, steer: number, secs: number, hold = false) => { let d = 0; for (let t = 0; t < secs; t += 1 / 60) d += stepWheel(s, thr, steer, 1 / 60, hold); return d; };
  it('on the pedal it pulls away like a camper and tops out, never past its top speed', () => {
    const s: Wheel = { v: 0, steer: 0, yaw: 0 };
    run(s, 1, 0, 3);
    expect(s.v).toBeGreaterThan(7.5);
    expect(s.v).toBeLessThan(11);
    run(s, 1, 0, 30);
    expect(s.v).toBeLessThanOrEqual(HANDLING.vmax);
    expect(s.v).toBeGreaterThan(HANDLING.vmax * 0.95);
    const half: Wheel = { v: 0, steer: 0, yaw: 0 }; // (the stick part way: that share of the top speed)
    run(half, 0.5, 0, 30);
    expect(half.v).toBeLessThan(HANDLING.vmax * 0.5 + 0.2);
  });
  it('the brakes stop it short, and held on past the stop they take it back, slowly', () => {
    const s: Wheel = { v: 20, steer: 0, yaw: 0 };
    let d = 0, t = 0;
    while (s.v > 0 && t < 10) { d += stepWheel(s, -1, 0, 1 / 60); t += 1 / 60; }
    expect(d).toBeLessThan(25); // (20 m/s, 45 mph, to a stop in ~22 m)
    expect(s.v).toBeGreaterThan(-0.1);
    run(s, -1, 0, 5);
    expect(s.v).toBeLessThan(-1);
    expect(s.v).toBeGreaterThanOrEqual(-HANDLING.reverse);
    run(s, 1, 0, 0.5); // (rolling back, the pedal brakes first)
    expect(s.v).toBeGreaterThan(-1);
  });
  it('let go, it coasts down to a stop; with nobody at the wheel it brakes to a stop and stays', () => {
    const s: Wheel = { v: 10, steer: 0, yaw: 0 };
    run(s, 0, 0, 2);
    expect(s.v).toBeGreaterThan(0);
    expect(s.v).toBeLessThan(9);
    run(s, 0, 0, 30);
    expect(s.v).toBe(0);
    const h: Wheel = { v: 15, steer: 0.8, yaw: 0 };
    run(h, 1, 1, 6, true); // (whatever the pedals say)
    expect(h.v).toBe(0);
    expect(Math.abs(h.steer)).toBeLessThan(0.01);
  });
  it('the wheel turns it only as it rolls, left to the left; slow, the turning circle of a van', () => {
    const s: Wheel = { v: 0, steer: 0, yaw: 0 };
    run(s, 0, 1, 2);
    expect(s.yaw).toBe(0);
    const l: Wheel = { v: 8, steer: 0, yaw: 0 };
    run(l, 0.4, 1, 1);
    expect(l.yaw).toBeGreaterThan(0); // (yaw as three.js turns it: its nose, −z, toward −x — left)
    const R = 3 / ((3 / HANDLING.wheelbase) * Math.tan(wheelLock(3))); // (at a crawl, full lock)
    expect(R).toBeGreaterThan(4.8);
    expect(R).toBeLessThan(5.5);
  });
  it('at speed it never pulls sideways harder than its grip: the view from the seat never swings hard', () => {
    for (const v of [3, 5, 8, 12, 16, 22, -4]) {
      const rate = (v / HANDLING.wheelbase) * Math.tan(wheelLock(v));
      expect(Math.abs(v * rate)).toBeLessThanOrEqual(HANDLING.grip + 1e-9);
    }
  });
});
