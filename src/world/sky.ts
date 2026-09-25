// Painted sky dome: wash gradient, sun + glow, moon with phase, masking-fluid stars, wet-in-wet clouds.
import * as THREE from 'three';
import { U, GLSL_NOISE } from '../render/shared';

export const skyUniforms = {
  uMoonDir: { value: new THREE.Vector3(0, 1, 0) },
  uMoonPhase: { value: 0.5 },
  uCloud: { value: 0.35 },
  uCloudShift: { value: new THREE.Vector2() },
};

export function buildSky() {
  const geo = new THREE.SphereGeometry(20000, 48, 24);
  const mat = new THREE.ShaderMaterial({
    uniforms: { ...U, ...skyUniforms },
    side: THREE.BackSide,
    depthWrite: false,
    depthTest: false,
    vertexShader: /* glsl */ `
      varying vec3 vDir;
      void main() {
        vDir = position;
        vec4 p = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        gl_Position = p.xyww;
      }`,
    fragmentShader: /* glsl */ `
      uniform vec3 uSkyZenith, uSkyHorizon, uSunDir, uFogSunColor, uFogColor, uKeyColor, uAmbSky, uMoonDir;
      uniform float uNight, uSeaFog, uCloud, uMoonPhase, uTime, uGolden;
      uniform vec2 uCloudShift;
      varying vec3 vDir;
      ${GLSL_NOISE}
      void main() {
        vec3 d = normalize(vDir);
        float h = d.y;
        // Horizon glow hugs the lower sky; pass through a pale luminous band instead of mud.
        float g = 1.0 - exp(-max(h, 0.0) * 5.5);
        vec3 pale = mix(uSkyHorizon, vec3(dot(uSkyHorizon, vec3(0.33))), 0.35) * 1.08 + uSkyZenith * 0.12;
        vec3 col = mix(uSkyHorizon, pale, smoothstep(0.0, 0.35, g));
        col = mix(col, uSkyZenith, smoothstep(0.25, 0.95, g));
        // a low band of warm light hugging the horizon at golden hour
        col = mix(col, uFogSunColor, uGolden * 0.35 * exp(-max(h, 0.0) * 14.0));
        float sd = max(dot(d, uSunDir), 0.0);
        float sunUp = smoothstep(-0.12, 0.02, uSunDir.y);
        col += uFogSunColor * (pow(sd, 10.0) * 0.45 + pow(sd, 90.0) * 0.6) * sunUp;
        // sun disk with a slightly ragged, wet edge
        float edge = 0.99955 + (vnoise(d.xz * 900.0) - 0.5) * 0.00012;
        col = mix(col, vec3(1.0, 0.96, 0.86) * 2.6, smoothstep(edge, edge + 0.00012, sd) * sunUp);
        // stars (bright paper dots) — hidden near the horizon haze
        if (uNight > 0.01) {
          vec3 sp = d * 180.0;
          vec3 cell = floor(sp);
          float r = hash13(cell);
          vec3 c = cell + 0.5 + (vec3(hash13(cell + 1.3), hash13(cell + 7.1), hash13(cell + 3.7)) - 0.5) * 0.7;
          float s = smoothstep(0.42, 0.0, length(sp - c)) * step(0.985, r);
          float tw = 0.7 + 0.3 * sin(uTime * (1.0 + r * 3.0) + r * 40.0);
          col += vec3(0.9, 0.92, 1.0) * s * tw * uNight * smoothstep(0.05, 0.3, h) * 1.4;
        }
        // moon with phase terminator
        float md = dot(d, uMoonDir);
        if (md > 0.9990) {
          vec3 up = abs(uMoonDir.y) < 0.99 ? vec3(0.0, 1.0, 0.0) : vec3(1.0, 0.0, 0.0);
          vec3 mx = normalize(cross(up, uMoonDir));
          vec3 my = cross(uMoonDir, mx);
          vec2 q = vec2(dot(d, mx), dot(d, my)) / 0.0296;
          float r2 = dot(q, q);
          if (r2 < 1.0) {
            float z = sqrt(1.0 - r2);
            float ph = uMoonPhase * 6.2831853;
            vec3 L = vec3(sin(ph), 0.0, -cos(ph));
            float lit = smoothstep(-0.05, 0.1, dot(vec3(q, z), L));
            float mare = 0.85 + 0.15 * vnoise(q * 3.0 + 4.0);
            vec3 moon = vec3(1.0, 0.97, 0.9) * mare * (0.25 + 1.6 * uNight);
            col = mix(col, mix(col * 1.08, moon, lit), smoothstep(1.0, 0.9, r2));
          }
        }
        col += uFogSunColor * pow(max(md, 0.0), 300.0) * 0.25 * uNight;
        // clouds on a virtual dome; lit rims toward the sun, soft wet-in-wet bottoms
        if (h > -0.02) {
          vec2 p = d.xz / (h + 0.2) * 2.6 + uCloudShift;
          float n = fbm(p * 0.55) * 0.7 + fbm(p * 1.9 + 11.0) * 0.3;
          float thr = 0.7 - uCloud * 0.42;
          float c = smoothstep(thr, thr + 0.09 + uCloud * 0.1, n);
          vec2 ps = p + normalize(uSunDir.xz + 1e-4) * 0.35;
          float n2 = fbm(ps * 0.55) * 0.7 + fbm(ps * 1.9 + 11.0) * 0.3;
          float shade = clamp((n2 - n) * 5.0 + 0.45, 0.0, 1.0);
          float lightAmt = clamp(dot(uKeyColor, vec3(0.3)) * 0.8 + dot(uAmbSky, vec3(0.33)) * 1.1, 0.03, 1.4);
          vec3 cLit = mix(vec3(1.0, 0.985, 0.95), uFogSunColor * 1.35, 0.55 * uGolden) * lightAmt;
          vec3 cDark = mix(uSkyZenith * 1.2, vec3(0.62, 0.6, 0.68) * lightAmt, 0.55 + 0.3 * uCloud);
          vec3 cc = mix(cLit, cDark, shade * (0.55 + 0.35 * uCloud));
          cc += uFogSunColor * pow(sd, 6.0) * 0.6 * sunUp;
          col = mix(col, cc, c * smoothstep(-0.02, 0.1, h) * 0.95);
        }
        // sea fog swallows the horizon
        col = mix(col, uFogColor, clamp(uSeaFog * (1.2 - smoothstep(0.0, 0.5, h)), 0.0, 1.0));
        col = mix(col, uFogColor, smoothstep(0.04, -0.05, h));
        gl_FragColor = vec4(col, 1.0);
      }`,
  });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.name = 'sky';
  mesh.frustumCulled = false;
  mesh.renderOrder = -10;
  return mesh;
}
