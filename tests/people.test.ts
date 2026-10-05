// People at arm's length (round 11's must-fix 5): shoes, rounded hands, smooth limbs in every pose,
// a dog walker whose hand holds the lead, standing weight shifts, a dog's tail carried — measured
// on the body and the pose maths the shader mirrors (src/assets/people.ts POSE_GLSL).
import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { personGeometry, personLiteGeometry, walkPose, seatPose, beachPose, downPose, skinPoint, leadHand, atWorld, MARK, JOINT, DELTOID, type Pose } from '../src/assets/people';
import { dogLib, dogMaterial, DOG_COLLAR } from '../src/assets/fauna';
import { CrowdLayer, CROWD_TIERS } from '../src/world/crowdLayer';
import { CROWD_STRIDE } from '../src/world/crowd';

const g = personGeometry();
const pos = g.getAttribute('position'), nrm = g.getAttribute('normal'), part = g.getAttribute('aPart'), sk = g.getAttribute('aSkin'), col = g.getAttribute('color'), idx = g.index!;
const N = pos.count;
const isM = (i: number, m: readonly number[]) => Math.abs(col.getX(i) - m[0]) < 0.01 && Math.abs(col.getY(i) - m[1]) < 0.01 && Math.abs(col.getZ(i) - m[2]) < 0.01;
const LIMBS = [1, 2, 5, 6];
const limb = (i: number) => LIMBS.includes(part.getX(i));
const shoeV = (i: number) => isM(i, MARK.shoe) || isM(i, MARK.sole);
const ang = (a: number[], b: number[]) => (Math.acos(Math.max(-1, Math.min(1, (a[0] * b[0] + a[1] * b[1] + a[2] * b[2]) / (Math.hypot(a[0], a[1], a[2]) * Math.hypot(b[0], b[1], b[2]) || 1)))) * 180) / Math.PI;
/** every vertex skinned to a pose: positions and normals */
const posed = (P: Pose) => {
  const p: number[][] = [], n: number[][] = [];
  for (let i = 0; i < N; i++) {
    const [q, m] = skinPoint([pos.getX(i), pos.getY(i), pos.getZ(i)], [nrm.getX(i), nrm.getY(i), nrm.getZ(i)], part.getX(i), sk.getX(i), P);
    p.push(q); n.push(m);
  }
  return { p, n };
};
const cycle = (amt: number, k = 16) => Array.from({ length: k }, (_, j) => walkPose((j / k) * Math.PI * 2, amt, j * 0.7, 3.1));
const POSES: [string, Pose][] = [
  ...cycle(1).map((P, j): [string, Pose] => [`walk ${j}`, P]),
  ...cycle(1.5).map((P, j): [string, Pose] => [`run ${j}`, P]),
  ...Array.from({ length: 12 }, (_, j): [string, Pose] => [`standing ${j}`, walkPose(0, 0, j * 4.3, 1.7)]),
  ...Array.from({ length: 8 }, (_, j): [string, Pose] => [`talking ${j}`, walkPose(0, 0, j * 1.9, 5.3, 0, 1)]),
  ...Array.from({ length: 8 }, (_, j): [string, Pose] => [`dog walker ${j}`, walkPose((j / 8) * Math.PI * 2, j % 2, j, 2.2, 0, 0, 1.2)]),
  ['seated', seatPose(3, 2, 1)],
  ...[0, 1, 2, 3, 4, 5].map((k): [string, Pose] => [`beach ${k}`, beachPose(k, 1.3, 4, 0.3)]),
  ['knocked down', downPose(-1.5)],
  ['sitting up', downPose(-2.5)],
];

describe('people at arm\'s length', () => {
  it('one indexed body within its budget (and the lite one for crowds far off)', () => {
    expect(g.index).toBeTruthy();
    expect(N).toBeLessThan(1600); // unique vertices: what the vertex shader runs per person
    expect(idx.count / 3).toBeLessThan(2700);
    expect(personLiteGeometry().getAttribute('position').count).toBeLessThan(300);
    expect(personLiteGeometry().getAttribute('aSkin')).toBeTruthy(); // (the same shader poses it)
    // every triangle faces the way its vertex normals do (nothing drawn inside out)
    for (let t = 0; t < idx.count; t += 3) {
      const [a, b, c] = [idx.getX(t), idx.getX(t + 1), idx.getX(t + 2)];
      const u = new THREE.Vector3().fromBufferAttribute(pos, b).sub(new THREE.Vector3().fromBufferAttribute(pos, a));
      const v = new THREE.Vector3().fromBufferAttribute(pos, c).sub(new THREE.Vector3().fromBufferAttribute(pos, a));
      const f = u.cross(v), s = new THREE.Vector3().fromBufferAttribute(nrm, a).add(new THREE.Vector3().fromBufferAttribute(nrm, b)).add(new THREE.Vector3().fromBufferAttribute(nrm, c));
      expect(f.dot(s)).toBeGreaterThanOrEqual(0);
    }
  });

  it('feet are shoes: ≤ 14 cm across, a shoe\'s length, and never sunk below the ground in any pose on the feet', () => {
    for (const leg of [1, 2]) {
      const b = new THREE.Box3();
      for (let i = 0; i < N; i++) if (part.getX(i) === leg && shoeV(i)) b.expandByPoint(new THREE.Vector3().fromBufferAttribute(pos, i));
      expect(b.max.x - b.min.x).toBeLessThanOrEqual(0.14);
      expect(b.max.z - b.min.z).toBeGreaterThan(0.24);
      expect(b.max.z - b.min.z).toBeLessThan(0.3);
      expect(b.min.y).toBeGreaterThanOrEqual(0);
      expect(b.max.y).toBeLessThan(0.12);
    }
    // a sole under the upper (the line that reads as a shoe, not a block)
    let soles = 0;
    for (let i = 0; i < N; i++) if (isM(i, MARK.sole)) soles++;
    expect(soles).toBeGreaterThan(40);
    // walking, running, standing, talking, leading a dog, seated, in a beach chair, on the sand, on
    // the stand: no shoe below the ground (1 mm of rounding), and in the walk one always on it
    let lowest = Infinity;
    for (const [name, P] of POSES) {
      if (/beach 1|beach 4|knocked/.test(name)) continue; // (lying down, in the air, thrown)
      const { p } = posed(P);
      let lo = Infinity;
      for (let i = 0; i < N; i++) if (shoeV(i)) lo = Math.min(lo, p[i][1]);
      lowest = Math.min(lowest, lo);
      expect(lo, name).toBeGreaterThan(-0.015);
      if (/walk|run|standing|talking|dog/.test(name)) { expect(lo, name).toBeGreaterThan(-0.002); expect(lo, name).toBeLessThan(0.004); }
    }
    console.log(`[people] lowest shoe vertex over ${POSES.length} poses: ${(lowest * 100).toFixed(2)} cm`);
  });

  it('smooth limbs: no normal break over 25° along a limb, at rest or in any pose', () => {
    // (1) coincident vertices on a limb — a hem, a seam — share their normal
    const near: [number, number][] = [];
    const key = (i: number) => `${Math.round(pos.getX(i) * 1000)},${Math.round(pos.getY(i) * 1000)},${Math.round(pos.getZ(i) * 1000)},${part.getX(i)}`;
    const at = new Map<string, number[]>();
    for (let i = 0; i < N; i++) if (limb(i)) { const k = key(i); at.set(k, [...(at.get(k) ?? []), i]); }
    for (const l of at.values()) for (let a = 0; a < l.length; a++) for (let b = a + 1; b < l.length; b++) near.push([l[a], l[b]]);
    // (2) along a limb: each ring's vertex and the next ring's at the same place round it (the
    // edges whose two normals point the same way at rest — round the ring they turn 45–51°)
    const along: [number, number][] = [];
    const seen = new Set<string>();
    for (let t = 0; t < idx.count; t += 3)
      for (const [a, b] of [[idx.getX(t), idx.getX(t + 1)], [idx.getX(t + 1), idx.getX(t + 2)], [idx.getX(t + 2), idx.getX(t)]]) {
        if (!limb(a) || part.getX(a) !== part.getX(b)) continue;
        const k = a < b ? `${a},${b}` : `${b},${a}`;
        if (seen.has(k)) continue;
        seen.add(k);
        if (ang([nrm.getX(a), nrm.getY(a), nrm.getZ(a)], [nrm.getX(b), nrm.getY(b), nrm.getZ(b)]) < 20) along.push([a, b]);
      }
    expect(along.length).toBeGreaterThan(300);
    let worst = 0, where = '';
    for (const [name, P] of [['rest', walkPose(0, 0, 0, 0, 1)] as [string, Pose], ...POSES]) {
      const { n } = posed(P);
      for (const [a, b] of [...near, ...along]) { const d = ang(n[a], n[b]); if (d > worst) { worst = d; where = name; } }
    }
    console.log(`[people] ${near.length} coincident limb pairs, ${along.length} along-limb edges: the worst normal break ${worst.toFixed(1)}° (${where})`);
    expect(worst).toBeLessThanOrEqual(25);
  });

  it('rounded hands: a palm and a thumb, smooth all round, at the end of each arm', () => {
    for (const arm of [5, 6]) {
      let n = 0;
      const dirs = new THREE.Vector3();
      for (let i = 0; i < N; i++) if (part.getX(i) === arm && isM(i, MARK.skin)) { n++; dirs.add(new THREE.Vector3(Math.sign(nrm.getX(i)), Math.sign(nrm.getY(i)), Math.sign(nrm.getZ(i)))); }
      expect(n).toBeGreaterThan(50); // (a box hand was 24)
      expect(dirs.length() / n).toBeLessThan(0.3); // normals all the way round: a closed, rounded mitten
    }
  });

  it('a dog walker\'s lead ends within 5 cm of the hand that holds it, walking and stopped', () => {
    let worst = 0;
    for (let j = 0; j < 24; j++) {
      const ph = j * 0.61, amt = j % 3 ? 1 : 0, t = j * 1.7, seed = (j % 7) * 1.37, lead = 1 + ((j % 5) - 2) * 0.1;
      const P = walkPose(ph, amt, t, seed, 0, 0, lead), { p } = posed(P);
      const h = leadHand(ph, amt, t, seed, lead);
      let d = Infinity, cx = 0, cy = 0, cz = 0, k = 0;
      for (let i = 0; i < N; i++) if (part.getX(i) === 5 && isM(i, MARK.skin)) { d = Math.min(d, Math.hypot(p[i][0] - h[0], p[i][1] - h[1], p[i][2] - h[2])); cx += p[i][0]; cy += p[i][1]; cz += p[i][2]; k++; }
      const c = Math.hypot(cx / k - h[0], cy / k - h[1], cz / k - h[2]);
      worst = Math.max(worst, d, c);
      // the arm follows the lead: the hand is out in front at the hip or above, not hanging
      expect(h[2]).toBeLessThan(-0.18);
      expect(h[1]).toBeGreaterThan(0.85);
    }
    console.log(`[people] the lead's end to the hand (surface and centre): at most ${(worst * 100).toFixed(1)} cm`);
    expect(worst).toBeLessThanOrEqual(0.05);
    // life.ts puts it in the world the way the instance matrix does
    const m = new THREE.Matrix4().compose(new THREE.Vector3(12, 1.2, -7), new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), 2.3), new THREE.Vector3(1, 1, 1));
    const h = leadHand(1, 1, 3, 2, 1.1), w = new THREE.Vector3(...h).applyMatrix4(m), a = atWorld(12, 1.2, -7, 2.3, h);
    expect(Math.hypot(w.x - a[0], w.y - a[1], w.z - a[2])).toBeLessThan(1e-6);
    // and the collar end is on the dog's neck
    const dog = dogLib(), dp = dog.getAttribute('position');
    let dc = Infinity;
    for (let i = 0; i < dp.count; i++) dc = Math.min(dc, Math.hypot(dp.getX(i) - DOG_COLLAR[0], dp.getY(i) - DOG_COLLAR[1], dp.getZ(i) - DOG_COLLAR[2]));
    expect(dc).toBeLessThan(0.06);
  });

  it('standing idles shift weight: the hips go over one foot, then the other, and the feet stay put', () => {
    let x0 = Infinity, x1 = -Infinity, bend = 0, drift = 0;
    const base = posed(walkPose(0, 0, 0, 1.7)).p;
    for (let j = 0; j < 60; j++) {
      const P = walkPose(0, 0, j * 1.3, 1.7);
      x0 = Math.min(x0, P.rt[0]); x1 = Math.max(x1, P.rt[0]);
      bend = Math.max(bend, P.lr[0] - P.lr[1], P.ll[0] - P.ll[1]);
      const { p } = posed(P);
      for (let i = 0; i < N; i++) if (shoeV(i) && isM(i, MARK.sole)) drift = Math.max(drift, Math.hypot(p[i][0] - base[i][0], p[i][2] - base[i][2]));
    }
    expect(x1 - x0).toBeGreaterThan(0.05); // the hips travel side to side
    expect(bend).toBeGreaterThan(0.15); // the free knee eases
    expect(drift).toBeLessThan(0.02); // the soles stay where they stood
    // and walking never shifts: the gait's hips stay centred
    for (const P of cycle(1)) expect(Math.abs(P.rt[0])).toBeLessThan(1e-9);
  });

  it('a walking dog carries its tail: the tip ≥ 15 cm up at every wag, the smallest dog too', () => {
    const dog = dogLib(), dp = dog.getAttribute('position'), dpart = dog.getAttribute('aPart'), piv = dog.getAttribute('aPivot');
    const m = dogMaterial(), wag = m.uniforms.uWag.value as THREE.Vector2, gait = m.uniforms.uGait.value as THREE.Vector4;
    expect(wag.x).toBeGreaterThan(0); // side to side…
    expect(gait.y).toBe(0); // …and not swung up and down (the fox's droop dragged it on the ground)
    let tipY = Infinity, n = 0;
    for (const a of [-1, -0.5, 0, 0.5, 1].map((k) => k * wag.x)) {
      // (the shader's rotY about the tail's root: dogMaterial — the walker's dog is 0.75–1.3 × this)
      const c = Math.cos(a), s = Math.sin(a);
      let far = -1, fy = 0;
      for (let i = 0; i < dp.count; i++) {
        if (dpart.getX(i) !== 5) continue;
        n++;
        const qx = dp.getX(i) - piv.getX(i), qz = dp.getZ(i) - piv.getZ(i), x = qx * c + qz * s, z = -qx * s + qz * c, y = dp.getY(i);
        const d = Math.hypot(x, y - piv.getY(i), z);
        if (d > far) { far = d; fy = y; }
      }
      tipY = Math.min(tipY, fy * 0.75);
    }
    expect(n).toBeGreaterThan(0);
    console.log(`[people] the smallest walking dog's tail tip: ${(tipY * 100).toFixed(0)} cm up`);
    expect(tipY).toBeGreaterThanOrEqual(0.15);
  });

  it('the beach crowd\'s full bodies follow how big people are on screen: a 12° lens at 50 m gets them', () => {
    // a line of bathers 5 m apart, 5 to 300 m out, all day
    const rec: number[] = [];
    for (let k = 1; k <= 60; k++) rec.push(k * 5, 0, 0, 0, 0, 1, 1, 1, 1, 0, 24);
    expect(rec.length).toBe(60 * CROWD_STRIDE);
    const L = new CrowdLayer(CROWD_TIERS.desktop);
    L.add('t', new Float32Array(rec));
    L.update(0, 0, 13, undefined, 1);
    expect(L.drawn.full).toBe(8); // nearer than 45 m at the walking lens
    L.update(0, 0, 13, undefined, Math.tan(Math.PI * 31 / 180) / Math.tan(Math.PI * 6 / 180)); // the 12° lens
    expect(L.drawn.full).toBe(51); // nearer than 45 × 5.7 m
    expect(L.drawn.full + L.drawn.lite).toBe(60); // the same people, only their bodies change
    L.update(0, 0, 13, undefined, 1);
    expect(L.drawn.full).toBe(8);
  });

  it('shoulders (round 12, must-fix 5): the deltoid rounds into the arm — from the front and the side at 1.5 m, no arm vertex above the torso\'s outline', () => {
    // the joint stands inside the torso, capped by a sphere on it
    const torsoAt = (y: number) => { // (the torso tube's half-width at the joint's height: rings 1.30 → 1.34)
      return 0.19 + ((y - 1.3) / 0.04) * 0.004;
    };
    expect(JOINT.shX).toBeLessThan(torsoAt(JOINT.shY) - 0.005);
    // a camera 1.5 m off, at 1.4 m, looking at the body: the front (−z), each side (±x)
    const VIEWS: [string, (p: number[]) => [number, number]][] = [
      ['front', (p) => { const d = p[2] + 1.5; return [p[0] / d, (p[1] - 1.4) / d]; }],
      ['right side', (p) => { const d = 1.5 - p[0]; return [p[2] / d, (p[1] - 1.4) / d]; }],
      ['left side', (p) => { const d = 1.5 + p[0]; return [-p[2] / d, (p[1] - 1.4) / d]; }],
    ];
    // the torso: the trunk's triangles below the neck (the torso tube, the neck's foot)
    const tris: number[][] = [];
    for (let t = 0; t < idx.count; t += 3) {
      const v = [idx.getX(t), idx.getX(t + 1), idx.getX(t + 2)];
      if (v.every((i) => part.getX(i) === 0 && pos.getY(i) < 1.47 && pos.getY(i) > 0.9)) tris.push(v);
    }
    expect(tris.length).toBeGreaterThan(100);
    const BIN = 0.0004; // (in the image plane at 1 m: 0.6 mm at 1.5 m)
    let worst = -Infinity, where = '', checked = 0;
    const poses: [string, Pose][] = [['rest', walkPose(0, 0, 0, 0, 1)], ...POSES.filter(([n]) => /^(walk|standing|talking|dog walker)/.test(n))];
    for (const [name, P] of poses) {
      const { p } = posed(P);
      for (const [view, proj] of VIEWS) {
        // the torso's outline: the highest point of it in each column of the image
        const top = new Map<number, number>();
        for (const v of tris) {
          const q = v.map((i) => proj(p[i]));
          const u0 = Math.min(q[0][0], q[1][0], q[2][0]), u1 = Math.max(q[0][0], q[1][0], q[2][0]);
          for (let c = Math.ceil(u0 / BIN); c * BIN <= u1; c++) {
            const u = c * BIN;
            let hi = -Infinity;
            for (let e = 0; e < 3; e++) {
              const a = q[e], b = q[(e + 1) % 3];
              if ((a[0] - u) * (b[0] - u) > 0) continue;
              const f = Math.abs(b[0] - a[0]) < 1e-12 ? 1 : (u - a[0]) / (b[0] - a[0]);
              hi = Math.max(hi, a[1] + (b[1] - a[1]) * Math.max(0, Math.min(1, f)), Math.abs(b[0] - a[0]) < 1e-12 ? Math.max(a[1], b[1]) : -Infinity);
            }
            if (hi > (top.get(c) ?? -Infinity)) top.set(c, hi);
          }
        }
        const cols = [...top.keys()], c0 = Math.min(...cols), c1 = Math.max(...cols);
        // beyond the torso's edge (and over its outermost centimetre), the shoulder's line is the torso's
        // height there: the corner where the shoulder turns down into the side
        const edge = (lo: number, hi: number) => { let m = -Infinity; for (let c = lo; c <= hi; c++) m = Math.max(m, top.get(c) ?? -Infinity); return m; };
        const span = Math.round(0.01 / 1.5 / BIN), eL = edge(c0, c0 + span), eR = edge(c1 - span, c1);
        for (let i = 0; i < N; i++) {
          if (part.getX(i) !== 5 && part.getX(i) !== 6) continue;
          if (pos.getY(i) < JOINT.shY - DELTOID - 0.02) continue; // (the shoulder: the deltoid and the arm's top, wherever the pose swings them)
          const [u, vv] = proj(p[i]), c = Math.round(u / BIN);
          // (over the torso, its own outline; its outermost centimetre — the corner where the shoulder
          // turns down into the side — and beyond, the corner's height)
          const own = top.get(c) ?? Math.max(top.get(c - 1) ?? -Infinity, top.get(c + 1) ?? -Infinity);
          const allowed = c <= c0 + span ? Math.max(eL, c >= c0 ? own : -Infinity) : c >= c1 - span ? Math.max(eR, c <= c1 ? own : -Infinity) : own;
          checked++;
          const over = (vv - allowed) * 1.5; // (metres at the body)
          if (over > worst) { worst = over; where = `${name}, ${view}, ${part.getX(i) === 5 ? 'right' : 'left'} arm`; }
        }
      }
    }
    console.log(`[people] shoulders: ${checked} arm-top vertex views over ${poses.length} poses × 3 views; the highest against the torso's outline ${(worst * 1000).toFixed(1)} mm (${where}); deltoid r ${DELTOID} m at (${JOINT.shX}, ${JOINT.shY})`);
    expect(worst).toBeLessThanOrEqual(0.001);
  });

  it('deterministic: the same body and the same pose every time', () => {
    const h = personGeometry();
    expect(Array.from(h.getAttribute('position').array)).toEqual(Array.from(pos.array));
    expect(Array.from(h.index!.array)).toEqual(Array.from(idx.array));
    expect(walkPose(1.234, 1, 56.7, 8.9, 0, 0.4, 1.1)).toEqual(walkPose(1.234, 1, 56.7, 8.9, 0, 0.4, 1.1));
  });
});
