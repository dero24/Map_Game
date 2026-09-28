// Generic painted material for props: vertex color (and instance color), optional emissive, wind sway, bobbing.
import * as THREE from 'three';
import { paintMaterial } from './shared';
import { SIGNAL_GLSL } from '../sim/traffic';

// crown: [centre height, radius] in the geometry's own metres (treeMeta). With it, a tree's
// foliage shades as one lit volume with a darker underside (the BOTW/Ghibli read) instead of
// evenly lit balls on a stick; bark keeps its own normals.
// decid: a broadleaf crown — its leaves colour in autumn and fall in winter (season.ts uLeafFall /
// uAutumn); conifers and palms keep theirs.
// paved: street ribbons — snow is ploughed off the asphalt (slushy tracks) and lies on the walks.
// signal: traffic-signal masts — the instance colour is DATA (r = the junction's phase key, g = the
// phase group), and the red / amber / green lens the life sim is obeying right now is lit
// (src/sim/traffic.ts signalState, on the shared clock uTime).
// fallHue: how a broadleaf turns (flora.ts FALL_HUE): 1 the maples' reds, 2 gold (willow, elm,
// poplar, birch); else each tree its own of yellow / orange / red. blossom: the flowering cherry's
// spring pink (season.ts bloom). weep: a willow's hanging strands swing with the wind.
export function propMaterial(opts: { wind?: boolean; bob?: boolean; emissive?: THREE.Color; emissiveNight?: boolean; foliage?: boolean; crown?: [number, number]; decid?: boolean; paved?: boolean; signal?: boolean; fallHue?: number; blossom?: boolean; weep?: boolean } = {}) {
  const defines: Record<string, number> = {};
  if (opts.weep) defines.WEEP = 1;
  defines.FALL_HUE = opts.fallHue ?? 0; // (always defined: an undefined macro in #if is a GLSL error)
  if (opts.blossom) defines.BLOSSOM = 1;
  if (opts.wind) defines.WIND = 1;
  if (opts.bob) defines.BOB = 1;
  if (opts.foliage) defines.FOLIAGE = 1;
  if (opts.decid) defines.DECID = 1;
  if (opts.paved) defines.PAVED = 1;
  if (opts.signal) defines.SIGNAL = 1;
  if (opts.emissive) defines.EMISSIVE = 1;
  const mat = paintMaterial({
    defines,
    uniforms: { uEmissive: { value: opts.emissive ?? new THREE.Color(0) }, uEmNight: { value: opts.emissiveNight ? 1 : 0 }, uCrown: { value: new THREE.Vector2(...(opts.crown ?? [3, 0])) } },
    vertex: /* glsl */ `
      attribute vec3 color;
      varying vec3 vColor;
      varying vec3 vLocal;
      varying float vAO;
      varying float vLeafy;
      varying float vTree;
      varying float vSig;
      uniform vec2 uCrown;
      #ifdef SIGNAL
      ${SIGNAL_GLSL}
      #endif
      void main() {
        vec3 p = position;
        vAO = 1.0;
        vSig = 0.0;
        vLeafy = 0.0;
        vLocal = position;
        mat4 m = worldMat();
        vec3 origin = (m * vec4(0.0, 0.0, 0.0, 1.0)).xyz;
        vTree = fract(sin(dot(origin.xz + uWorldOffset.xz, vec2(12.9898, 78.233))) * 43758.5453);
        #ifdef WIND
          float sway = max(p.y - 1.5, 0.0) * 0.012 * (0.4 + uWind);
          p.x += sin(uTime * 1.3 + origin.x * 0.21 + origin.z * 0.17) * sway;
          p.z += cos(uTime * 1.1 + origin.z * 0.19) * sway * 0.7;
          #ifdef WEEP
            // a willow's curtain: the further down a strand, the more it swings
            float hang = step(0.98, min(color.r, min(color.g, color.b))) * max(0.0, uCrown.x + 0.5 - p.y) * 0.06 * (0.5 + uWind);
            p.x += sin(uTime * 1.7 + origin.x * 0.3 + p.z * 0.8) * hang;
            p.z += cos(uTime * 1.5 + origin.z * 0.3 + p.x * 0.8) * hang * 0.8;
          #endif
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
        vWorldPos = wp.xyz + uWorldOffset;
        vNormalW = normalize(mat3(m) * normal);
        #ifdef FOLIAGE
          float leafy = step(0.98, min(color.r, min(color.g, color.b)));
          if (uCrown.y > 0.0) {
            // one spherical light field per crown (slightly flattened), foliage only
            vec3 cN = normalize(mat3(m) * ((position - vec3(0.0, uCrown.x, 0.0)) * vec3(1.0, 1.4, 1.0)));
            vNormalW = normalize(mix(vNormalW, cN, 0.75 * leafy));
            vAO = mix(1.0, mix(0.55, 1.0, smoothstep(uCrown.x - uCrown.y, uCrown.x + 0.3 * uCrown.y, position.y)), leafy);
            vLeafy = leafy;
          } else {
            // soft, rounded shading: bend normals toward the blob's outward direction
            vNormalW = normalize(mix(vNormalW, normalize(wp.xyz - origin - vec3(0.0, 3.0, 0.0)), 0.6));
          }
        #endif
        vColor = color;
        #ifdef USE_INSTANCING_COLOR
          // instance colour tints only the white-painted parts (foliage, hulls); trunks keep their brown
          float tintable = step(0.98, min(color.r, min(color.g, color.b)));
          vColor = mix(color, color * instanceColor, tintable);
          #ifdef SIGNAL
            // which lens is this vertex (1 red, 2 amber, 3 green), and is it the one lit now
            float lens = color.r > 2.0 * color.g && color.r > 2.0 * color.b ? 1.0
              : color.r > color.g && color.g > 1.5 * color.b && color.g > 0.25 ? 2.0
              : color.g > 1.3 * color.r && color.g > 1.1 * color.b ? 3.0 : 0.0;
            float st = signalState(instanceColor.g > 0.5 ? 1.0 : 0.0, uTime, instanceColor.r);
            vSig = lens < 0.5 ? 0.0 : (abs(lens - (3.0 - st)) < 0.5 ? 1.0 : 0.5);
            vColor = color;
          #endif
        #endif
        gl_Position = projectionMatrix * viewMatrix * wp;
      }`,
    fragment: /* glsl */ `
      uniform vec3 uEmissive;
      uniform float uEmNight;
      varying vec3 vColor;
      varying vec3 vLocal;
      varying float vAO;
      varying float vLeafy;
      varying float vTree;
      varying float vSig;
      uniform vec2 uCrown;
      #ifdef PAVED
      uniform vec4 uDetailBox;
      #endif
      void main() {
        #ifdef PAVED
          // near the walker the painted ground carries the street (lanes, kerbs, sidewalks,
          // crossings, all exactly on the ground): the far ribbon steps aside, dissolving across
          // the painted window's rim as the paint fades in (the ground shader's own ramp)
          vec2 ud = (vWorldPos.xz - uDetailBox.xy) * uDetailBox.zw;
          vec2 ue = min(ud, 1.0 - ud);
          if (smoothstep(0.0, 0.08, min(ue.x, ue.y)) > fract(52.9829189 * fract(dot(gl_FragCoord.xy, vec2(0.06711056, 0.00583715))))) discard;
        #endif
        vec3 N = normalize(vNormalW);
        vec3 alb = vColor;
        #ifdef SIGNAL
          if (vSig > 0.25) alb = vSig > 0.75 ? min(vec3(1.0), vColor * 1.8 + 0.08) : vColor * 0.2; // a dark lens is near black
        #endif
        #ifdef FOLIAGE
          alb *= 0.72 + 0.5 * fbm3(vWorldPos * 0.9);
        #endif
        #ifdef DECID
          if (vLeafy > 0.5) {
            // leaves go clump by clump (each tree on its own schedule), the last ones thin and high
            float clump = vnoise3(vWorldPos * 1.1) * 0.75 + vTree * 0.25;
            if (clump < uLeafFall * 1.05 - 0.02) discard;
            // autumn: each tree its own colour — yellow, orange, red — mixed through the crown
            #if FALL_HUE == 1
              vec3 fall = vTree < 0.55 ? vec3(0.76, 0.13, 0.06) : vec3(0.86, 0.36, 0.05); // maple scarlet / flame
              fall = mix(fall, vec3(0.9, 0.55, 0.1), 0.3 * vnoise3(vWorldPos * 0.7));
            #elif FALL_HUE == 2
              vec3 fall = mix(vec3(0.88, 0.7, 0.14), vec3(0.74, 0.52, 0.08), vTree); // gold
              fall = mix(fall, vec3(0.62, 0.62, 0.2), 0.25 * vnoise3(vWorldPos * 0.7));
            #else
              vec3 fall = vTree < 0.4 ? vec3(0.78, 0.55, 0.08) : vTree < 0.75 ? vec3(0.8, 0.3, 0.06) : vec3(0.6, 0.1, 0.07);
              fall = mix(fall, vec3(0.72, 0.5, 0.1), 0.35 * vnoise3(vWorldPos * 0.7));
            #endif
            alb = mix(alb, fall * (0.8 + 0.4 * fbm3(vWorldPos * 0.9)), uAutumn * smoothstep(0.1, 0.5, vTree + 0.3));
          }
        #endif
        #ifdef BLOSSOM
          // spring: the crown a cloud of pink, flecked white, clump by clump
          if (vLeafy > 0.5) alb = mix(alb, mix(vec3(0.96, 0.72, 0.8), vec3(0.98, 0.9, 0.92), vnoise3(vWorldPos * 2.3)) * (0.9 + 0.2 * fbm3(vWorldPos * 1.3)), uBloom * smoothstep(0.2, 0.5, vnoise3(vWorldPos * 1.6) * 0.8 + 0.3));
        #endif
        #ifdef PAVED
          alb = snowOn(alb, N, vWorldPos, snowKeep(alb));
        #else
          alb = snowOn(alb, N, vWorldPos, 0.9); // car roofs, bench seats, conifer tops
        #endif
        alb = pigment(alb, vWorldPos);
        // a crown is shaded by its sphere field + underside AO, not by its own low-poly lobes
        // (their outlines shadowed each other into shards); buildings still shadow it
        float sh = shadowAt(vWorldPos + uKeyDir * uCrown.y * 0.7 * vLeafy, N);
        sh = mix(sh, 1.0, 0.3 * vLeafy);
        vec3 col = paintLight(alb * mix(0.8, 1.0, vAO), N, vWorldPos, sh, vAO);
        #ifdef EMISSIVE
          col += uEmissive * mix(1.0, uLampPower * 3.0, uEmNight);
        #endif
        #ifdef SIGNAL
          if (vSig > 0.75) col += normalize(vColor + 1e-3) * (0.9 + 2.2 * uNight); // the lit lens glows
        #endif
        gl_FragColor = vec4(applyFog(col, vWorldPos), 1.0);
      }`,
  });
  if (opts.paved) {
    // the far ribbons lie 6 cm over the ground: a kilometre out that is under one step of the depth
    // buffer, and ground and street would flicker through each other — pull the street forward a
    // few steps (constant in depth units, so metres far away and a hair up close)
    mat.polygonOffset = true;
    mat.polygonOffsetFactor = -1;
    mat.polygonOffsetUnits = -4;
  }
  return mat;
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
