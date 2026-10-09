// Painted material for animated creatures from the foundry: gulls (WINGS), walkers and residents
// (PEOPLE, see src/assets/people.ts), seated café guests (SEATED), the beach's people (BEACH). Lives
// in render/ so tile builders (props, in the worker) can use it without pulling in the life client.
//
// A person is posed by a handful of joint angles (people.ts `Pose`) and skinned in the vertex
// shader — positions and normals turned about the hip, knee, ankle, shoulder, elbow, waist and
// neck — so limbs bend round the joint and shade round in every pose. The angles come from the
// same functions people.ts runs on the CPU (POSE_GLSL mirrors them), so what the CPU puts in a
// hand (a dog's lead) is where the shader draws the hand.
import { paintMaterial } from './shared';
import { PEOPLE_GLSL_DECL, PEOPLE_GLSL_MAIN, MARK } from '../assets/people';

/** The region's clothing warmth (0 coats … 1 beach), shared by every people material. */
export const peopleU = { uWarmth: { value: 0.5 } };

const mk = (m: readonly number[]) => `vec3(${m.map((v) => v.toFixed(1)).join(', ')})`;
/** The beach's people (world/crowd.ts POSE, drawn by world/crowdLayer.ts): swimwear and bare feet,
 *  and each one posed by its per-person `aPose` (people.ts beachPose): in a beach chair, lying on a
 *  towel, sitting on the sand leaning back on the hands, standing, a kid jumping the waves, a
 *  lifeguard on the stand's seat. */
const BEACH_GLSL_DECL = /* glsl */ `
  attribute float aPose;
`;
const BEACH_GLSL_LOOK = /* glsl */ `
  {
    // swimwear: bare arms and legs, trunks or a suit in the instance colour, half of them a top
    // (the lifeguard: red top and trunks); bare feet — the shoe flattened to a foot
    bool top = aPose > 4.5 || pHash(seed + 13.7) < 0.5;
    if (isMark(pc, ${mk(MARK.forearm)}) || isMark(pc, ${mk(MARK.shin)}) || isMark(pc, ${mk(MARK.thigh)}) || isMark(pc, ${mk(MARK.chest)})) pc = ${mk(MARK.skin)};
    else if (isMark(pc, ${mk(MARK.shoe)}) || isMark(pc, ${mk(MARK.sole)})) {
      pc = ${mk(MARK.skin)};
      float sx = aPart < 1.5 ? HX : -HX;
      // (lower over the toes, up to the ankle at the back: the shin still meets it)
      p.x = sx + (p.x - sx) * 0.8; p.y = min(p.y, 0.03) + max(p.y - 0.03, 0.0) * mix(0.55, 0.85, smoothstep(-0.1, 0.03, p.z)); p.z = p.z * 0.92 - 0.006;
    }
    else if (isMark(pc, ${mk(MARK.pants)})) pc = vec3(1.0);
    else if (all(greaterThan(pc, vec3(0.98)))) {
      if (aPart > 4.5 && aPart < 6.5 && aPose < 4.5) pc = ${mk(MARK.skin)};
      else if (aPart < 0.5 && position.y > 0.97 && !top) pc = ${mk(MARK.skin)};
    }
  }
`;
export function creatureMaterial(defines: Record<string, number>) {
  return paintMaterial({
    // people out of doors are lit by the night, not lifted by it (nightLight.ts FIGURE); indoors the
    // room's own light is theirs
    defines: defines.PEOPLE && !defines.INDOOR ? { ...defines, FIGURE_NIGHT: 1 } : defines,
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
        vec3 nrm = normal;
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
          #ifdef BEACH
          ${BEACH_GLSL_LOOK}
          #endif
          ${PEOPLE_GLSL_MAIN}
          // the pose: joint angles for this person now, then the body skinned to them
          Pose P;
          #if defined(BEACH)
            P = beachPose(floor(aPose + 0.5), uTime, seed, pHash(seed + 2.9));
          #elif defined(SEATED)
            // sitting on a 0.45 m seat (callers raise the instance by seat − 0.45 for a bar stool or a
            // soft sofa), mid-conversation now and then
            P = seatPose(uTime, seed, smoothstep(0.45, 0.95, sin(uTime * 0.55 + seed * 1.7)));
          #elif defined(STATIC_PEOPLE)
            // residents are mid-conversation, not waiting: now and then a hand comes up and moves as
            // they talk (mostly one hand, sometimes both), and the head nods along; between times
            // they shift their weight and look about
            P = walkPose(0.0, 0.0, uTime, seed, 0.0, smoothstep(0.45, 0.95, sin(uTime * 0.55 + seed * 1.7)), 0.0);
          #else
            if (amt < -0.5 && amt > -3.0) P = downPose(amt); // knocked down (lifeSim): sprawled, then sitting up
            else {
              // stopped to talk to someone (lifeSim CHAT): standing, gesturing like a resident; a dog
              // walker (aAnim.z: 1 + the dog's sideways wander) holds the lead out toward the dog
              float chat = amt < -3.5 && amt > -4.5 ? 1.0 : 0.0;
              P = walkPose(ph, max(amt, 0.0), uTime, seed, 0.0, chat * smoothstep(0.2, 0.9, sin(uTime * 0.8 + seed * 1.7)), aAnim.z);
            }
          #endif
          p = skinPerson(p, nrm, aPart, aSkin, P);
          #if defined(SEATED) && !defined(INDOOR)
          if (uNight > 0.55) p *= 0.0; // the terrace empties after dark
          #endif
        #endif
        #ifdef WINGS
          if (aPart > 0.5 && aPart < 1.5) {
            if (amt < 0.0) { p.x *= 0.3; p.y += 0.05; p.z += 0.06; }
            else { float f = sin(ph) * amt; p.y += f * abs(p.x) * 1.3; p.x *= 1.0 - abs(f) * 0.15; }
          }
        #endif
        mat4 m = worldMat();
        vec4 wp = m * vec4(p, 1.0);
        vWorldPos = wp.xyz + uWorldOffset;
        vNormalW = normalize(mat3(m) * nrm);
        vColor = pc;
        #ifdef USE_INSTANCING_COLOR
          float tintable = step(0.98, min(pc.r, min(pc.g, pc.b)));
          vColor = mix(pc, pc * instanceColor, tintable);
        #endif
        #ifdef PEOPLE
          vGlow = 0.0;
        #else
          vGlow = (aPart > 2.5 && aPart < 4.5) ? aAnim.z : 0.0;
        #endif
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
