// Painted material for animated creatures from the foundry: gulls (WINGS), walkers and residents
// (LEGS + PEOPLE, see src/assets/people.ts), seated café guests (SEATED). Lives in render/ so tile
// builders (props, in the worker) can use it without pulling in the life client.
import { paintMaterial } from './shared';
import { PEOPLE_GLSL_DECL, PEOPLE_GLSL_MAIN } from '../assets/people';

/** The region's clothing warmth (0 coats … 1 beach), shared by every people material. */
export const peopleU = { uWarmth: { value: 0.5 } };
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
      #ifdef SEATED
      uniform float uNight;
      #endif
      void main() {
        vec3 p = position;
        vec3 pc = color;
        float ph = aAnim.x, amt = aAnim.y;
        #ifdef PEOPLE
          #ifdef STATIC_PEOPLE
            // residents stand still: their look is keyed to where they stand
            vec3 o0 = (worldMat() * vec4(0.0, 0.0, 0.0, 1.0)).xyz + uWorldOffset;
            float seed = floor(o0.x * 3.1) + floor(o0.z * 1.7) * 57.0;
          #else
            float seed = float(gl_InstanceID) * 1.37;
          #endif
          ${PEOPLE_GLSL_MAIN}
        #endif
        #ifdef WINGS
          if (aPart > 0.5 && aPart < 1.5) {
            if (amt < 0.0) { p.x *= 0.3; p.y += 0.05; p.z += 0.06; }
            else { float f = sin(ph) * amt; p.y += f * abs(p.x) * 1.3; p.x *= 1.0 - abs(f) * 0.15; }
          }
        #endif
        #ifdef SEATED
          // café guests: thighs forward onto a 0.45 m seat, shins hanging, forearms on the table
          if (aPart > 0.5 && aPart < 2.5) {
            if (p.y > 0.47) { float dd = 0.87 - p.y; p.z -= dd; p.y = 0.87 - dd * 0.08; }
            else { p.z -= 0.4; p.y += 0.368; }
          }
          if (aPart > 4.5 && aPart < 6.5 && p.y < 1.12) { float da = 1.12 - p.y; p.z -= da * 0.9; p.y = 1.12 - da * 0.3; }
          p.y -= 0.42;
          #ifndef INDOOR
          if (uNight > 0.55) p *= 0.0; // the terrace empties after dark
          #endif
          amt = 0.0;
        #endif
        #ifdef LEGS
          #ifndef STATIC_PEOPLE
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
          float idle = 1.0 - clamp(amt * 4.0, 0.0, 1.0);
          float ip = ph * 3.7 + float(gl_InstanceID) * 1.3;
          if (aPart > 4.5 && aPart < 6.5) p.z += (1.39 - p.y) * sin(uTime * 1.1 + ip + aPart) * 0.08 * idle;
          p.x += sin(uTime * 0.45 + ip) * 0.025 * idle * clamp(p.y / 1.7, 0.0, 1.0);
          #ifdef STATIC_PEOPLE
            // residents are mid-conversation, not waiting: now and then a hand comes up and moves
            // as they talk (mostly one hand, sometimes both), and the head nods along
            float talk = smoothstep(0.45, 0.95, sin(uTime * 0.55 + seed * 1.7));
            if (aPart > 4.5 && aPart < 6.5) {
              float g = talk * (aPart < 5.5 ? 1.0 : 0.35 + 0.35 * sin(seed)) * (0.75 + 0.25 * sin(uTime * 3.1 + seed));
              float da = max(0.0, 1.12 - p.y); // the forearm, below the elbow
              p.z -= da * 1.05 * g;
              p.y += da * 0.85 * g;
            }
            if (p.y > 1.45) p.z -= (p.y - 1.45) * 0.14 * talk * sin(uTime * 2.3 + seed);
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
