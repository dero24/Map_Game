// Hot air balloons — a foundry family (docs/ASSET_FOUNDRY.md): recipe + seed → geometry.
//
// A ~2,800 m³ sport balloon: an envelope of gores (the vertical panels, each sewn a little
// scalloped between its load tapes), its mouth open over a burner frame, four cables down to a
// wicker basket. Real ones are ~17 m across and ~18 m tall; the pattern is the balloon's
// signature — gores in turn, horizontal bands, chevrons, harlequin diamonds — in two or three
// colours, and a crown band. The envelope has an inner skin (its own colours, darker) so from the
// basket you look up into it, the way a pilot does.
//
// Conventions: metres; y up; origin at the basket's floor (on the ground when landed); the burner
// at `burnerY`. Vertex colour, no tint: a balloon wears its own colours (the brush chooses them).
import * as THREE from 'three';
import { makeRng } from '../core/rng';
import { part, merge, box } from './core';

export type BalloonPattern = 'gores' | 'bands' | 'chevron' | 'harlequin';
export const BALLOON_PATTERNS: BalloonPattern[] = ['gores', 'bands', 'chevron', 'harlequin'];
/** The colours balloons fly in (the ambient ones pick from these; the brush may choose any). */
export const BALLOON_COLORS = [0xd8412f, 0xf2b632, 0x2f6fb5, 0x3f9a5c, 0xf4f1ea, 0x7b3f9e, 0xe8702a, 0x1f2a44, 0xe86a92, 0x33a3b8];
export interface BalloonRecipe {
  seed: number;
  R: number; // envelope's widest radius (m)
  H: number; // envelope height, mouth to crown (m)
  gores: number; // panels round the envelope
  pattern: BalloonPattern;
  colors: [number, number, number];
}
/** The size and look of balloon `seed`; `colors` (1–3) overrides its paint (the brush). */
export function balloonRecipe(seed = 1, colors?: number[], pattern?: BalloonPattern): BalloonRecipe {
  const r = makeRng(seed * 7919 + 17);
  const R = 8.2 + r.float() * 0.9, H = R * (2.05 + r.float() * 0.12);
  const gores = r.float() < 0.5 ? 12 : 16;
  const pat = pattern ?? BALLOON_PATTERNS[Math.floor(r.float() * BALLOON_PATTERNS.length)];
  const pick = () => BALLOON_COLORS[Math.floor(r.float() * BALLOON_COLORS.length)];
  const a = pick();
  let b = pick();
  if (b === a) b = BALLOON_COLORS[(BALLOON_COLORS.indexOf(a) + 3) % BALLOON_COLORS.length];
  let c = pick();
  if (c === a || c === b) c = 0xf4f1ea;
  const cs = colors?.length ? [colors[0], colors[1] ?? colors[0], colors[2] ?? colors[1] ?? colors[0]] : [a, b, c];
  return { seed, R, H, gores, pattern: pat, colors: cs as [number, number, number] };
}

// The envelope's profile (radius share, height share): the narrow mouth, the shoulder at ~60%,
// the round crown.
const PROFILE: [number, number][] = [[0.24, 0], [0.34, 0.07], [0.6, 0.2], [0.86, 0.37], [0.99, 0.54], [0.98, 0.68], [0.88, 0.8], [0.68, 0.9], [0.4, 0.965], [0.05, 1]];
export const BASKET = { w: 1.35, h: 1.1 };
const MOUTH_GAP = 3.2; // basket top to the mouth (the burner frame hangs between)

export interface BalloonParts { geo: THREE.BufferGeometry; burnerY: number; mouthY: number; topY: number }
export function balloonGeometry(rc: BalloonRecipe): BalloonParts {
  const { R, H, gores, colors } = rc;
  const y0 = BASKET.h + MOUTH_GAP;
  const parts: THREE.BufferGeometry[] = [];
  // envelope: each gore two facets wide, its middle bellied out between the tapes (the scallop)
  const sub = 2, seg = gores * sub, rings = PROFILE.length - 1;
  const outP: number[] = [], outC: number[] = [], inP: number[] = [], inC: number[] = [];
  const col = new THREE.Color();
  const colorOf = (k: number, i: number) => {
    const crown = i >= rings - 2, t = i / rings;
    switch (rc.pattern) {
      case 'gores': return crown ? colors[2] : colors[k % 2];
      case 'bands': return crown ? colors[2] : colors[Math.floor(t * 6) % 2 === 0 ? 0 : 1];
      case 'chevron': return crown ? colors[0] : colors[(k + Math.floor(t * 5)) % 3];
      default: return crown ? colors[2] : colors[(k + i) % 2];
    }
  };
  const pt = (s: number, i: number): [number, number, number] => {
    const [rf, yf] = PROFILE[i];
    const a = (s / seg) * Math.PI * 2, belly = s % sub ? 1.035 : 1; // (mid-gore bellies out)
    const rr = R * rf * (i === 0 || i === rings ? 1 : belly);
    return [Math.cos(a) * rr, y0 + yf * H, Math.sin(a) * rr];
  };
  for (let s = 0; s < seg; s++)
    for (let i = 0; i < rings; i++) {
      const A = pt(s, i), B = pt(s + 1, i), C = pt(s + 1, i + 1), D = pt(s, i + 1);
      outP.push(...A, ...C, ...B, ...A, ...D, ...C);
      inP.push(...A, ...B, ...C, ...A, ...C, ...D);
      col.setHex(colorOf(Math.floor(s / sub), i));
      for (let v = 0; v < 6; v++) outC.push(col.r, col.g, col.b);
      col.multiplyScalar(0.62); // the inside, in the envelope's own shade
      for (let v = 0; v < 6; v++) inC.push(col.r, col.g, col.b);
    }
  for (const [P, C] of [[outP, outC], [inP, inC]] as const) {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(C, 3));
    g.computeVertexNormals();
    g.setAttribute('aPart', new THREE.Float32BufferAttribute(new Float32Array(P.length / 3), 1));
    parts.push(g);
  }
  // the skirt's rim (a darker scoop round the mouth)
  parts.push(part(new THREE.CylinderGeometry(R * PROFILE[0][0] * 1.02, R * PROFILE[0][0] * 1.02, 0.35, seg, 1, true).translate(0, y0 + 0.17, 0), 0x2a2830));
  // basket: wicker, a leather-bound rim, open on top
  const w = BASKET.w, h = BASKET.h;
  parts.push(part(box(w, 0.08, w, 0, 0.04, 0), 0x6e5232));
  for (const [x, z, sw, sd] of [[0, w / 2, w, 0.08], [0, -w / 2, w, 0.08], [w / 2, 0, 0.08, w], [-w / 2, 0, 0.08, w]] as const)
    parts.push(part(box(sw, h, sd, x, h / 2, z), 0x9a7447));
  for (const [x, z, sw, sd] of [[0, w / 2, w + 0.1, 0.14], [0, -w / 2, w + 0.1, 0.14], [w / 2, 0, 0.14, w + 0.1], [-w / 2, 0, 0.14, w + 0.1]] as const)
    parts.push(part(box(sw, 0.12, sd, x, h, z), 0x4a3422));
  // burner frame, the burner, and the cables from the basket's corners to the mouth's load ring
  const by = h + 1.6;
  parts.push(part(box(0.9, 0.08, 0.9, 0, by - 0.35, 0), 0x55585e), part(new THREE.CylinderGeometry(0.2, 0.26, 0.5, 8).translate(0, by, 0), 0x8b8f96));
  const mr = R * PROFILE[0][0];
  for (const [sx, sz] of [[1, 1], [1, -1], [-1, 1], [-1, -1]]) {
    const a = new THREE.Vector3((sx * w) / 2, h, (sz * w) / 2), b = new THREE.Vector3(sx * mr * 0.707, y0, sz * mr * 0.707);
    const len = a.distanceTo(b), mid = a.clone().add(b).multiplyScalar(0.5);
    const c = new THREE.CylinderGeometry(0.025, 0.025, len, 4);
    c.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), b.clone().sub(a).normalize()));
    parts.push(part(c.translate(mid.x, mid.y, mid.z), 0x2a2830));
  }
  return { geo: merge(parts), burnerY: by, mouthY: y0, topY: y0 + H };
}

/** The burner's flame: a tall blue-cored orange tongue up into the mouth (scaled by the burner's
 *  roar; the glow channel lights it at night). */
export function flameGeometry(): THREE.BufferGeometry {
  return merge([
    part(new THREE.ConeGeometry(0.32, 2.4, 8, 1, true).translate(0, 1.2, 0), 0xffb13d, 3),
    part(new THREE.ConeGeometry(0.15, 1.3, 6, 1, true).translate(0, 0.65, 0), 0x6fb8ff, 3),
  ]);
}
