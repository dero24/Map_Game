// Fauna — small animals built from one quadruped/bird skeleton (docs/ASSET_FOUNDRY.md §Fauna).
//
// Each species is a handful of parameters over a shared body plan (torso, head, limbs, tail,
// wings), in the Spore / No Man's Sky spirit: one tested skeleton, many animals. Limbs, tail,
// head and wings carry an `aPart` and an `aPivot` (the joint they swing about), and the critter
// material animates them in the vertex shader from a per-instance `aAnim` (gait phase, gait
// amount, pose) — no skinning, no rigs, one instanced draw per species.
import * as THREE from 'three';
import { P, part, merge, limb, blob, card, cached } from './core';
import { paintMaterial } from '../render/shared';

export type CritterKind = 'squirrel' | 'rabbit' | 'songbird' | 'sandpiper' | 'deer' | 'butterfly' | 'firefly';
export const CRITTERS: CritterKind[] = ['squirrel', 'rabbit', 'songbird', 'sandpiper', 'deer', 'butterfly', 'firefly'];
export const CRITTER_NAME: Record<CritterKind, string> = { squirrel: 'squirrel', rabbit: 'rabbit', songbird: 'songbird', sandpiper: 'sandpiper', deer: 'white-tailed deer', butterfly: 'butterfly', firefly: 'firefly' };

const V3 = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);
// a part that swings about `pivot`
function jointed(g: THREE.BufferGeometry, hex: number, id: number, pivot: THREE.Vector3) {
  const p = part(g, hex, id);
  const n = p.attributes.position.count, a = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) a.set([pivot.x, pivot.y, pivot.z], i * 3);
  p.setAttribute('aPivot', new THREE.BufferAttribute(a, 3));
  return p;
}
const still = (g: THREE.BufferGeometry, hex: number, id: number = P.body) => jointed(g, hex, id, V3(0, 0, 0));

/** Build one animal (front toward −z, feet at y = 0). Colours: TINT-free — each species has its own coat. */
export function critterGeometry(kind: CritterKind): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  if (kind === 'squirrel' || kind === 'rabbit' || kind === 'deer') {
    const sq = kind === 'squirrel', rb = kind === 'rabbit';
    const S = sq ? 0.2 : rb ? 0.3 : 1.55; // body length
    const coat = sq ? 0x8a8580 : rb ? 0x8f7a62 : 0x9a7654;
    const belly = sq ? 0xe8e2d6 : rb ? 0xe2d8c8 : 0xe4dccc;
    const legH = sq ? 0.07 : rb ? 0.1 : 0.85;
    const bodyY = legH + S * (sq ? 0.2 : rb ? 0.22 : 0.18);
    const bs = kind === 'deer' ? [0.34, 0.42, 0.88] : [0.62, 0.62, 1];
    parts.push(still(blob(S * 0.5, 3, { lump: 0.08, squash: 1 }).scale(bs[0], bs[1], bs[2]).translate(0, bodyY, 0), coat));
    parts.push(still(blob(S * 0.3, 4, { lump: 0.05, detail: 0 }).scale(bs[0] * 1.2, 0.5, bs[2]).translate(0, bodyY - S * (kind === 'deer' ? 0.1 : 0.14), -S * 0.02), belly));
    // head on a neck (deer), or straight on the shoulders
    const neck = V3(0, bodyY + (kind === 'deer' ? 0.35 : S * 0.12), -S * 0.42);
    const hr = sq ? 0.055 : rb ? 0.075 : 0.2;
    const head = V3(0, neck.y + (kind === 'deer' ? 0.32 : 0.02), neck.z - (kind === 'deer' ? 0.18 : 0.04));
    if (kind === 'deer') parts.push(jointed(limb(V3(0, bodyY + 0.1, -S * 0.38), head, 0.13, 0.09, 6), coat, P.skull, neck));
    parts.push(jointed(blob(hr, 5, { lump: 0.05, detail: 1 }).scale(0.85, 0.85, kind === 'deer' ? 1.5 : 1.15).translate(head.x, head.y, head.z), coat, P.skull, neck));
    parts.push(jointed(new THREE.SphereGeometry(hr * 0.35, 5, 4).translate(0, head.y - hr * 0.15, head.z - hr * (kind === 'deer' ? 1.55 : 1.05)), 0x2a2622, P.skull, neck)); // nose
    for (const s of [-1, 1]) {
      // ears: rabbits long, squirrels tufted, deer broad
      const eh = rb ? 0.14 : sq ? 0.035 : 0.16, ew = rb ? 0.03 : sq ? 0.018 : 0.07;
      const ear = new THREE.ConeGeometry(ew, eh, 5).rotateZ(-s * (rb ? 0.15 : 0.5)).translate(s * hr * 0.55, head.y + hr * 0.7 + eh / 2, head.z + hr * 0.2);
      parts.push(jointed(ear, coat, P.skull, neck));
      parts.push(jointed(new THREE.SphereGeometry(hr * 0.13, 4, 3).translate(s * hr * 0.55, head.y + hr * 0.25, head.z - hr * 0.6), 0x1a1614, P.skull, neck)); // eyes
      // legs: fore at the shoulder, hind at the hip
      const lr = sq ? 0.014 : rb ? 0.02 : 0.045;
      const fz = -S * 0.3, hz = S * 0.3;
      const fx = s * S * (kind === 'deer' ? 0.09 : 0.17), hx = s * S * (rb ? 0.2 : kind === 'deer' ? 0.1 : 0.18);
      parts.push(jointed(limb(V3(fx, bodyY, fz), V3(fx, 0, fz - (sq ? 0.01 : 0)), lr * 1.3, lr, 5), kind === 'deer' ? 0x7a5c40 : coat, P.fore, V3(fx, bodyY, fz)));
      const hip = V3(hx, bodyY + (rb ? 0.02 : 0), hz);
      if (rb || sq) {
        // folded haunch: a thigh blob plus a long foot along the ground
        parts.push(jointed(blob(S * (rb ? 0.2 : 0.17), 9, { detail: 0, lump: 0.05 }).translate(hip.x, hip.y - S * 0.08, hip.z), coat, P.hind, hip));
        parts.push(jointed(card(lr * 3, S * 0.36, 0, 1).rotateY(Math.PI).translate(hip.x, 0.012, hip.z + S * 0.12), coat, P.hind, hip));
      } else parts.push(jointed(limb(hip, V3(hx, 0, hz + 0.05), lr * 1.4, lr, 5), 0x7a5c40, P.hind, hip));
    }
    // tails: squirrel = a tall bushy S of blobs, rabbit = a cotton puff, deer = a white flag
    const tb = V3(0, bodyY + S * 0.05, S * 0.48);
    if (sq) {
      const pts = [V3(0, 0.02, 0.06), V3(0, 0.13, 0.1), V3(0, 0.24, 0.07), V3(0, 0.3, 0.0)];
      pts.forEach((q, i) => parts.push(jointed(blob(0.055 - i * 0.004, 20 + i, { detail: 0, lump: 0.4 }).translate(tb.x + q.x, tb.y + q.y, tb.z + q.z), 0x9a948c, P.tail, tb)));
    } else if (rb) parts.push(jointed(blob(0.045, 21, { detail: 0 }).translate(tb.x, tb.y + 0.02, tb.z + 0.02), 0xf2eee6, P.tail, tb));
    else parts.push(jointed(card(0.12, 0.22, -0.3, 2).rotateX(-2.3).translate(tb.x, tb.y, tb.z), 0xf2eee6, P.tail, tb));
    if (kind === 'deer') parts.push(jointed(blob(0.1, 22, { detail: 0 }).scale(1, 0.6, 1.2).translate(0, bodyY + 0.02, S * 0.46), 0xf2eee6, P.tail, tb)); // rump patch
  } else if (kind === 'songbird' || kind === 'sandpiper') {
    const sp = kind === 'sandpiper';
    const coat = sp ? 0xa89a86 : 0xffffff, belly = sp ? 0xf2eee6 : 0xe4d6c0; // songbirds: TINT coat, painted per bird
    const legH = sp ? 0.06 : 0.025;
    const by = legH + 0.045;
    parts.push(still(blob(0.055, 30, { lump: 0.06 }).scale(0.8, 0.75, 1.25).translate(0, by, 0), coat));
    parts.push(still(blob(0.04, 31, { detail: 0 }).scale(0.8, 0.7, 1.1).translate(0, by - 0.02, -0.01), belly));
    const neck = V3(0, by + 0.02, -0.05);
    parts.push(jointed(blob(0.032, 32, { detail: 0, lump: 0.04 }).translate(0, by + 0.045, -0.07), coat, P.skull, neck));
    parts.push(jointed(new THREE.ConeGeometry(0.008, sp ? 0.05 : 0.022, 4).rotateX(-Math.PI / 2).translate(0, by + 0.04, sp ? -0.12 : -0.105), sp ? 0x2a2622 : 0xd8a040, P.skull, neck));
    parts.push(still(card(0.05, 0.07, -0.05, 1).translate(0, by + 0.01, 0.04), coat, P.tail));
    for (const s of [-1, 1]) {
      const sh = V3(s * 0.03, by + 0.02, -0.02);
      parts.push(jointed(card(0.05, 0.085, 0.1, 2).rotateY(s * Math.PI / 2).translate(sh.x, sh.y, sh.z), coat, P.wing, sh));
      parts.push(jointed(limb(V3(s * 0.012, by - 0.02, 0.005), V3(s * 0.012, 0, -0.005), 0.004, 0.003, 3), sp ? 0x3a3530 : 0x6a5040, P.fore, V3(s * 0.012, by - 0.02, 0)));
      parts.push(still(new THREE.SphereGeometry(0.006, 4, 3).translate(s * 0.02, by + 0.055, -0.085), 0x121010, P.skull));
    }
  } else if (kind === 'butterfly') {
    parts.push(still(new THREE.CylinderGeometry(0.004, 0.003, 0.035, 4).rotateX(Math.PI / 2), 0x2a2622));
    for (const s of [-1, 1]) {
      const root = V3(0, 0, 0);
      parts.push(jointed(card(0.05, 0.045, 0, 1).rotateY(s * Math.PI / 2).translate(0, 0, -0.008), 0xffffff, P.wing, root));
      parts.push(jointed(card(0.035, 0.03, 0, 1).rotateY(s * Math.PI / 2 + s * 0.6).translate(0, 0, 0.01), 0xffffff, P.wing, root));
    }
  } else if (kind === 'firefly') {
    parts.push(still(new THREE.SphereGeometry(0.012, 5, 4).scale(0.8, 0.7, 1.3), 0x2a2622));
    parts.push(jointed(new THREE.SphereGeometry(0.018, 6, 5).translate(0, 0, 0.012), 0xfff2a0, P.head, V3(0, 0, 0)));
  }
  return merge(parts);
}
export const critterLib = (k: CritterKind) => cached(`critter:${k}`, () => critterGeometry(k));

// Per-species animation constants: x hind-leg phase offset (bound 0.5π, walk π), y tail swing,
// z wing flap, w head bob.
// Limb swing amplitude (radians at full gait) per species.
export const LIMB: Record<CritterKind, number> = { squirrel: 0.9, rabbit: 0.85, songbird: 0.4, sandpiper: 0.55, deer: 0.38, butterfly: 0, firefly: 0 };
export const GAIT: Record<CritterKind, [number, number, number, number]> = {
  squirrel: [0.5, 0.5, 0, 0.25], rabbit: [0.3, 0.2, 0, 0.2], songbird: [0, 0.3, 1.2, 0.5], sandpiper: [3.14, 0.2, 1.1, 0.35],
  deer: [3.14, 0.4, 0, 0.12], butterfly: [0, 0, 1.3, 0], firefly: [0, 0, 0, 0],
};

/** Painted material for critters: vertex-animated joints driven by the instanced aAnim (phase, amount, pose). */
export function critterMaterial(kind: CritterKind) {
  const g = GAIT[kind];
  return paintMaterial({
    uniforms: { uGait: { value: new THREE.Vector4(...g) }, uLimb: { value: LIMB[kind] } },
    vertex: /* glsl */ `
      attribute vec3 color;
      attribute float aPart;
      attribute vec3 aPivot;
      attribute vec3 aAnim; // x gait phase (cycles), y gait amount 0..1, z pose (0 idle, 1 moving, 2 flying/climbing, 3 glowing)
      uniform vec4 uGait;
      uniform float uLimb;
      varying vec3 vColor;
      varying float vGlow;
      mat3 rotX(float a) { float c = cos(a), s = sin(a); return mat3(1.0, 0.0, 0.0, 0.0, c, s, 0.0, -s, c); }
      mat3 rotZ(float a) { float c = cos(a), s = sin(a); return mat3(c, s, 0.0, -s, c, 0.0, 0.0, 0.0, 1.0); }
      void main() {
        vec3 p = position;
        float ph = aAnim.x * 6.2831853, amt = aAnim.y;
        float idle = 1.0 - clamp(amt * 3.0, 0.0, 1.0);
        vec3 q = p - aPivot;
        if (aPart > 0.5 && aPart < 1.5) q = rotX(sin(ph) * uLimb * amt) * q;                       // fore limbs
        else if (aPart > 1.5 && aPart < 2.5) q = rotX(sin(ph + uGait.x) * uLimb * amt) * q;        // hind limbs
        else if (aPart > 4.5 && aPart < 5.5) q = rotX(sin(ph * 0.5) * uGait.y * (0.3 + amt) + sin(uTime * 3.1 + aAnim.x * 9.0) * 0.12 * idle) * q; // tail
        else if (aPart > 5.5 && aPart < 6.5) q = rotX((0.5 + 0.5 * sin(uTime * 2.3 + aAnim.x * 17.0)) * uGait.w * idle * step(0.5, fract(uTime * 0.21 + aAnim.x * 3.7)) + sin(ph) * 0.06 * amt) * q; // head: grazing / pecking bobs
        else if (aPart > 6.5 && aPart < 7.5) {                                                  // wings
          // flying: a fast flap; perched: folded down along the body (butterflies rest wings-up)
          float flap = aAnim.z > 1.5 ? sin(uTime * 38.0 + aAnim.x * 20.0) * uGait.z : (uGait.z > 1.25 ? 1.2 : -1.25 + sin(uTime * 2.0 + aAnim.x * 11.0) * 0.05);
          q = rotZ(sign(q.x + 1e-4) * flap) * q;
        }
        p = q + aPivot;
        vGlow = aPart > 2.5 && aPart < 3.5 ? step(2.5, aAnim.z) * smoothstep(0.2, 1.0, sin(uTime * 2.2 + aAnim.x * 31.0)) : 0.0;
        mat4 m = worldMat();
        vec4 wp = m * vec4(p, 1.0);
        vWorldPos = wp.xyz + uWorldOffset;
        vNormalW = normalize(mat3(m) * normal);
        vColor = color;
        #ifdef USE_INSTANCING_COLOR
          float tintable = step(0.98, min(color.r, min(color.g, color.b)));
          vColor = mix(color, instanceColor, tintable);
        #endif
        gl_Position = projectionMatrix * viewMatrix * wp;
      }`,
    fragment: /* glsl */ `
      varying vec3 vColor;
      varying float vGlow;
      void main() {
        vec3 N = normalize(vNormalW);
        vec3 alb = pigment(vColor, vWorldPos);
        vec3 col = paintLight(alb, N, vWorldPos, shadowAt(vWorldPos, N), 1.0);
        col += vec3(1.0, 0.92, 0.45) * vGlow * 3.0;
        gl_FragColor = vec4(applyFog(col, vWorldPos), 1.0);
      }`,
  });
}
