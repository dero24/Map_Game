// Painted material for animated creatures from the foundry: gulls (WINGS), walkers and residents
// (LEGS + PEOPLE, see src/assets/people.ts), seated café guests (SEATED). Lives in render/ so tile
// builders (props, in the worker) can use it without pulling in the life client.
import { paintMaterial } from './shared';
import { PEOPLE_GLSL_DECL, PEOPLE_GLSL_MAIN, MARK } from '../assets/people';

/** The region's clothing warmth (0 coats … 1 beach), shared by every people material. */
export const peopleU = { uWarmth: { value: 0.5 } };

const mk = (m: readonly number[]) => `vec3(${m.map((v) => v.toFixed(1)).join(', ')})`;
/** The beach's people (world/crowd.ts POSE, drawn by world/crowdLayer.ts): swimwear, and each one
 *  posed from the standing body by its per-person `aPose` — limbs turned about their joints (hip
 *  0.87, knee 0.47, shoulder 1.39) and the trunk about the hip: in a beach chair, lying on a towel,
 *  sitting on the sand leaning back on the hands, standing, a kid jumping the waves, a lifeguard on
 *  the stand's seat. */
const BEACH_GLSL_DECL = /* glsl */ `
  attribute float aPose;
  // a turn about the x axis (y, z): the limb's tip toward −z (forward) for a > 0
  vec3 rx(vec3 v, float a) { float c = cos(a), s = sin(a); return vec3(v.x, v.y * c - v.z * s, v.y * s + v.z * c); }
  // leg (thigh a1, shin a2 — 0 straight down, π/2 straight forward), arms (c, forward), trunk lean
  // back (b), all about the joints of the standing body; then the hip set down at height hy
  vec3 bend(vec3 q, float a1, float a2, float c, float b, float hy) {
    const vec3 HIP = vec3(0.0, 0.87, 0.0), KNEE = vec3(0.0, 0.47, 0.0);
    if (aPart > 0.5 && aPart < 2.5) {
      vec3 k = HIP + rx(KNEE - HIP, a1);
      if (q.y >= 0.47) q = HIP + rx(vec3(q.x, q.y - 0.87, q.z), a1);
      else q = k + rx(vec3(q.x, q.y - 0.47, q.z), a2);
    } else {
      if (aPart > 4.5 && aPart < 6.5) q = vec3(0.0, 1.39, 0.0) + rx(vec3(q.x, q.y - 1.39, q.z), c);
      if (q.y > 0.8 || aPart > 2.5) q = HIP + rx(q - HIP, b);
    }
    return q + vec3(0.0, hy - 0.87, 0.0);
  }
`;
const BEACH_GLSL_LOOK = /* glsl */ `
  {
    // swimwear: bare arms and legs, trunks or a suit in the instance colour, half of them a top
    // (the lifeguard: red top and trunks)
    bool top = aPose > 4.5 || pHash(seed + 13.7) < 0.5;
    if (isMark(pc, ${mk(MARK.forearm)}) || isMark(pc, ${mk(MARK.shin)})) pc = ${mk(MARK.skin)};
    else if (isMark(pc, ${mk(MARK.pants)})) pc = aPart > 0.5 && position.y < 0.74 ? ${mk(MARK.skin)} : vec3(1.0);
    else if (all(greaterThan(pc, vec3(0.98)))) {
      if (aPart > 4.5 && aPart < 6.5 && aPose < 4.5) pc = ${mk(MARK.skin)};
      else if (aPart < 0.5 && position.y > 0.97 && (!top || position.y > 1.33)) pc = ${mk(MARK.skin)};
    }
  }
`;
const BEACH_GLSL_POSE = /* glsl */ `
  {
    float pose = floor(aPose + 0.5);
    float sd = pHash(seed + 2.9);
    if (pose < 0.5) {
      // in a beach chair: the hip on the sling (0.26), knees up, feet out on the sand, leaning back
      p = bend(p, 1.75, 0.5, 0.35, 0.5, 0.32);
    } else if (pose < 1.5) {
      // lying on the back on the towel, head to the land: one knee up now and then
      if (sd < 0.4 && aPart > 0.5 && aPart < 1.5) p = bend(p, 0.9, -0.85, 0.0, 0.0, 0.87);
      p = rx(p - vec3(0.0, 0.87, 0.0), 1.5708) + vec3(0.0, 0.14, 0.0);
    } else if (pose < 2.5) {
      // sitting on the sand, knees up, leaning back on the hands
      float k = aPart < 1.5 ? 2.0 : 1.75 + sd * 0.35;
      p = bend(p, k, 0.65, -0.6, 0.45, 0.14);
    } else if (pose > 3.5 && pose < 4.5) {
      // a kid at the waterline: jumping the waves, arms flung up in the air
      float air = max(0.0, sin(uTime * (2.6 + sd) + seed));
      p = bend(p, 0.7 * air, -0.5 * air, 2.4 * air, 0.0, 0.87) + vec3(0.0, air * air * 0.28, 0.0);
    } else if (pose > 4.5) {
      // up on the stand's seat, upright, forearms on the knees
      p = bend(p, 1.57, 0.05, 0.7, -0.05, 0.52);
    }
    still = pose > 2.5 && pose < 3.5 ? 0.0 : 1.0;
  }
`;
export function creatureMaterial(defines: Record<string, number>) {
  return paintMaterial({
    defines,
    uniforms: defines.PEOPLE ? peopleU : {},
    vertex: /* glsl */ `
      attribute vec3 color;
      attribute float aPart;
      attribute vec3 aAnim;
      varying vec3 vColor;
      varying float vGlow;
      #ifdef PEOPLE
      ${PEOPLE_GLSL_DECL}
      #endif
      #ifdef BEACH
      ${BEACH_GLSL_DECL}
      #endif
      #ifdef SEATED
      uniform float uNight;
      #endif
      void main() {
        vec3 p = position;
        vec3 pc = color;
        float ph = aAnim.x, amt = aAnim.y;
        float still = 0.0; // (1: posed and at rest — no weight shift, no talking hands)
        #ifdef PEOPLE
          #ifdef STATIC_PEOPLE
            // residents stand still: their look is keyed to where they stand
            vec3 o0 = (worldMat() * vec4(0.0, 0.0, 0.0, 1.0)).xyz + uWorldOffset;
            float seed = floor(o0.x * 3.1) + floor(o0.z * 1.7) * 57.0;
          #else
            float seed = float(gl_InstanceID) * 1.37;
          #endif
          #ifdef BEACH
          ${BEACH_GLSL_LOOK}
          #endif
          ${PEOPLE_GLSL_MAIN}
          #ifdef BEACH
          ${BEACH_GLSL_POSE}
          amt = 0.0;
          #endif
        #endif
        #ifdef WINGS
          if (aPart > 0.5 && aPart < 1.5) {
            if (amt < 0.0) { p.x *= 0.3; p.y += 0.05; p.z += 0.06; }
            else { float f = sin(ph) * amt; p.y += f * abs(p.x) * 1.3; p.x *= 1.0 - abs(f) * 0.15; }
          }
        #endif
        #ifdef SEATED
          // sitting on a 0.45 m seat: the seat of the trousers (the pelvis bottom, 0.80 standing)
          // rests ON the surface and the shoes on the floor — thighs forward and a touch down to
          // the knee, shins angled a little forward, forearms level (on a table, or holding a
          // book/phone), the back leaning slightly into the chair. Callers raise the instance by
          // (seat − 0.45) for other seats (a bar stool, a soft sofa).
          if (aPart > 0.5 && aPart < 2.5) {
            if (p.y > 0.47) { float dd = 0.87 - p.y; p.z -= dd; p.y = 0.87 - dd * 0.125; }
            else { p.z -= 0.4 + (0.47 - p.y) * 0.22; p.y += 0.35; }
          }
          if (aPart > 4.5 && aPart < 6.5 && p.y < 1.12) { float da = 1.12 - p.y; p.z -= da * 0.92; p.y = 1.12 - da * 0.1; }
          if (aPart < 0.5 || aPart > 4.5) p.z += max(0.0, p.y - 0.87) * 0.1;
          p.y -= 0.35;
          #ifndef INDOOR
          if (uNight > 0.55) p *= 0.0; // the terrace empties after dark
          #endif
          amt = 0.0;
        #endif
        #ifdef LEGS
          #ifndef STATIC_PEOPLE
          // stopped to talk to someone (lifeSim CHAT): stand, and gesture like a resident does
          float chat = 0.0;
          if (amt < -3.5 && amt > -4.5) { chat = 1.0; amt = 0.0; }
          if (amt < -0.5) {
            // knocked down (lifeSim): −1…−1.9 sprawled on the back, −2.5 sitting up on the ground
            if (amt > -1.999) {
              // knees drawn up (one more than the other), one arm flung wide, the other across the chest
              if (aPart > 0.5 && aPart < 2.5) {
                float a = aPart < 1.5 ? 0.75 : 0.3;
                float kz = -0.4 * sin(a), ky = 0.87 - 0.4 * cos(a);
                if (p.y > 0.47) { float dd = 0.87 - p.y; p.z -= dd * sin(a); p.y = 0.87 - dd * cos(a); }
                else { float db = 0.47 - p.y; p.z = kz + p.z + db * sin(a); p.y = ky - db * cos(a); }
              }
              if (aPart > 4.5 && aPart < 5.5) { float d = max(0.0, 1.39 - p.y); p.x += d * 0.95 * sign(p.x + 1e-4); p.y += d * 0.8; }
              if (aPart > 5.5 && aPart < 6.5) { float d = max(0.0, 1.39 - p.y); p.z -= d * 0.55; p.x -= d * 0.35 * sign(p.x + 1e-4); p.y += d * 0.3; }
            } else {
              // sitting on the ground: legs out in front, leaning back on the hands
              if (aPart > 0.5 && aPart < 2.5) { float dd = 0.87 - p.y; p.z -= dd * 0.98; p.y = 0.87 - dd * 0.12; }
              if (aPart > 4.5 && aPart < 6.5) { float d = max(0.0, 1.39 - p.y); p.z += d * 0.6; p.y += d * 0.12; }
              p.z += max(0.0, p.y - 0.87) * 0.2;
              p.y -= 0.8;
            }
            amt = 0.0;
          }
          #endif
          float sw = sin(ph) * amt * 0.24; // a walking stride, not a lunge
          // a runner (lifeSim AMT_RUN): elbows bent up at the sides, leaning into the stride
          float run = clamp((amt - 1.0) * 2.0, 0.0, 1.0);
          if (run > 0.0) {
            if (aPart > 4.5 && aPart < 6.5 && p.y < 1.12) { float da = 1.12 - p.y; p.z -= da * 0.85 * run; p.y += da * 0.75 * run; }
            if ((aPart < 0.5 || aPart > 4.5) && p.y > 0.87) p.z -= (p.y - 0.87) * 0.14 * run;
          }
          if (aPart > 0.5 && aPart < 2.5) {
            float side = aPart < 1.5 ? 1.0 : -1.0;
            p.z += (0.87 - p.y) * sw * side;
            // the knee folds on the forward swing: the shin and foot trail back and lift
            float flex = max(0.0, -cos(ph) * side) * amt;
            float below = max(0.0, 0.47 - p.y);
            p.z += below * flex * 0.9;
            p.y += below * flex * 0.25;
          }
          if (aPart > 4.5 && aPart < 6.5) p.z += (1.39 - p.y) * sw * (aPart < 5.5 ? -0.8 : 0.8);
          p.y += abs(sin(ph)) * amt * 0.03;
          // standing still is never frozen: a slow weight shift and a little arm sway
          float idle = (1.0 - clamp(amt * 4.0, 0.0, 1.0)) * (1.0 - still);
          float ip = ph * 3.7 + float(gl_InstanceID) * 1.3;
          if (aPart > 4.5 && aPart < 6.5) p.z += (1.39 - p.y) * sin(uTime * 1.1 + ip + aPart) * 0.08 * idle;
          p.x += sin(uTime * 0.45 + ip) * 0.025 * idle * clamp(p.y / 1.7, 0.0, 1.0);
          // residents (and walkers stopped for a chat) are mid-conversation, not waiting: now and
          // then a hand comes up and moves as they talk (mostly one hand, sometimes both), and the
          // head nods along
          #ifdef PEOPLE
          #ifdef STATIC_PEOPLE
            float talk = smoothstep(0.45, 0.95, sin(uTime * 0.55 + seed * 1.7)) * (1.0 - still);
          #else
            float talk = chat * smoothstep(0.2, 0.9, sin(uTime * 0.8 + seed * 1.7));
          #endif
          if (talk > 0.0) {
            if (aPart > 4.5 && aPart < 6.5) {
              float g = talk * (aPart < 5.5 ? 1.0 : 0.35 + 0.35 * sin(seed)) * (0.75 + 0.25 * sin(uTime * 3.1 + seed));
              float da = max(0.0, 1.12 - p.y); // the forearm, below the elbow
              p.z -= da * 1.05 * g;
              p.y += da * 0.85 * g;
            }
            if (p.y > 1.45) p.z -= (p.y - 1.45) * 0.14 * talk * sin(uTime * 2.3 + seed);
          }
          #endif
        #endif
        mat4 m = worldMat();
        vec4 wp = m * vec4(p, 1.0);
        vWorldPos = wp.xyz + uWorldOffset;
        vNormalW = normalize(mat3(m) * normal);
        vColor = pc;
        #ifdef USE_INSTANCING_COLOR
          float tintable = step(0.98, min(pc.r, min(pc.g, pc.b)));
          vColor = mix(pc, pc * instanceColor, tintable);
        #endif
        vGlow = (aPart > 2.5 && aPart < 4.5) ? aAnim.z : 0.0;
        gl_Position = projectionMatrix * viewMatrix * wp;
      }`,
    fragment: /* glsl */ `
      varying vec3 vColor;
      varying float vGlow;
      void main() {
        vec3 N = normalize(vNormalW);
        vec3 alb = pigment(vColor, vWorldPos);
        float sh = shadowAt(vWorldPos, N);
        vec3 col = paintLight(alb, N, vWorldPos, sh, 1.0);
        col += vColor * vGlow * 3.5;
        gl_FragColor = vec4(applyFog(col, vWorldPos), 1.0);
      }`,
  });
}
