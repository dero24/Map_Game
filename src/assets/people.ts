// People: one jointed body for every walker and resident, varied in the shader so a single
// instanced draw carries a whole crowd (see docs/ASSET_FOUNDRY.md, Families → People).
//
// The body is built once; what changes per person is chosen per instance on the GPU:
//   · skin, hair and trouser colours come from palettes (marker vertex colours below),
//   · one of five hairstyles (short, long, bun, cap, cropped) — the others collapse away,
//   · shorts or trousers, short or long sleeves — by the region's warmth (climate × season),
//   · the shirt is the instance colour (white = TINT), exactly like every other foundry asset.
// Joints: hips at 0.86 m, knees at 0.47 m, shoulders at 1.39 m — the LEGS gait in
// creatureMaterial (src/sim/life.ts) swings thighs about the hip, flexes the knee on the
// forward swing and counter-swings the arms. Front toward −z; origin on the ground.
import * as THREE from 'three';
import { part, merge, box, lathe, TINT, cached } from './core';

// Marker colours (linear, exact): the shader swaps them for a palette entry per person.
export const MARK = {
  skin: [1, 0, 1],
  hair: [0, 1, 1],
  pants: [1, 1, 0],
  shin: [1, 0, 0], // trousers, or skin when wearing shorts
  forearm: [0, 0, 1], // shirt, or skin when in short sleeves
} as const;
// Parts: 0 body · 1/2 right/left leg · 5/6 right/left arm · 9 hair (short/long/bun) ·
// 10 long hair · 11 bun · 12 baseball cap · 13 cropped. The shader collapses what isn't worn.
export const HAIRSTYLES = ['short', 'long', 'bun', 'cap', 'cropped'] as const;
const HAIR_PART0 = 9;
const lim = (a: THREE.Vector3, b: THREE.Vector3, r0: number, r1: number) => {
  // open-ended limbs: every end is buried in a joint, hand, shoe or the torso (saves a third)
  const d = new THREE.Vector3().subVectors(b, a), L = d.length();
  const g = new THREE.CylinderGeometry(r1, r0, L, 5, 1, true).translate(0, L / 2, 0);
  g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.normalize()));
  return g.translate(a.x, a.y, a.z);
};

export const SKIN_TONES = [0x8d5524, 0xc68642, 0xe0ac69, 0xf1c27d, 0xffdbac, 0x5c3a21, 0xa86b3c, 0xeac096];
export const HAIR_COLOURS = [0x1c1612, 0x3b2a1e, 0x6a4a2c, 0xa8814f, 0x8a8a86, 0x2a1d17, 0xc9a36b, 0x4a3426];
export const TROUSERS = [0x2e3a52, 0x3b4454, 0x5a5e64, 0xc9b99a, 0x2a2c30, 0x6b5a45, 0x46566e, 0x8c7a5c];

function mark(g: THREE.BufferGeometry, rgb: readonly number[], id: number) {
  const geo = part(g, 0, id);
  const c = geo.getAttribute('color') as THREE.BufferAttribute;
  for (let i = 0; i < c.count; i++) c.setXYZ(i, rgb[0], rgb[1], rgb[2]);
  return geo;
}
const v = (x: number, y: number, z = 0) => new THREE.Vector3(x, y, z);

/** The shared body (≈1.75 m). */
export function personGeometry() {
  const parts: THREE.BufferGeometry[] = [];
  // Proportions of a ~1.72 m adult (about 7½ heads): hip joint 0.86, knee 0.47, waist 1.02,
  // shoulders 1.39, chin 1.49, crown 1.72 — legs just under half the height, a real chest, a
  // head big enough to read at 20 m (a pin head on long legs read as a stick figure).
  for (const s of [1, -1]) {
    const leg = s > 0 ? 1 : 2, arm = s > 0 ? 5 : 6, x = 0.092 * s;
    parts.push(mark(lim(v(x, 0.87), v(x, 0.47), 0.085, 0.062), MARK.pants, leg)); // thigh
    parts.push(mark(lim(v(x, 0.47), v(x, 0.075, 0.01), 0.058, 0.042), MARK.shin, leg)); // shin
    parts.push(part(box(0.095, 0.07, 0.22, x, 0.035, -0.03), 0x2a2622, leg)); // shoe
    parts.push(part(lim(v(0.2 * s, 1.39), v(0.235 * s, 1.12, 0.01), 0.058, 0.048), TINT, arm)); // upper arm
    parts.push(mark(lim(v(0.235 * s, 1.12, 0.01), v(0.245 * s, 0.88, -0.02), 0.045, 0.035), MARK.forearm, arm)); // forearm
    parts.push(mark(box(0.07, 0.1, 0.08, 0.248 * s, 0.83, -0.02), MARK.skin, arm)); // hand
  }
  // hips (trousers) and torso (shirt): turned, then flattened front-to-back
  parts.push(mark(lathe([[0.001, 0.8], [0.158, 0.81], [0.178, 0.88], [0.172, 0.99]], 7).scale(1, 1, 0.66), MARK.pants, 0));
  parts.push(part(lathe([[0.172, 0.97], [0.16, 1.05], [0.188, 1.25], [0.207, 1.37], [0.15, 1.44], [0.001, 1.46]], 7).scale(1, 1, 0.66), TINT, 0));
  parts.push(mark(lim(v(0, 1.42), v(0, 1.52), 0.052, 0.048), MARK.skin, 0)); // neck
  parts.push(mark(new THREE.SphereGeometry(1, 7, 5).scale(0.1, 0.12, 0.11).translate(0, 1.6, 0), MARK.skin, 0)); // head
  parts.push(mark(box(0.03, 0.04, 0.03, 0, 1.585, -0.11), MARK.skin, 0)); // nose: gives the face a direction
  // a face: eyes, brows (in the hair colour) and a mouth — flat cards just proud of the head, so a
  // face reads up close (a café table, a doorway) and costs thirty vertices
  const card = (w: number, h: number, x: number, y: number, z: number) => new THREE.PlaneGeometry(w, h).rotateY(Math.PI).translate(x, y, z);
  for (const s of [1, -1]) {
    parts.push(part(card(0.026, 0.018, 0.036 * s, 1.617, -0.1045), 0x1d1a18, 0)); // eye
    parts.push(mark(card(0.036, 0.009, 0.037 * s, 1.643, -0.1035), MARK.hair, 0)); // brow
  }
  parts.push(part(card(0.042, 0.011, 0, 1.553, -0.1045), 0x8a3f3a, 0)); // mouth
  // hairstyles: a crown over the top, and the back and sides down to the nape — open at the front,
  // so the hairline sits above the brows instead of a helmet over the eyes
  const cap = (id: number, sy = 0.13, segs = 7) => {
    const crown = new THREE.SphereGeometry(1, segs, 2, 0, Math.PI * 2, 0, Math.PI * 0.34);
    const back = new THREE.SphereGeometry(1, segs, 2, Math.PI * 1.5 + 0.6, Math.PI * 2 - 1.2, Math.PI * 0.34, Math.PI * 0.22);
    return mark(merge([crown, back].map((g) => g.toNonIndexed())).scale(0.109, sy, 0.12).translate(0, 1.605, 0.01), MARK.hair, id);
  };
  parts.push(cap(HAIR_PART0)); // shared by short, long and bun
  parts.push(mark(box(0.2, 0.27, 0.07, 0, 1.49, 0.08), MARK.hair, HAIR_PART0 + 1)); // long
  parts.push(mark(new THREE.SphereGeometry(0.054, 5, 3).translate(0, 1.675, 0.105), MARK.hair, HAIR_PART0 + 2)); // bun
  parts.push(
    part(new THREE.SphereGeometry(1, 7, 3, 0, Math.PI * 2, 0, Math.PI * 0.5).scale(0.114, 0.105, 0.124).translate(0, 1.63, 0.005), 0xf2efe6, HAIR_PART0 + 3),
    part(box(0.17, 0.016, 0.11, 0, 1.632, -0.13), 0xf2efe6, HAIR_PART0 + 3),
  ); // cap (the shader tints it from the trouser palette so caps vary)
  parts.push(cap(HAIR_PART0 + 4, 0.11, 6)); // cropped
  const g = merge(parts);
  g.computeBoundingSphere();
  return g;
}
export const personLib = () => cached('person', personGeometry);

// sat < 1 calms a palette in the painted world (skin at full chroma read as orange)
const lin = (hex: number, sat = 1) => { const c = new THREE.Color(hex), hsl = { h: 0, s: 0, l: 0 }; c.getHSL(hsl); c.setHSL(hsl.h, hsl.s * sat, hsl.l); return `vec3(${c.r.toFixed(4)}, ${c.g.toFixed(4)}, ${c.b.toFixed(4)})`; };
const arr = (name: string, hexes: number[], sat = 1) => `const vec3 ${name}[${hexes.length}] = vec3[${hexes.length}](${hexes.map((h) => lin(h, sat)).join(', ')});`;

/** Vertex-shader chunk (inside main, after `vec3 p = position;`, before the gait): picks this
 *  person's look and rewrites `p` (hairstyle) and `pc` (the vertex colour to use). Needs
 *  `uniform float uWarmth;` and the arrays from PEOPLE_GLSL_DECL. `seed` is a float per person. */
export const PEOPLE_GLSL_DECL = /* glsl */ `
uniform float uWarmth;
${arr('SKIN', SKIN_TONES, 0.72)}
${arr('HAIRC', HAIR_COLOURS)}
${arr('PANTS', TROUSERS)}
float pHash(float n) { return fract(sin(n * 12.9898 + 4.1414) * 43758.5453); }
bool isMark(vec3 c, vec3 m) { return all(lessThan(abs(c - m), vec3(0.01))); }
`;
export const PEOPLE_GLSL_MAIN = /* glsl */ `
  {
    float r1 = pHash(seed), r2 = pHash(seed + 1.7), r3 = pHash(seed + 3.1), r4 = pHash(seed + 5.3), r5 = pHash(seed + 7.9);
    float style = floor(r2 * ${HAIRSTYLES.length}.0);
    // hair parts: 9 base (styles 0–2) · 10 long (1) · 11 bun (2) · 12 cap (3) · 13 cropped (4)
    if (aPart > ${HAIR_PART0 - 0.5}) {
      float hp = aPart - ${HAIR_PART0}.0;
      bool worn = hp < 0.5 ? style < 2.5 : abs(hp - style) < 0.5;
      if (!worn) p = vec3(0.0, 1.58, 0.0);
    }
    vec3 skin = SKIN[int(r1 * ${SKIN_TONES.length}.0)];
    vec3 hair = HAIRC[int(r3 * ${HAIR_COLOURS.length}.0)];
    vec3 pants = PANTS[int(r4 * ${TROUSERS.length}.0)];
    bool shorts = r5 < uWarmth * 0.75;
    bool shortSleeves = fract(r5 * 7.13) < uWarmth;
    if (isMark(pc, vec3(${MARK.skin.join('.0, ')}.0))) pc = skin;
    else if (isMark(pc, vec3(${MARK.hair.join('.0, ')}.0))) pc = hair;
    else if (isMark(pc, vec3(${MARK.pants.join('.0, ')}.0))) pc = pants;
    else if (isMark(pc, vec3(${MARK.shin.join('.0, ')}.0))) pc = shorts ? skin : pants;
    else if (isMark(pc, vec3(${MARK.forearm.join('.0, ')}.0))) pc = shortSleeves ? skin : vec3(1.0);
    else if (aPart > ${HAIR_PART0 + 2.5} && aPart < ${HAIR_PART0 + 3.5}) pc = PANTS[int(fract(r4 * 3.7) * ${TROUSERS.length}.0)] * 1.4;
  }
`;

/** How warmly a region dresses right now: 0 (winter coats) … 1 (beach). */
export function warmthFor(climate: string, month: number, south = false) {
  const base: Record<string, number> = { tropical: 0.9, arid: 0.65, mediterranean: 0.6, temperate: 0.45, continental: 0.38, boreal: 0.25, polar: 0.08 };
  const m = south ? ((month + 5) % 12) + 1 : month;
  const summer = 0.5 - 0.5 * Math.cos(((m - 1.5) / 12) * Math.PI * 2); // 0 mid-Jan … 1 mid-Jul
  return Math.max(0, Math.min(1, (base[climate] ?? 0.45) + (summer - 0.5) * 0.7));
}
