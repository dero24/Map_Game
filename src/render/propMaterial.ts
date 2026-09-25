// Generic painted material for props: vertex color (and instance color), optional emissive, wind sway, bobbing.
import * as THREE from 'three';
import { paintMaterial } from './shared';

export function propMaterial(opts: { wind?: boolean; bob?: boolean; emissive?: THREE.Color; emissiveNight?: boolean; foliage?: boolean } = {}) {
  const defines: Record<string, number> = {};
  if (opts.wind) defines.WIND = 1;
  if (opts.bob) defines.BOB = 1;
  if (opts.foliage) defines.FOLIAGE = 1;
  if (opts.emissive) defines.EMISSIVE = 1;
  return paintMaterial({
    defines,
    uniforms: { uEmissive: { value: opts.emissive ?? new THREE.Color(0) }, uEmNight: { value: opts.emissiveNight ? 1 : 0 } },
    vertex: /* glsl */ `
      attribute vec3 color;
      varying vec3 vColor;
      varying vec3 vLocal;
      void main() {
        vec3 p = position;
        vLocal = position;
        mat4 m = worldMat();
        vec3 origin = (m * vec4(0.0, 0.0, 0.0, 1.0)).xyz;
        #ifdef WIND
          float sway = max(p.y - 1.5, 0.0) * 0.012 * (0.4 + uWind);
          p.x += sin(uTime * 1.3 + origin.x * 0.21 + origin.z * 0.17) * sway;
          p.z += cos(uTime * 1.1 + origin.z * 0.19) * sway * 0.7;
        #endif
        #ifdef BOB
          float ph = origin.x * 0.37 + origin.z * 0.23;
          p.y += sin(uTime * 0.9 + ph) * 0.07 * (0.5 + uWind);
        #endif
        vec4 wp = m * vec4(p, 1.0);
        #ifdef BOB
          // gentle roll
          wp.y += sin(uTime * 0.7 + ph * 1.7) * 0.04 * p.x;
        #endif
        vWorldPos = wp.xyz;
        vNormalW = normalize(mat3(m) * normal);
        #ifdef FOLIAGE
          // soft, rounded shading: bend normals toward the blob's outward direction
          vNormalW = normalize(mix(vNormalW, normalize(wp.xyz - origin - vec3(0.0, 3.0, 0.0)), 0.6));
        #endif
        vColor = color;
        #ifdef USE_INSTANCING_COLOR
          // instance colour tints only the white-painted parts (foliage, hulls); trunks keep their brown
          float tintable = step(0.98, min(color.r, min(color.g, color.b)));
          vColor = mix(color, color * instanceColor, tintable);
        #endif
        gl_Position = projectionMatrix * viewMatrix * wp;
      }`,
    fragment: /* glsl */ `
      uniform vec3 uEmissive;
      uniform float uEmNight;
      varying vec3 vColor;
      varying vec3 vLocal;
      void main() {
        vec3 N = normalize(vNormalW);
        vec3 alb = vColor;
        #ifdef FOLIAGE
          alb *= 0.72 + 0.5 * fbm3(vWorldPos * 0.9);
        #endif
        alb = pigment(alb, vWorldPos);
        float sh = shadowAt(vWorldPos, N);
        vec3 col = paintLight(alb, N, vWorldPos, sh, 1.0);
        #ifdef EMISSIVE
          col += uEmissive * mix(1.0, uLampPower * 3.0, uEmNight);
        #endif
        gl_FragColor = vec4(applyFog(col, vWorldPos), 1.0);
      }`,
  });
}

// Merge simple geometries after baking a per-geometry vertex color.
export function colored(g: THREE.BufferGeometry, hex: number) {
  const geo = g.index ? g.toNonIndexed() : g;
  const c = new THREE.Color(hex);
  const n = geo.attributes.position.count;
  const arr = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) arr.set([c.r, c.g, c.b], i * 3);
  geo.setAttribute('color', new THREE.BufferAttribute(arr, 3));
  geo.deleteAttribute('uv');
  return geo;
}
