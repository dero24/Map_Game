// Water: one big plane at y=0. Depth, shoreline distance and ocean/river come from the terrain textures,
// so shallows go translucent over the painted bed, the Atlantic gets surf bands, the river stays glassy.
import * as THREE from 'three';
import { paintMaterial } from '../render/shared';
import { GLSL_TERRAIN, type TerrainTextures } from './ground';

export const waterParams = {
  uWaveScale: { value: 1 },
  uSurf: { value: 1 },
  uGlitter: { value: 1 },
  uOceanDeep: { value: new THREE.Color(0x2c4f6e) },
  uOceanShallow: { value: new THREE.Color(0x5fa3a0) },
  uRiverDeep: { value: new THREE.Color(0x3d5a5c) },
  uRiverShallow: { value: new THREE.Color(0x7a9a84) },
  // The open world (?at=): the terrain textures are a flat stand-in (3 m of land everywhere), so
  // wherever this plane shows — a cell's ground cut away over its sea — it is open, deep sea.
  // (Read as a shallow wash it was a pale translucent sheet over nothing: "grey concrete".)
  uOpenSea: { value: 0 },
};

export function buildWater(tt: TerrainTextures) {
  const geo = new THREE.PlaneGeometry(60000, 60000, 1, 1);
  geo.rotateX(-Math.PI / 2);
  const mat = paintMaterial({
    uniforms: { ...tt, ...waterParams },
    transparent: true,
    vertex: /* glsl */ `
      void main() {
        vec4 wp = worldMat() * vec4(position, 1.0);
        vWorldPos = wp.xyz + uWorldOffset;
        vNormalW = vec3(0.0, 1.0, 0.0);
        gl_Position = projectionMatrix * viewMatrix * wp;
      }`,
    fragment: /* glsl */ `
      ${GLSL_TERRAIN}
      uniform float uWaveScale, uSurf, uGlitter, uOpenSea;
      uniform vec3 uOceanDeep, uOceanShallow, uRiverDeep, uRiverShallow;
      float waves(vec2 p, float t, float ocean) {
        // long swell from the east-southeast on the ocean, wind ripples everywhere
        float swell = sin(dot(p, vec2(0.035, 0.012)) + t * 0.9) * ocean;
        return swell * 0.6 + fbm(p * 0.12 + vec2(t * 0.06, t * 0.03)) + 0.5 * vnoise(p * 0.5 - vec2(t * 0.2, 0.0));
      }
      void main() {
        vec2 xz = vWorldPos.xz;
        vec4 T = terrainAt(xz);
        float bed = T.r, sdf = T.g, ocean = T.b;
        if (uOpenSea > 0.5) { bed = -8.0; sdf = -60.0; ocean = 1.0; }
        float depth = max(0.0, -bed);
        vec3 V = (cameraPosition + uWorldOffset) - vWorldPos;
        float dist = length(V);
        V /= dist;
        float t = uTime;
        float amp = mix(0.25, 1.0, ocean) * (0.35 + uWind) * uWaveScale;
        float e = 0.6;
        float h0 = waves(xz, t, ocean);
        vec2 g = vec2(waves(xz + vec2(e, 0.0), t, ocean) - h0, waves(xz + vec2(0.0, e), t, ocean) - h0) / e;
        g *= amp / (1.0 + dist * 0.004);
        vec3 N = normalize(vec3(-g.x, 1.0, -g.y));
        float fres = 0.04 + 0.96 * pow(1.0 - max(dot(N, V), 0.0), 5.0);
        vec3 R = reflect(-V, N);
        // reflections are painted a touch deeper and bluer than the sky itself
        vec3 skyR = mix(uSkyHorizon, uSkyZenith, 0.35 + 0.65 * smoothstep(0.0, 0.5, R.y));
        skyR *= vec3(0.78, 0.88, 0.96);
        skyR = mix(skyR, uFogSunColor, pow(max(dot(R, uSunDir), 0.0), 8.0) * 0.55 * (1.0 - uNight));
        vec3 deep = mix(uRiverDeep, uOceanDeep, ocean);
        vec3 shallow = mix(uRiverShallow, uOceanShallow, ocean);
        vec3 body = mix(shallow, deep, smoothstep(0.2, 4.0, depth));
        float sh = shadowAt(vWorldPos, vec3(0.0, 1.0, 0.0));
        body *= uAmbSky * 0.75 + uKeyColor * (0.25 + 0.35 * sh) * max(uKeyDir.y + 0.1, 0.0);
        // dry-brush strokes laid across the view. Two world-fixed stroke frames (along x, along z)
        // blended by the camera's forward — never a per-pixel rotation (the per-pixel view angle
        // times kilometre-scale coordinates fanned out into radial curtains), never sliding.
        vec2 fw = -vec2(viewMatrix[0][2], viewMatrix[2][2]);
        fw /= max(length(fw), 1e-4);
        float wx = smoothstep(0.3, 0.7, abs(fw.y));
        float stA = vnoise(vec2(xz.x * 0.018, xz.y * 0.5) + vec2(t * 0.02, 0.0));
        float stB = vnoise(vec2(xz.y * 0.018, xz.x * 0.5) + vec2(t * 0.02, 7.0));
        float st2A = vnoise(vec2(xz.x * 0.05, xz.y * 1.6) + vec2(-t * 0.05, 3.0));
        float st2B = vnoise(vec2(xz.y * 0.05, xz.x * 1.6) + vec2(-t * 0.05, 11.0));
        float strokes = mix(smoothstep(0.35, 0.75, stB) * 0.6 + smoothstep(0.55, 0.8, st2B) * 0.4,
                            smoothstep(0.35, 0.75, stA) * 0.6 + smoothstep(0.55, 0.8, st2A) * 0.4, wx);
        body *= 0.86 + 0.28 * strokes;
        vec3 col = mix(body, skyR, clamp(fres * 0.7, 0.0, 0.62));
        col = mix(col, col * 1.12 + 0.03, strokes * 0.35 * (1.0 - uNight));
        // glitter: broken horizontal dashes toward the key light (left as bright paper)
        float spec = pow(max(dot(R, uKeyDir), 0.0), mix(90.0, 400.0, uNight));
        float dash = smoothstep(0.55, 0.8, vnoise(vec2(xz.x * 1.3, xz.y * 0.35) + vec2(t * 0.8, t * 0.1)));
        col += uKeyColor * spec * dash * 6.0 * uGlitter * sh;
        // surf: bands rolling toward the beach, and a lacy line at the waterline
        float s = max(-sdf, 0.0);
        float wob = fbm(xz * 0.05 + t * 0.05) * 6.0;
        float band = sin(s * 0.28 - t * 1.2 + wob);
        float foam = smoothstep(0.82, 0.97, band) * smoothstep(55.0, 12.0, s) * ocean;
        float lace = smoothstep(4.0, 0.0, s + sin(t * 0.7 + xz.y * 0.03) * 2.0) * (0.5 + 0.5 * ocean);
        foam = max(foam, lace * smoothstep(0.35, 0.65, vnoise(xz * 0.8 + t * 0.3)));
        foam *= uSurf;
        vec3 foamCol = vec3(0.95, 0.95, 0.92) * (uAmbSky * 0.9 + uKeyColor * 0.5 * max(uKeyDir.y, 0.0) + uLampColor * 0.05);
        col = mix(col, foamCol, clamp(foam, 0.0, 0.9));
        float alpha = mix(0.35, 1.0, smoothstep(0.0, 1.6, depth));
        alpha = max(alpha, clamp(fres * 1.2, 0.0, 1.0));
        alpha = max(alpha, foam);
        alpha *= smoothstep(-0.05, 0.12, depth + 0.1);
        gl_FragColor = vec4(applyFog(col, vWorldPos), alpha);
      }`,
  });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.name = 'water';
  mesh.renderOrder = 5;
  mesh.frustumCulled = false;
  return mesh;
}
